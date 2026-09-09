import type { Field } from '@directus/types';

import type { ColumnPlan, MetadataAccess, SearchLeaf } from '../types';
import { resolveReadableFieldPath } from './field-path';

const NON_SEARCHABLE_TYPES = new Set([
	'alias',
	'binary',
	'geometry',
	'geometry.LineString',
	'geometry.MultiLineString',
	'geometry.MultiPoint',
	'geometry.MultiPolygon',
	'geometry.Point',
	'geometry.Polygon',
	'json',
	'presentation',
]);

export function buildColumnPlans(collection: string, visibleFields: string[], metadata: MetadataAccess): ColumnPlan[] {
	return visibleFields.map((key) => buildColumnPlan(collection, key, metadata)).filter(isColumnPlan);
}

export function buildColumnPlan(collection: string, key: string, metadata: MetadataAccess): ColumnPlan | null {
	const visibleField = metadata.getField(collection, key) ?? resolveReadableFieldPath(collection, key, metadata)?.field;
	if (!visibleField) return null;

	const rootFieldName = key.split('.')[0];
	if (!rootFieldName || !metadata.canReadField(collection, rootFieldName)) return null;

	const isRootRelation = !key.includes('.') && metadata.getRelationsForField(collection, key).length > 0;
	const candidates = isRootRelation ? getRelationalDisplayPaths(collection, key, visibleField, metadata) : [key];
	const resolved = candidates
		.map((path) => resolveReadableFieldPath(collection, path, metadata))
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	if (resolved.length === 0) {
		const fallback = resolveReadableFieldPath(collection, key, metadata);
		if (fallback) resolved.push(fallback);
	}

	return {
		key,
		fetchPaths: unique(resolved.map(({ path }) => path)),
		searchLeaves: uniqueLeaves(
			resolved
				.filter(({ field }) => isSearchable(field))
				.map(({ field, path }): SearchLeaf => ({ path, type: field.type })),
		),
	};
}

function getRelationalDisplayPaths(collection: string, key: string, field: Field, metadata: MetadataAccess): string[] {
	const displayFields = metadata
		.getDisplayFields(field)
		.filter((path) => path && !path.split('.').some((part) => part.startsWith('$')));
	if (displayFields.length > 0) return displayFields.map((path) => `${key}.${path}`);

	const relatedCollection = getDirectRelatedCollection(collection, key, metadata);
	if (!relatedCollection) return [key];

	const primaryKey = metadata.getPrimaryKeyField(relatedCollection);
	return primaryKey ? [`${key}.${primaryKey.field}`] : [key];
}

function getDirectRelatedCollection(collection: string, field: string, metadata: MetadataAccess): string | null {
	const relations = metadata.getRelationsForField(collection, field);
	const manyToOne = relations.find((relation) => relation.collection === collection && relation.field === field);
	if (manyToOne?.related_collection) return manyToOne.related_collection;

	const oneToMany = relations.find(
		(relation) => relation.related_collection === collection && relation.meta?.one_field === field,
	);
	return oneToMany?.collection ?? null;
}

function isSearchable(field: Field): boolean {
	return !NON_SEARCHABLE_TYPES.has(field.type) && !field.meta?.special?.includes('no-data');
}

function isColumnPlan(plan: ColumnPlan | null): plan is ColumnPlan {
	return plan !== null;
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function uniqueLeaves(values: SearchLeaf[]): SearchLeaf[] {
	const seen = new Set<string>();
	return values.filter((leaf) => {
		const key = `${leaf.path}:${leaf.type}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
