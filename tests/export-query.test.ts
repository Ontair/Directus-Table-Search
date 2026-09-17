import { describe, expect, it } from 'vitest';

import {
	buildExportQuery,
	createExportFilename,
	isLocalDownloadScope,
	toExportParams,
	type ExportQueryInput,
} from '../src/utils/export-query';

const base: ExportQueryInput = {
	fields: ['title', 'author.first_name'],
	filter: { title: { _icontains: 'guide' } },
	limit: 25,
	page: 3,
	primaryKeyField: 'id',
	scope: 'all',
	selection: [],
	sort: ['-title'],
	version: null,
};

describe('buildExportQuery', () => {
	it('describes the same query the list request uses', () => {
		expect(buildExportQuery(base)).toEqual({
			fields: ['title', 'author.first_name'],
			filter: { title: { _icontains: 'guide' } },
			limit: -1,
			sort: ['-title'],
		});
	});

	it('keeps the generated filter for the current page window', () => {
		expect(buildExportQuery({ ...base, scope: 'page' })).toMatchObject({
			filter: { title: { _icontains: 'guide' } },
			limit: 25,
			offset: 50,
		});
	});

	it('restricts the export to the current selection', () => {
		const query = buildExportQuery({ ...base, scope: 'selection', selection: [4, 9] });

		expect(query.filter).toEqual({
			_and: [{ title: { _icontains: 'guide' } }, { id: { _in: [4, 9] } }],
		});
		expect(query.limit).toBe(-1);
	});

	it('ignores the selection scope without a selection or a primary key', () => {
		expect(buildExportQuery({ ...base, scope: 'selection' }).filter).toEqual({ title: { _icontains: 'guide' } });
		expect(buildExportQuery({ ...base, primaryKeyField: null, scope: 'selection', selection: [1] }).filter).toEqual({
			title: { _icontains: 'guide' },
		});
	});

	it('omits an empty projection, sort and filter', () => {
		expect(buildExportQuery({ ...base, fields: [], filter: null, sort: [] })).toEqual({ limit: -1 });
	});

	it('propagates a content version only to a bounded download', () => {
		expect(buildExportQuery({ ...base, scope: 'page', version: 'draft' }).version).toBe('draft');
		expect(buildExportQuery({ ...base, scope: 'selection', selection: [1], version: 'draft' }).version).toBe('draft');
		expect(buildExportQuery({ ...base, scope: 'all', version: 'draft' }).version).toBeUndefined();
	});
});

describe('isLocalDownloadScope', () => {
	it('keeps bounded scopes in the browser and sends the full result set to the server', () => {
		expect(isLocalDownloadScope('page')).toBe(true);
		expect(isLocalDownloadScope('selection')).toBe(true);
		expect(isLocalDownloadScope('all')).toBe(false);
	});
});

describe('toExportParams', () => {
	it('flattens the query for the item endpoint', () => {
		expect(toExportParams(buildExportQuery({ ...base, scope: 'page' }), 'csv')).toEqual({
			export: 'csv',
			fields: 'title,author.first_name',
			filter: '{"title":{"_icontains":"guide"}}',
			limit: 25,
			offset: 50,
			sort: '-title',
		});
	});

	it('carries the requested format and content version', () => {
		expect(toExportParams(buildExportQuery({ ...base, scope: 'page', version: 'draft' }), 'json')).toMatchObject({
			export: 'json',
			version: 'draft',
		});
	});

	it('emits nothing but the format and the limit for an empty query', () => {
		expect(toExportParams(buildExportQuery({ ...base, fields: [], filter: null, sort: [] }), 'yaml')).toEqual({
			export: 'yaml',
			limit: -1,
		});
	});
});

describe('createExportFilename', () => {
	it('names the file after the collection and the chosen format', () => {
		expect(createExportFilename('articles', 'yaml', new Date(2026, 8, 7))).toBe('articles-20260907.yaml');
	});
});
