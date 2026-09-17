import type { Filter } from '@directus/types';

import type { FilterNode } from '../types';
import { combineFilters, nestPath } from './filter';

export type ExportFormat = 'csv' | 'json' | 'xml' | 'yaml';

export type ExportScope = 'all' | 'page' | 'selection';

export interface ExportQuery {
	fields?: string[];
	filter?: Filter;
	limit: number;
	offset?: number;
	sort?: string[];
	version?: string;
}

export interface ExportQueryInput {
	fields: string[];
	filter: Filter | null;
	limit: number;
	page: number;
	primaryKeyField: string | null;
	scope: ExportScope;
	selection: readonly (number | string)[];
	sort: string[];
	version: string | null;
}

/**
 * Describes the query the list request already uses, in the shape Directus
 * accepts. Keeping one description for both export routes is what makes the
 * exported rows and the visible rows provably identical.
 */
export function buildExportQuery(input: ExportQueryInput): ExportQuery {
	const filter = getScopedFilter(input);
	const query: ExportQuery = { limit: input.scope === 'page' ? input.limit : -1 };

	if (input.fields.length > 0) query.fields = [...input.fields];
	if (filter) query.filter = filter;
	if (input.sort.length > 0) query.sort = [...input.sort];
	if (input.scope === 'page') query.offset = Math.max(0, (input.page - 1) * input.limit);

	// A content version belongs to one item being edited, so it only makes
	// sense for a bounded download; the server export always reads the
	// published data.
	if (input.version && isLocalDownloadScope(input.scope)) query.version = input.version;

	return query;
}

/**
 * An unbounded result set is rendered by the server into the file library
 * instead of being buffered in the browser, which is how Directus itself
 * exports a whole collection.
 */
export function isLocalDownloadScope(scope: ExportScope): boolean {
	return scope !== 'all';
}

/**
 * Flattens the query for the item endpoint, which renders a bounded export
 * inline. The filter travels as a JSON string so a deep relational filter
 * stays independent of the host's querystring parse depth.
 */
export function toExportParams(query: ExportQuery, format: ExportFormat): Record<string, number | string> {
	const params: Record<string, number | string> = { export: format, limit: query.limit };

	if (query.fields) params.fields = query.fields.join(',');
	if (query.sort) params.sort = query.sort.join(',');
	if (query.filter) params.filter = JSON.stringify(query.filter);
	if (query.offset !== undefined) params.offset = query.offset;
	if (query.version) params.version = query.version;

	return params;
}

export function createExportFilename(collection: string, format: ExportFormat, date = new Date()): string {
	const datePart = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
		.map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
		.join('');

	return `${collection}-${datePart}.${format}`;
}

function getScopedFilter(input: ExportQueryInput): Filter | null {
	if (input.scope !== 'selection' || !input.primaryKeyField || input.selection.length === 0) return input.filter;

	const selectionFilter = nestPath(input.primaryKeyField, { _in: [...input.selection] });
	return combineFilters(input.filter as FilterNode | null, selectionFilter) as Filter | null;
}
