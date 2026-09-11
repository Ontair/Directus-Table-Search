import type { Field, Relation } from '@directus/types';
import { beforeAll, describe, expect, it } from 'vitest';

import { createDirectusMetadataAccess } from '../../src/services/directus-metadata';
import { buildColumnPlans } from '../../src/utils/column-plan';
import { buildDisplayQuery } from '../../src/utils/display-query';
import { buildColumnFilters, buildGlobalSearchFilter, combineFilters } from '../../src/utils/filter';
import { getValueAtPath } from '../../src/utils/object';

const baseUrl = process.env.DIRECTUS_URL ?? 'http://127.0.0.1:8055';
const adminEmail = requiredEnvironment('DIRECTUS_ADMIN_EMAIL');
const adminPassword = requiredEnvironment('DIRECTUS_ADMIN_PASSWORD');
const restrictedEmail = process.env.DIRECTUS_RESTRICTED_EMAIL ?? 'table-search-test@otm.io';
const restrictedPassword = process.env.DIRECTUS_RESTRICTED_PASSWORD ?? 'table-search-local-only';
const testRestrictedPermissions = process.env.DIRECTUS_TEST_RESTRICTED_PERMISSIONS !== 'false';
const expectRowPermissionRules =
	testRestrictedPermissions && process.env.DIRECTUS_EXPECT_ROW_PERMISSION_RULES !== 'false';

const collections = {
	articles: 'table_search_it_articles',
	authors: 'table_search_it_authors',
	comments: 'table_search_it_comments',
	junction: 'table_search_it_articles_tags',
	tags: 'table_search_it_tags',
} as const;

let admin: DirectusClient;
let restricted: DirectusClient | undefined;
let fixtures: FixtureIds;

