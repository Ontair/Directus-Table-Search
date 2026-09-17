import type { Field } from '@directus/types';

import type { ColumnPlan, MetadataAccess, ResolvedFieldPath, SearchLeaf } from '../types';
import { getReadableDisplayPaths } from './display-path';
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
	'hash',
	'json',
	'presentation',
	'unknown',
]);
const NON_SEARCHABLE_SPECIALS = new Set(['conceal', 'hash', 'no-data']);

export function buildColumnPlans(collection: string, visibleFields: string[], metadata: MetadataAccess): ColumnPlan[] {
	return visibleFields.map((key) => buildColumnPlan(collection, key, metadata)).filter(isColumnPlan);
}

export function buildColumnPlan(collection: string, key: string, metadata: MetadataAccess): ColumnPlan | null {
	const resolvedVisibleField = resolveReadableFieldPath(collection, key, metadata);
	const visibleField = metadata.getField(collection, key) ?? resolvedVisibleField?.field;
	if (!visibleField) return null;

	const rootFieldName = key.split('.')[0];
	if (!rootFieldName || !metadata.canReadField(collection, rootFieldName)) {
		return buildGuardOnlyPlan(collection, key, metadata);
	}

	const isRootRelation = !key.includes('.') && metadata.getRelationsForField(collection, key).length > 0;
	const candidates = isRootRelation ? getRelationalDisplayPaths(collection, key, visibleField, metadata) : [key];
	const resolved = candidates
		.map((path) => resolveReadableFieldPath(collection, path, metadata))
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	if (resolved.length === 0) {
		const fallback = resolveReadableFieldPath(collection, key, metadata);
		if (fallback) resolved.push(fallback);
	}

	const searchLeaves = uniqueLeaves(
		resolved
			.filter(({ field }) => isSearchable(field))
			.map(({ field, path }): SearchLeaf => ({ path, type: field.type })),
	);

	const guardPath = searchLeaves.length === 0 ? getGuardPath(collection, resolvedVisibleField, metadata) : null;

	return {
		...(guardPath ? { guardPath } : {}),
		key,
		searchLeaves,
	};
}

function buildGuardOnlyPlan(collection: string, key: string, metadata: MetadataAccess): ColumnPlan {
	const guardPath = getGuardPath(collection, null, metadata);
	return { ...(guardPath ? { guardPath } : {}), key, searchLeaves: [] };
}

/**
 * A column without searchable leaves still has to express "this term cannot
 * match"; without an anchor the generated query would carry no condition at
 * all and expose every row. The resolved column path is the most precise
 * anchor, but it is missing whenever that path is itself unreadable or
 * dynamic, so the collection's primary key takes over: a role that may read
 * the collection may always read it.
 */
function getGuardPath(
	collection: string,
	resolved: ResolvedFieldPath | null | undefined,
	metadata: MetadataAccess,
): string | null {
	return resolved?.path ?? metadata.getPrimaryKeyField(collection)?.field ?? null;
}

function getRelationalDisplayPaths(collection: string, key: string, field: Field, metadata: MetadataAccess): string[] {
	const displayFields = getReadableDisplayPaths(collection, key, metadata);
	if (metadata.getDisplayFields(field).length > 0) return displayFields;

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
	return (
		!NON_SEARCHABLE_TYPES.has(field.type) &&
		!(field.meta?.special ?? []).some((special) => NON_SEARCHABLE_SPECIALS.has(special))
	);
}

function isColumnPlan(plan: ColumnPlan | null): plan is ColumnPlan {
	return plan !== null;
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
