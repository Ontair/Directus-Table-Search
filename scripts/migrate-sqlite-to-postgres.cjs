const fs = require('node:fs');
const path = require('node:path');

const CONFIRMATION = 'sqlite-to-postgres';
const SOURCE_PATH = process.env.SQLITE_SOURCE ?? '/source/database.sqlite';
const EXCLUDED_TABLES = new Set(['directus_migrations']);
const MAX_PARAMETERS_PER_INSERT = 20_000;

if (process.env.MIGRATION_CONFIRM !== CONFIRMATION) {
	throw new Error(`Refusing to replace PostgreSQL data without MIGRATION_CONFIRM=${CONFIRMATION}`);
}

if (!fs.existsSync(SOURCE_PATH)) {
	throw new Error(`SQLite source does not exist: ${SOURCE_PATH}`);
}

const sqlite3 = requirePnpmPackage('sqlite3');
const { Client } = requirePnpmPackage('pg');

function requirePnpmPackage(packageName) {
	const pnpmRoot = '/directus/node_modules/.pnpm';
	const packageDirectory = fs
		.readdirSync(pnpmRoot)
		.filter((entry) => entry.startsWith(`${packageName}@`))
		.sort()
		.at(-1);

	if (!packageDirectory) {
		throw new Error(`Package ${packageName} is not available in the Directus image`);
	}

	return require(path.join(pnpmRoot, packageDirectory, 'node_modules', packageName));
}