describe('Directus filter integration', () => {
	beforeAll(async () => {
		admin = await DirectusClient.login(adminEmail, adminPassword);
		fixtures = await ensureFixture(admin);
		if (testRestrictedPermissions) {
			restricted = await DirectusClient.login(restrictedEmail, restrictedPassword);
		}
	});

	it('executes generated M2O, O2M, M2M and system-user display filters', async () => {
		const metadata = await loadMetadata(admin);
		const cases = [
			{ field: 'author', term: 'Ada Lovelace', slug: 'article-01' },
			{ field: 'comments', term: 'nested-comment-needle', slug: 'article-01' },
			{ field: 'tags', term: 'Relational Search', slug: 'article-01' },
			{ field: 'editor', term: fixtures.restrictedFirstName, slug: 'article-01' },
		];

		for (const testCase of cases) {
			const plans = buildColumnPlans(collections.articles, [testCase.field], metadata);
			const filter = buildGlobalSearchFilter(plans, testCase.term);
			const response = await admin.getItems(collections.articles, {
				fields: ['id', 'slug'],
				filter,
			});
			expect(response.status, `${testCase.field}: ${JSON.stringify(response.body)}`).toBe(200);
			expect(response.data.map((item) => item.slug)).toContain(testCase.slug);
		}
	});

	it('reads explicitly selected fields through O2M and M2M response arrays', async () => {
		const response = await admin.getItems(collections.articles, {
			fields: ['slug', 'comments.body', 'tags.tags_id.name'],
			filter: { slug: { _eq: 'article-01' } },
		});

		expect(response.status, JSON.stringify(response.body)).toBe(200);
		const [article] = response.data;
		expect(article).toBeDefined();
		expect(getValueAtPath(article!, 'comments.body')).toEqual(['nested-comment-needle']);
		expect(getValueAtPath(article!, 'tags.tags_id.name')).toEqual(['Relational Search']);
	});

	it('isolates repeated relational roots with the same alias strategy as Directus Table', async () => {
		const metadata = await loadMetadata(admin);
		const visibleFields = ['slug', 'editor', 'editor.first_name', 'tags.tags_id.name', 'tags.tags_id.id'];
		const displayQuery = buildDisplayQuery(collections.articles, visibleFields, metadata);
		const response = await admin.getItems(collections.articles, {
			alias: displayQuery.alias,
			fields: displayQuery.fields,
			filter: { slug: { _eq: 'article-01' } },
		});

		expect(response.status, JSON.stringify(response.body)).toBe(200);
		const [article] = response.data;
		expect(article).toBeDefined();
		expect(getValueAtPath(article!, displayQuery.valuePaths['editor.first_name']!)).toBe(fixtures.restrictedFirstName);
		expect(getValueAtPath(article!, displayQuery.valuePaths['tags.tags_id.name']!)).toEqual(['Relational Search']);
		expect(getValueAtPath(article!, displayQuery.valuePaths['tags.tags_id.id']!)).toEqual([fixtures.relationTagId]);
	});

	it('preserves an existing filter when generated visible-column search is active', async () => {
		const metadata = await loadMetadata(admin);
		const plans = buildColumnPlans(collections.articles, ['title'], metadata);
		const filter = combineFilters({ status: { _eq: 'published' } }, buildGlobalSearchFilter(plans, 'Guide'));
		const response = await admin.getItems(collections.articles, {
			fields: ['slug', 'status', 'title'],
			filter,
		});

		expect(response.status).toBe(200);
		expect(response.data).toEqual([
			expect.objectContaining({ slug: 'article-01', status: 'published', title: 'Visible Search Guide' }),
		]);
	});

	it('executes exact column filters for every supported scalar family', async () => {
		const metadata = await loadMetadata(admin);
		const cases = [
			{ field: 'rank', term: '1', slug: 'article-01' },
			{ field: 'reference_number', term: '9007199254740993', slug: 'article-01' },
			{ field: 'amount', term: '1234.56789', slug: 'article-01' },
			{ field: 'ratio', term: '1.25', slug: 'article-01' },
			{ field: 'active', term: 'true', slug: 'article-01' },
			{ field: 'active', term: 'false', slug: 'article-02' },
			{ field: 'published_on', term: '2026-09-10', slug: 'article-01' },
			{ field: 'starts_at', term: '2026-09-10T12:34:00', slug: 'article-01' },
			{ field: 'opens_at', term: '12:34:00', slug: 'article-01' },
			{ field: 'external_id', term: '123e4567-e89b-42d3-a456-426614174000', slug: 'article-01' },
		];

		for (const testCase of cases) {
			const plans = buildColumnPlans(collections.articles, [testCase.field], metadata);
			const filter = buildColumnFilters(plans, { [testCase.field]: testCase.term });
			const response = await admin.getItems(collections.articles, {
				fields: ['slug'],
				filter,
			});

			expect(response.status, `${testCase.field}: ${JSON.stringify(response.body)}`).toBe(200);
			expect(
				response.data.map((item) => item.slug),
				testCase.field,
			).toContain(testCase.slug);
		}
	});

	it('keeps server pagination and sorting stable', async () => {
		const firstPage = await admin.getItems(collections.articles, {
			fields: ['id', 'rank', 'slug'],
			limit: 5,
			page: 1,
			sort: ['-rank'],
		});
		const secondPage = await admin.getItems(collections.articles, {
			fields: ['id', 'rank', 'slug'],
			limit: 5,
			page: 2,
			sort: ['-rank'],
		});

		expect(firstPage.status).toBe(200);
		expect(secondPage.status).toBe(200);
		expect(firstPage.data.map((item) => item.rank)).toEqual([30, 29, 28, 27, 26]);
		expect(secondPage.data.map((item) => item.rank)).toEqual([25, 24, 23, 22, 21]);
		expect(new Set([...firstPage.data, ...secondPage.data].map((item) => item.id)).size).toBe(10);
	});

	it.runIf(testRestrictedPermissions)(
		'generates a working restricted query without forbidden relational display fields',
		async () => {
			if (!restricted) throw new Error('Restricted client was not initialized');
			const metadata = await loadMetadata(restricted);
			const plans = buildColumnPlans(collections.articles, ['author'], metadata);
			const [authorPlan] = plans;

			expect(authorPlan?.searchLeaves.map(({ path }) => path)).not.toContain('author.code');
			expect(authorPlan?.searchLeaves.map(({ path }) => path)).toContain('author.name');

			const safeFilter = buildGlobalSearchFilter(plans, 'Ada Lovelace');
			const safeResponse = await restricted.getItems(collections.articles, {
				fields: ['id', 'slug', 'author.name'],
				filter: safeFilter,
			});
			expect(safeResponse.status, JSON.stringify(safeResponse.body)).toBe(200);
			expect(safeResponse.data.map((item) => item.slug)).toContain('article-01');

			const forbiddenResponse = await restricted.getItems(collections.articles, {
				fields: ['id'],
				filter: { author: { code: { _icontains: 'analytical' } } },
			});
			expect(forbiddenResponse.status).toBe(403);
		},
	);

	it.runIf(expectRowPermissionRules)(
		'enforces the restricted row permission independently of generated filters',
		async () => {
			if (!restricted) throw new Error('Restricted client was not initialized');
			const response = await restricted.getItems(collections.articles, {
				fields: ['slug', 'status'],
				limit: -1,
				sort: ['rank'],
			});

			expect(response.status).toBe(200);
			expect(response.data.length).toBeGreaterThan(0);
			expect(response.data.every((item) => item.status === 'published')).toBe(true);
			expect(response.data.map((item) => item.slug)).not.toContain('article-02');
		},
	);
});

