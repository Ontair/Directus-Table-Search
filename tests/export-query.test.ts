import { describe, expect, it } from 'vitest';

import { buildExportQuery, createExportFilename, type ExportQueryInput } from '../src/utils/export-query';

const base: ExportQueryInput = {
	fields: ['title', 'author.first_name'],
	filter: { title: { _icontains: 'guide' } },
	format: 'csv',
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
			export: 'csv',
			fields: 'title,author.first_name',
			filter: '{"title":{"_icontains":"guide"}}',
			limit: -1,
			sort: '-title',
		});
	});

	it('keeps the generated filter for the current page window', () => {
		expect(buildExportQuery({ ...base, scope: 'page' })).toMatchObject({
			filter: '{"title":{"_icontains":"guide"}}',
			limit: 25,
			offset: 50,
		});
	});

	it('restricts the export to the current selection', () => {
		const query = buildExportQuery({ ...base, scope: 'selection', selection: [4, 9] });

		expect(JSON.parse(String(query.filter))).toEqual({
			_and: [{ title: { _icontains: 'guide' } }, { id: { _in: [4, 9] } }],
		});
		expect(query.limit).toBe(-1);
	});

	it('ignores the selection scope without a selection or a primary key', () => {
		expect(buildExportQuery({ ...base, scope: 'selection' }).filter).toBe('{"title":{"_icontains":"guide"}}');
		expect(buildExportQuery({ ...base, primaryKeyField: null, scope: 'selection', selection: [1] }).filter).toBe(
			'{"title":{"_icontains":"guide"}}',
		);
	});

	it('omits an empty projection, sort and filter', () => {
		expect(buildExportQuery({ ...base, fields: [], filter: null, sort: [] })).toEqual({
			export: 'csv',
			limit: -1,
		});
	});

	it('propagates the requested content version', () => {
		expect(buildExportQuery({ ...base, format: 'json', version: 'draft' })).toMatchObject({
			export: 'json',
			version: 'draft',
		});
	});
});

describe('createExportFilename', () => {
	it('names the file after the collection and the chosen format', () => {
		expect(createExportFilename('articles', 'yaml', new Date(2026, 8, 7))).toBe('articles-20260907.yaml');
	});
});