function quoteIdentifier(identifier) {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function openSqlite(filename) {
	return new Promise((resolve, reject) => {
		const database = new sqlite3.Database(filename, sqlite3.OPEN_READONLY, (error) => {
			if (error) reject(error);
			else resolve(database);
		});
	});
}

function sqliteAll(database, statement, parameters = []) {
	return new Promise((resolve, reject) => {
		database.all(statement, parameters, (error, rows) => {
			if (error) reject(error);
			else resolve(rows);
		});
	});
}

function closeSqlite(database) {
	return new Promise((resolve, reject) => {
		database.close((error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

async function getSourceTables(database) {
	const rows = await sqliteAll(
		database,
		`SELECT name
		 FROM sqlite_master
		 WHERE type = 'table'
		   AND name NOT LIKE 'sqlite_%'
		 ORDER BY name`,
	);

	return rows.map(({ name }) => name);
}

async function getTargetTables(client) {
	const { rows } = await client.query(
		`SELECT table_name
		 FROM information_schema.tables
		 WHERE table_schema = 'public'
		   AND table_type = 'BASE TABLE'
		 ORDER BY table_name`,
	);

	return rows.map(({ table_name }) => table_name);
}

async function getSourceColumns(database, table) {
	return sqliteAll(database, `PRAGMA table_info(${quoteIdentifier(table)})`);
}

async function getTargetColumns(client, table) {
	const { rows } = await client.query(
		`SELECT column_name, data_type, udt_name
		 FROM information_schema.columns
		 WHERE table_schema = 'public'
		   AND table_name = $1
		 ORDER BY ordinal_position`,
		[table],
	);

	return rows;
}

function convertValue(value, targetColumn) {
	if (value === null || value === undefined) return null;

	if (targetColumn.data_type === 'boolean') {
		if (value === true || value === 1 || value === '1' || value === 'true') return true;
		if (value === false || value === 0 || value === '0' || value === 'false') return false;
		throw new Error(`Cannot convert ${JSON.stringify(value)} to boolean for ${targetColumn.column_name}`);
	}

	if (targetColumn.data_type === 'json' || targetColumn.data_type === 'jsonb') {
		if (typeof value !== 'string') return JSON.stringify(value);
		JSON.parse(value);
		return value;
	}

	return value;
}

async function insertRows(client, table, columns, rows) {
	if (rows.length === 0) return;

	const quotedColumns = columns.map(({ column_name }) => quoteIdentifier(column_name)).join(', ');
	const batchSize = Math.max(1, Math.floor(MAX_PARAMETERS_PER_INSERT / columns.length));

	for (let offset = 0; offset < rows.length; offset += batchSize) {
		const batch = rows.slice(offset, offset + batchSize);
		const parameters = [];
		const tuples = batch.map((row) => {
			const placeholders = columns.map((column) => {
				parameters.push(convertValue(row[column.column_name], column));
				return `$${parameters.length}`;
			});

			return `(${placeholders.join(', ')})`;
		});

		await client.query(
			`INSERT INTO ${quoteIdentifier(table)} (${quotedColumns}) VALUES ${tuples.join(', ')}`,
			parameters,
		);
	}
}

async function resetSequences(client) {
	const { rows: sequences } = await client.query(
		`SELECT sequence_namespace.nspname AS sequence_schema,
		        sequence.relname AS sequence_name,
		        table_namespace.nspname AS table_schema,
		        table_class.relname AS table_name,
		        attribute.attname AS column_name
		 FROM pg_class AS sequence
		 JOIN pg_namespace AS sequence_namespace ON sequence_namespace.oid = sequence.relnamespace
		 JOIN pg_depend AS dependency ON dependency.objid = sequence.oid
		 JOIN pg_class AS table_class ON table_class.oid = dependency.refobjid
		 JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
		 JOIN pg_attribute AS attribute
		   ON attribute.attrelid = table_class.oid
		  AND attribute.attnum = dependency.refobjsubid
		 WHERE sequence.relkind = 'S'
		   AND sequence_namespace.nspname = 'public'
		   AND dependency.deptype IN ('a', 'i')`,
	);

	for (const sequence of sequences) {
		const sequenceName = `${quoteIdentifier(sequence.sequence_schema)}.${quoteIdentifier(sequence.sequence_name)}`;
		const tableName = `${quoteIdentifier(sequence.table_schema)}.${quoteIdentifier(sequence.table_name)}`;
		const columnName = quoteIdentifier(sequence.column_name);

		await client.query(
			`SELECT setval($1::regclass, COALESCE(MAX(${columnName}), 1), MAX(${columnName}) IS NOT NULL)
			 FROM ${tableName}`,
			[sequenceName],
		);
	}
}

async function migrate() {
	const source = await openSqlite(SOURCE_PATH);
	const target = new Client();
	await target.connect();

	try {
		const integrity = await sqliteAll(source, 'PRAGMA integrity_check');
		if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
			throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrity)}`);
		}

		const sourceTables = await getSourceTables(source);
		const targetTableSet = new Set(await getTargetTables(target));
		const missingTables = sourceTables.filter((table) => !targetTableSet.has(table));

		if (missingTables.length > 0) {
			throw new Error(`PostgreSQL schema is missing tables: ${missingTables.join(', ')}`);
		}

		const tables = sourceTables.filter((table) => !EXCLUDED_TABLES.has(table));
		const migrationPlan = [];

		for (const table of tables) {
			const sourceColumns = await getSourceColumns(source, table);
			const sourceColumnSet = new Set(sourceColumns.map(({ name }) => name));
			const targetColumns = await getTargetColumns(target, table);
			const columns = targetColumns.filter(({ column_name }) => sourceColumnSet.has(column_name));

			if (columns.length === 0) {
				throw new Error(`No shared columns found for ${table}`);
			}

			const rows = await sqliteAll(
				source,
				`SELECT ${columns.map(({ column_name }) => quoteIdentifier(column_name)).join(', ')}
				 FROM ${quoteIdentifier(table)}`,
			);

			migrationPlan.push({ table, columns, rows });
		}

		await target.query('BEGIN');

		try {
			await target.query('SET LOCAL session_replication_role = replica');
			await target.query(
				`TRUNCATE TABLE ${tables.map((table) => quoteIdentifier(table)).join(', ')} RESTART IDENTITY CASCADE`,
			);

			for (const entry of migrationPlan) {
				await insertRows(target, entry.table, entry.columns, entry.rows);
				process.stdout.write(`Migrated ${entry.table}: ${entry.rows.length}\n`);
			}

			await resetSequences(target);

			for (const entry of migrationPlan) {
				const { rows } = await target.query(`SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(entry.table)}`);

				if (rows[0].count !== entry.rows.length) {
					throw new Error(
						`Row count mismatch for ${entry.table}: SQLite=${entry.rows.length}, PostgreSQL=${rows[0].count}`,
					);
				}
			}

			await target.query('COMMIT');
		} catch (error) {
			await target.query('ROLLBACK');
			throw error;
		}

		process.stdout.write(`Migration completed: ${migrationPlan.length} tables verified.\n`);
	} finally {
		await Promise.allSettled([closeSqlite(source), target.end()]);
	}
}

migrate().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