interface FixtureIds {
	relationTagId: number;
	restrictedFirstName: string;
}

interface QueryOptions {
	alias?: Record<string, string>;
	fields?: string[];
	filter?: Record<string, unknown> | null;
	limit?: number;
	page?: number;
	sort?: string[];
}

interface ApiResponse<T = Record<string, any>> {
	body: any;
	data: T[];
	status: number;
}

class DirectusClient {
	private constructor(private readonly token: string) {}

	static async login(email: string, password: string): Promise<DirectusClient> {
		const response = await fetch(`${baseUrl}/auth/login`, {
			body: JSON.stringify({ email, password }),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		});
		const body = await response.json();
		if (!response.ok) throw new Error(`Directus login failed (${response.status}): ${JSON.stringify(body)}`);
		return new DirectusClient(body.data.access_token as string);
	}

	async request<T = Record<string, any>>(
		path: string,
		options: { body?: unknown; method?: string; query?: Record<string, string> } = {},
	): Promise<{ body: any; data: T; status: number }> {
		const url = new URL(path, baseUrl);
		for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
		const init: RequestInit = {
			headers: {
				authorization: `Bearer ${this.token}`,
				...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
			},
			method: options.method ?? 'GET',
		};
		if (options.body !== undefined) init.body = JSON.stringify(options.body);
		const response = await fetch(url, init);
		const text = await response.text();
		const body = text ? JSON.parse(text) : null;
		return { body, data: body?.data as T, status: response.status };
	}

	async getItems(collection: string, options: QueryOptions): Promise<ApiResponse> {
		const query: Record<string, string> = {};
		for (const [alias, field] of Object.entries(options.alias ?? {})) query[`alias[${alias}]`] = field;
		if (options.fields) query.fields = options.fields.join(',');
		if (options.filter) query.filter = JSON.stringify(options.filter);
		if (options.limit !== undefined) query.limit = String(options.limit);
		if (options.page !== undefined) query.page = String(options.page);
		if (options.sort) query.sort = options.sort.join(',');

		const response = await this.request<Record<string, any>[]>(`/items/${collection}`, { query });
		return { ...response, data: response.data ?? [] };
	}
}

