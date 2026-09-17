import type { MetadataAccess } from '../types';
import { resolveFieldPath, resolveReadableFieldPath } from './field-path';

/**
 * Build the API field paths required by the configured Directus display.
 *
 * Display definitions may contain virtual path segments such as `$thumbnail`.
 * Those segments affect rendering but are not real API/schema fields, so they
 * are removed before the path is validated and sent to Directus.
 */
export function getReadableDisplayPaths(collection: string, key: string, metadata: MetadataAccess): string[] {
	const normalizedKey = removeVirtualSegments(key);
	if (!normalizedKey) return [];

	const visibleField = resolveReadableFieldPath(collection, normalizedKey, metadata);
	if (!visibleField) return [];

	const configuredFields = metadata.getDisplayFields(visibleField.field);
	if (configuredFields.length === 0) return [visibleField.path];

	const readableFields = unique(
		configuredFields
			.map((displayField) => removeVirtualSegments(`${normalizedKey}.${displayField}`))
			.filter(Boolean)
			.filter((path) => resolveReadableFieldPath(collection, path, metadata) !== null),
	);

	// A relation field can be readable while every field used by its display is
	// forbidden. Fetching the relation itself is the least-privileged fallback
	// and lets Directus return its readable key instead of failing the whole list.
	return readableFields.length > 0 ? readableFields : [visibleField.path];
}

export function getDisplayField(collection: string, key: string, metadata: MetadataAccess) {
	const normalizedKey = removeVirtualSegments(key);
	return normalizedKey ? (resolveFieldPath(collection, normalizedKey, metadata)?.field ?? null) : null;
}

export function removeVirtualSegments(path: string): string {
	return path
		.split('.')
		.filter((segment) => segment && !segment.startsWith('$'))
		.join('.');
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
