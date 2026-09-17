import type { Filter } from '@directus/types';

import type { FilterNode } from '../types';
import { combineFilters, nestPath } from './filter';

export type ExportFormat = 'csv' | 'json' | 'xml' | 'yaml';

export type ExportScope = 'all' | 'page' | 'selection';

export interface ExportQueryInput {
	fields: string[];
	filter: Filter | null;
	format: ExportFormat;
	limit: number;
	page: number;
	primaryKeyField: string | null;
	scope: ExportScope;
	selection: readonly (number | string)[];
	sort: string[];
	version: string | null;
}

/**
 * Directus renders the export itself through the documented `export` query
 * parameter, so the layout only has to describe the query the list request
 * already uses. Keeping that description in one pure function is what makes
 * exported rows and visible rows provably identical.
 *
 * The filter travels as a JSON string rather than as a bracketed object so a
 * deep relational filter stays independent of the host's querystring parse
 * depth.
 */
export function buildExportQuery(input: ExportQueryInput): Record<string, number | string> {
	const filter = getScopedFilter(input);
	const query: Record<string, number | string> = { export: input.format };

	if (input.fields.length > 0) query.fields = input.fields.join(',');
	if (input.sort.length > 0) query.sort = input.sort.join(',');
	if (filter) query.filter = JSON.stringify(filter);
	if (input.version) query.version = input.version;

	if (input.scope === 'page') {
		query.limit = input.limit;
		query.offset = Math.max(0, (input.page - 1) * input.limit);
	} else {
		query.limit = -1;
	}

	return query;
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