async function ensureFixture(client: DirectusClient): Promise<FixtureIds> {
	await ensureCollection(client, collections.authors, {
		displayTemplate: '{{ name }}',
		fields: [stringField('slug'), stringField('name'), stringField('code')],
	});
	await ensureCollection(client, collections.tags, {
		displayTemplate: '{{ name }}',
		fields: [stringField('slug'), stringField('name')],
	});
	await ensureCollection(client, collections.articles, {
		displayTemplate: '{{ title }}',
		fields: [
			stringField('slug'),
			stringField('title'),
			stringField('status'),
			integerField('rank'),
			integerField('sort'),
			scalarField('reference_number', 'bigInteger'),
			scalarField('amount', 'decimal', { numericPrecision: 20, numericScale: 5 }),
			scalarField('ratio', 'float'),
			scalarField('active', 'boolean'),
			scalarField('published_on', 'date'),
			scalarField('starts_at', 'dateTime'),
			scalarField('opens_at', 'time'),
			scalarField('external_id', 'uuid'),
			relationField('author', 'integer', 'related-values', { template: '{{ name }} ({{ code }})' }),
			relationField('editor', 'uuid', 'user'),
		],
		sortField: 'sort',
	});
	for (const field of [
		scalarField('reference_number', 'bigInteger'),
		scalarField('amount', 'decimal', { numericPrecision: 20, numericScale: 5 }),
		scalarField('ratio', 'float'),
		scalarField('active', 'boolean'),
		scalarField('published_on', 'date'),
		scalarField('starts_at', 'dateTime'),
		scalarField('opens_at', 'time'),
		scalarField('external_id', 'uuid'),
	]) {
		await ensureField(client, collections.articles, field);
	}
	await ensureCollection(client, collections.comments, {
		displayTemplate: '{{ body }}',
		fields: [stringField('slug'), { ...stringField('body'), type: 'text' }, relationField('article_id', 'integer')],
	});
	await ensureCollection(client, collections.junction, {
		fields: [relationField('articles_id', 'integer'), relationField('tags_id', 'integer')],
	});

	await ensureAliasField(client, collections.articles, 'comments', ['o2m'], 'list-o2m', '{{ body }}');
	await ensureAliasField(client, collections.articles, 'tags', ['m2m'], 'list-m2m', '{{ tags_id.name }}');
	await ensureRelation(client, collections.articles, 'author', collections.authors);
	await ensureRelation(client, collections.articles, 'editor', 'directus_users');
	await ensureRelation(client, collections.comments, 'article_id', collections.articles, { oneField: 'comments' });
	await ensureRelation(client, collections.junction, 'articles_id', collections.articles, {
		junctionField: 'tags_id',
		oneField: 'tags',
	});
	await ensureRelation(client, collections.junction, 'tags_id', collections.tags, {
		junctionField: 'articles_id',
	});

	const restrictedUser = await ensureRestrictedAccess(client);
	const ada = await ensureItem(client, collections.authors, 'ada', {
		code: 'analytical-engine',
		name: 'Ada Lovelace',
	});
	const grace = await ensureItem(client, collections.authors, 'grace', {
		code: 'compiler-pioneer',
		name: 'Grace Hopper',
	});
	const relationTag = await ensureItem(client, collections.tags, 'relational', { name: 'Relational Search' });
	await ensureItem(client, collections.tags, 'history', { name: 'History' });

	const articleIds: number[] = [];
	for (let rank = 1; rank <= 30; rank += 1) {
		const slug = `article-${String(rank).padStart(2, '0')}`;
		const article = await ensureItem(client, collections.articles, slug, {
			active: rank % 2 === 1,
			amount: rank === 1 ? '1234.56789' : String(rank),
			author: rank === 1 ? ada.id : grace.id,
			editor: rank === 1 ? restrictedUser.id : null,
			external_id: rank === 1 ? '123e4567-e89b-42d3-a456-426614174000' : null,
			opens_at: rank === 1 ? '12:34:00' : null,
			published_on: rank === 1 ? '2026-09-10' : null,
			rank,
			ratio: rank === 1 ? 1.25 : rank,
			reference_number: rank === 1 ? '9007199254740993' : String(9_007_199_254_740_000n + BigInt(rank)),
			sort: rank,
			starts_at: rank === 1 ? '2026-09-10T12:34:00' : null,
			status: rank === 2 || rank % 3 === 0 ? 'draft' : 'published',
			title: rank === 1 ? 'Visible Search Guide' : rank === 2 ? 'Guide Draft' : `Article ${rank}`,
		});
		articleIds.push(article.id as number);
	}

	await ensureItem(client, collections.comments, 'needle', {
		article_id: articleIds[0],
		body: 'nested-comment-needle',
	});
	await ensureJunctionItem(client, articleIds[0]!, relationTag.id as number);

	return {
		relationTagId: relationTag.id as number,
		restrictedFirstName: restrictedUser.first_name as string,
	};
}

