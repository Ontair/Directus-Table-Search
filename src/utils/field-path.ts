import type { Field, Relation } from '@directus/types';

import type { MetadataAccess, ResolvedFieldPath } from '../types';

/**
 * Resolve an API dot path through Directus relation metadata while checking
 * read access at every hop. This mirrors how Directus exposes M2O, O2M and M2M
 * paths without depending on collection names from a particular schema.
 */
export function resolveReadableFieldPath(
	rootCollection: string,
	path: string,
	metadata: MetadataAccess,
): ResolvedFieldPath | null {
	const segments = path.split('.').filter(Boolean);
	if (segments.length === 0 || segments.some((segment) => segment.startsWith('$') || segment.includes(':')))
		return null;

	let collection = rootCollection;
	let field: Field | null = null;

	for (const [index, segment] of segments.entries()) {
		field = metadata.getField(collection, segment);
		if (!field || !metadata.canReadField(collection, segment)) return null;

		if (index === segments.length - 1) break;

		const relatedCollection = getNextCollection(
			collection,
			segment,
			metadata.getRelationsForField(collection, segment),
		);
		if (!relatedCollection) return null;
		collection = relatedCollection;
	}

	return field ? { field, path } : null;
}

export function getNextCollection(collection: string, field: string, relations: Relation[]): string | null {
	const manyToOne = relations.find(
		(relation) => relation.collection === collection && relation.field === field && relation.related_collection,
	);

	if (manyToOne?.related_collection) return manyToOne.related_collection;

	const oneToMany = relations.find(
		(relation) => relation.related_collection === collection && relation.meta?.one_field === field,
	);

	return oneToMany?.collection ?? null;
}
