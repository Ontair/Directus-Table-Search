import type { MetadataAccess } from '../types';
import { getReadableDisplayPaths, removeVirtualSegments } from './display-path';

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

		const adjustedFields = getReadableDisplayPaths(collection, key, metadata);
		if (adjustedFields.length === 0) continue;
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

function getSimpleHash(value: string): string {
	let hash = 0;

	for (let index = 0; index < value.length; index += 1) {
		hash = 31 * hash + value.charCodeAt(index);
		hash |= 0;
	}

	return Math.abs(hash).toString(16);
}