async function ensureCollection(
	client: DirectusClient,
	collection: string,
	options: { displayTemplate?: string; fields: Record<string, unknown>[]; sortField?: string },
): Promise<void> {
	const current = await client.request(`/collections/${collection}`);
	if (current.status === 200) return;
	const created = await client.request('/collections', {
		body: {
			collection,
			fields: options.fields,
			meta: {
				display_template: options.displayTemplate ?? null,
				icon: 'science',
				note: 'Local integration fixture for directus-extension-table-search',
				sort_field: options.sortField ?? null,
			},
			schema: { name: collection },
		},
		method: 'POST',
	});
	assertSuccess(created, `create collection ${collection}`);
}

async function ensureAliasField(
	client: DirectusClient,
	collection: string,
	field: string,
	special: string[],
	interfaceId: string,
	template: string,
): Promise<void> {
	const current = await client.request(`/fields/${collection}/${field}`);
	if (current.status === 200) return;
	const created = await client.request(`/fields/${collection}`, {
		body: {
			field,
			meta: {
				display: 'related-values',
				display_options: { template },
				interface: interfaceId,
				special,
			},
			type: 'alias',
		},
		method: 'POST',
	});
	assertSuccess(created, `create alias ${collection}.${field}`);
}

async function ensureField(
	client: DirectusClient,
	collection: string,
	definition: Record<string, unknown>,
): Promise<void> {
	const field = definition.field;
	if (typeof field !== 'string') throw new Error('Integration field definition must have a name');

	const current = await client.request(`/fields/${collection}/${field}`);
	if (current.status === 200) return;
	assertSuccess(
		await client.request(`/fields/${collection}`, { body: definition, method: 'POST' }),
		`create field ${collection}.${field}`,
	);
}

async function ensureRelation(
	client: DirectusClient,
	collection: string,
	field: string,
	relatedCollection: string,
	options: { junctionField?: string; oneField?: string } = {},
): Promise<void> {
	const current = await client.request(`/relations/${collection}/${field}`);
	if (current.status === 200) return;
	const created = await client.request('/relations', {
		body: {
			collection,
			field,
			meta: {
				junction_field: options.junctionField ?? null,
				one_field: options.oneField ?? null,
			},
			related_collection: relatedCollection,
			schema: { on_delete: 'SET NULL' },
		},
		method: 'POST',
	});
	assertSuccess(created, `create relation ${collection}.${field}`);
}

