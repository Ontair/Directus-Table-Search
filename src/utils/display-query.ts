import type { MetadataAccess } from '../types';
import { resolveFieldPath } from './field-path';

export interface DisplayQuery {
	alias: Record<string, string>;
	fields: string[];
	valuePaths: Record<string, string>;
}

export function buildDisplayQuery(collection: string, visibleFields: string[], metadata: MetadataAccess): DisplayQuery {
	const rootCounts = countRootFields(visibleFields);
	const alias: Record<string, string> = {};
	const fields: string[] = [];
	const valuePaths: Record<string, string> = {};

	for (const key of visibleFields) {
		const root = getRootField(key);
		if (!root) continue;

		const adjustedFields = adjustFieldForDisplay(collection, key, metadata);
		if ((rootCounts[root] ?? 0) === 1) {
			fields.push(...adjustedFields);
			valuePaths[key] = removeVirtualSegments(key);
			continue;
		}

		const fieldAlias = getSimpleHash(key);
		alias[fieldAlias] = root;
		fields.push(...adjustedFields.map((field) => replaceRootField(field, fieldAlias)));
		valuePaths[key] = replaceRootField(removeVirtualSegments(key), fieldAlias);
	}

	return {
		alias,
		fields: [...new Set(fields)],
		valuePaths,
	};
}

function adjustFieldForDisplay(collection: string, key: string, metadata: MetadataAccess): string[] {
	const field = metadata.getField(collection, key) ?? resolveFieldPath(collection, key, metadata)?.field;
	if (!field || field.meta?.display === null) return [key];

	const displayFields = metadata.getDisplayFields(field);
	if (displayFields.length === 0) return [key];

	return displayFields.map((displayField) => {
		const path = `${key}.${displayField}`;
		if (field.collection !== 'directus_files' || !path.includes('$thumbnail')) return path;

		return path
			.split('.')
			.filter((segment) => segment !== '$thumbnail')
			.join('.');
	});
}

function countRootFields(fields: string[]): Record<string, number> {
	return fields.reduce<Record<string, number>>((counts, field) => {
		const root = getRootField(field);
		if (root) counts[root] = (counts[root] ?? 0) + 1;
		return counts;
	}, {});
}

function getRootField(field: string): string | undefined {
	return field.split('.')[0] || undefined;
}

function replaceRootField(field: string, replacement: string): string {
	const [, ...nestedPath] = field.split('.');
	return nestedPath.length > 0 ? `${replacement}.${nestedPath.join('.')}` : replacement;
}

function removeVirtualSegments(field: string): string {
	return field
		.split('.')
		.filter((segment) => !segment.startsWith('$'))
		.join('.');
}

function getSimpleHash(value: string): string {
	let hash = 0;

	for (let index = 0; index < value.length; index += 1) {
		hash = 31 * hash + value.charCodeAt(index);
		hash |= 0;
	}

	return Math.abs(hash).toString(16);
}