async function ensureRestrictedAccess(client: DirectusClient): Promise<Record<string, any>> {
	const role = await ensureSystemItem(client, 'roles', 'name', 'Table Search Integration Role', {
		icon: 'manage_search',
		name: 'Table Search Integration Role',
	});
	const policy = await ensureSystemItem(client, 'policies', 'name', 'Table Search Integration Policy', {
		admin_access: false,
		app_access: true,
		icon: 'manage_search',
		name: 'Table Search Integration Policy',
	});

	const accessRows = await client.request<Record<string, any>[]>('/access', {
		query: { filter: JSON.stringify({ _and: [{ role: { _eq: role.id } }, { policy: { _eq: policy.id } }] }) },
	});
	if (!accessRows.data?.length) {
		assertSuccess(
			await client.request('/access', { body: { policy: policy.id, role: role.id }, method: 'POST' }),
			'create policy access',
		);
	}

	const user = await ensureSystemItem(client, 'users', 'email', restrictedEmail, {
		email: restrictedEmail,
		first_name: 'RestrictedSearch',
		last_name: 'Tester',
		password: restrictedPassword,
		role: role.id,
		status: 'active',
	});
	if (!testRestrictedPermissions) return user;

	const readRules = [
		[
			collections.articles,
			['id', 'slug', 'title', 'status', 'rank', 'sort', 'author', 'comments', 'tags', 'editor'],
			expectRowPermissionRules ? { status: { _eq: 'published' } } : null,
		],
		[collections.authors, ['id', 'slug', 'name'], null],
		[collections.comments, ['id', 'slug', 'body', 'article_id'], null],
		[collections.junction, ['id', 'articles_id', 'tags_id'], null],
		[collections.tags, ['id', 'slug', 'name'], null],
		[
			'directus_users',
			['id', 'first_name', 'last_name'],
			expectRowPermissionRules ? { id: { _eq: '$CURRENT_USER' } } : null,
		],
	] as const;

	for (const [collection, fields, permissions] of readRules) {
		const existing = await client.request<Record<string, any>[]>('/permissions', {
			query: {
				filter: JSON.stringify({
					_and: [{ policy: { _eq: policy.id } }, { collection: { _eq: collection } }, { action: { _eq: 'read' } }],
				}),
			},
		});
		if (existing.data?.length) continue;

		assertSuccess(
			await client.request('/permissions', {
				body: { action: 'read', collection, fields, permissions, policy: policy.id },
				method: 'POST',
			}),
			`create permission ${collection}.read`,
		);
	}

	return user;
}

async function ensureSystemItem(
	client: DirectusClient,
	endpoint: string,
	field: string,
	value: string,
	data: Record<string, unknown>,
): Promise<Record<string, any>> {
	const current = await client.request<Record<string, any>[]>(`/${endpoint}`, {
		query: { filter: JSON.stringify({ [field]: { _eq: value } }), limit: '1' },
	});
	if (current.data?.[0]) return current.data[0];
	const created = await client.request<Record<string, any>>(`/${endpoint}`, { body: data, method: 'POST' });
	assertSuccess(created, `create ${endpoint}`);
	return created.data;
}

async function ensureItem(
	client: DirectusClient,
	collection: string,
	slug: string,
	data: Record<string, unknown>,
): Promise<Record<string, any>> {
	const current = await client.getItems(collection, { fields: ['*'], filter: { slug: { _eq: slug } }, limit: 1 });
	if (current.data[0]) {
		const updated = await client.request<Record<string, any>>(`/items/${collection}/${current.data[0].id}`, {
			body: data,
			method: 'PATCH',
		});
		assertSuccess(updated, `update item ${collection}/${slug}`);
		return updated.data;
	}
	const created = await client.request<Record<string, any>>(`/items/${collection}`, {
		body: { ...data, slug },
		method: 'POST',
	});
	assertSuccess(created, `create item ${collection}/${slug}`);
	return created.data;
}

async function ensureJunctionItem(client: DirectusClient, articleId: number, tagId: number): Promise<void> {
	const current = await client.getItems(collections.junction, {
		filter: { _and: [{ articles_id: { _eq: articleId } }, { tags_id: { _eq: tagId } }] },
		limit: 1,
	});
	if (current.data.length > 0) return;
	assertSuccess(
		await client.request(`/items/${collections.junction}`, {
			body: { articles_id: articleId, tags_id: tagId },
			method: 'POST',
		}),
		'create junction item',
	);
}

async function loadMetadata(client: DirectusClient) {
	const [fieldsResponse, relationsResponse, permissionsResponse] = await Promise.all([
		client.request<Field[]>('/fields'),
		client.request<Relation[]>('/relations'),
		client.request<Record<string, Record<string, any>>>('/permissions/me'),
	]);
	assertSuccess(fieldsResponse, 'read fields');
	assertSuccess(relationsResponse, 'read relations');
	assertSuccess(permissionsResponse, 'read permissions');

	const fields = fieldsResponse.data;
	const relations = relationsResponse.data;
	const permissions = permissionsResponse.data;

	return createDirectusMetadataAccess({
		displays: () => [
			{
				id: 'related-values',
				fields: (options) => extractTemplateFields(typeof options?.template === 'string' ? options.template : ''),
			},
			{
				id: 'user',
				fields: ['id', 'avatar.id', 'avatar.modified_on', 'email', 'first_name', 'last_name'],
			},
		],
		fieldsStore: {
			getField: (collection, field) =>
				fields.find((entry) => entry.collection === collection && entry.field === field) ?? null,
			getPrimaryKeyFieldForCollection: (collection) =>
				fields.find((entry) => entry.collection === collection && entry.schema?.is_primary_key) ?? null,
		},
		permissionsStore: {
			getPermission: (collection, action) => permissions[collection]?.[action] ?? null,
			hasPermission: (collection, action) => {
				const permission = permissions[collection]?.[action];
				return permission ? permission.access !== 'none' : permissionsResponse.status === 200;
			},
		},
		relationsStore: {
			getRelationsForField: (collection, field) => getRelationsForField(relations, collection, field),
		},
	});
}

function getRelationsForField(relations: Relation[], collection: string, field: string): Relation[] {
	const applicable = relations.filter(
		(relation) =>
			(relation.collection === collection && relation.field === field) ||
			(relation.related_collection === collection && relation.meta?.one_field === field),
	);
	const first = applicable[0];
	if (!first?.meta?.junction_field) return applicable;

	const secondary = relations.find(
		(relation) =>
			relation.collection === first.collection &&
			relation.field === first.meta?.junction_field &&
			relation.meta?.junction_field === first.field,
	);
	return secondary ? [...applicable, secondary] : applicable;
}

function extractTemplateFields(template: string): string[] {
	return [...template.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1]!).filter(Boolean);
}

function stringField(field: string): Record<string, unknown> {
	return { field, meta: { interface: 'input' }, schema: { is_nullable: false }, type: 'string' };
}

function integerField(field: string): Record<string, unknown> {
	return { field, meta: { interface: 'input' }, schema: { is_nullable: false }, type: 'integer' };
}

function scalarField(
	field: string,
	type: 'bigInteger' | 'boolean' | 'date' | 'dateTime' | 'decimal' | 'float' | 'time' | 'uuid',
	options: { numericPrecision?: number; numericScale?: number } = {},
): Record<string, unknown> {
	return {
		field,
		meta: { interface: type === 'boolean' ? 'boolean' : type === 'date' || type === 'dateTime' ? 'datetime' : 'input' },
		schema: {
			is_nullable: true,
			numeric_precision: options.numericPrecision,
			numeric_scale: options.numericScale,
		},
		type,
	};
}

function relationField(
	field: string,
	type: 'integer' | 'uuid',
	display?: string,
	displayOptions?: Record<string, unknown>,
): Record<string, unknown> {
	return {
		field,
		meta: {
			display: display ?? null,
			display_options: displayOptions ?? null,
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
		},
		schema: { is_nullable: true },
		type,
	};
}

function assertSuccess(response: { body: any; status: number }, operation: string): void {
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`${operation} failed (${response.status}): ${JSON.stringify(response.body)}`);
	}
}

function requiredEnvironment(key: string): string {
	const value = process.env[key];
	if (!value) throw new Error(`${key} is required for Directus integration tests`);
	return value;
}
