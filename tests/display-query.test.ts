import { describe, expect, it } from 'vitest';

import { buildDisplayQuery, buildExportFields } from '../src/utils/display-query';
import { createSchema } from './fixtures/schema';

describe('buildDisplayQuery', () => {
	it('uses the fields required by a configured Directus display', () => {
		const query = buildDisplayQuery('articles', ['title', 'author'], createSchema());

		expect(query).toEqual({
			alias: {},
			fields: ['title', 'author.first_name', 'author.last_name', 'author.id'],
			valuePaths: { author: 'author', title: 'title' },
		});
	});

	it('aliases columns that share a relational root', () => {
		const nameField = 'tags.tags_id.name';
		const idField = 'tags.tags_id.id';
		const query = buildDisplayQuery('articles', [nameField, idField], createSchema());
		const nameAlias = query.valuePaths[nameField]?.split('.')[0];
		const idAlias = query.valuePaths[idField]?.split('.')[0];

		expect(nameAlias).toBeTruthy();
		expect(idAlias).toBeTruthy();
		expect(nameAlias).not.toBe(idAlias);
		expect(query.alias).toEqual({ [nameAlias!]: 'tags', [idAlias!]: 'tags' });
		expect(query.fields).toEqual([`${nameAlias}.tags_id.name`, `${idAlias}.tags_id.id`]);
	});

	it('keeps root relation displays isolated from nested columns', () => {
		const nestedField = 'tags.tags_id.name';
		const query = buildDisplayQuery('articles', ['tags', nestedField], createSchema());
		const rootAlias = query.valuePaths.tags;
		const nestedAlias = query.valuePaths[nestedField]?.split('.')[0];

		expect(query.alias).toEqual({ [rootAlias!]: 'tags', [nestedAlias!]: 'tags' });
		expect(query.fields).toEqual([
			`${rootAlias}.tags_id.name`,
			`${rootAlias}.tags_id.id`,
			`${nestedAlias}.tags_id.name`,
		]);
		expect(query.valuePaths[nestedField]).toBe(`${nestedAlias}.tags_id.name`);
	});

	it('removes virtual path segments when resolving a cell value', () => {
		const query = buildDisplayQuery('articles', ['author.$thumbnail.first_name'], createSchema());

		expect(query.fields).toEqual(['author.first_name']);
		expect(query.valuePaths['author.$thumbnail.first_name']).toBe('author.first_name');
	});

	it('never projects display fields that the current role cannot read', () => {
		const metadata = createSchema({
			denied: ['directus_users.avatar', 'directus_users.email'],
		});
		const query = buildDisplayQuery('articles', ['title', 'editor'], metadata);

		expect(query.fields).toEqual(['title', 'editor.id', 'editor.first_name', 'editor.last_name']);
		expect(query.fields).not.toContain('editor.avatar.id');
		expect(query.fields).not.toContain('editor.email');
	});

	it('falls back to the readable relation field when all configured display fields are forbidden', () => {
		const metadata = createSchema({
			denied: ['authors.first_name', 'authors.last_name', 'authors.id'],
		});
		const query = buildDisplayQuery('articles', ['author'], metadata);

		expect(query.fields).toEqual(['author']);
		expect(query.valuePaths).toEqual({ author: 'author' });
	});
});

describe('buildExportFields', () => {
	it('projects the readable display paths without alias indirection', () => {
		expect(buildExportFields('articles', ['title', 'author'], createSchema())).toEqual([
			'title',
			'author.first_name',
			'author.last_name',
			'author.id',
		]);
	});

	it('keeps a shared relational root readable instead of aliasing it', () => {
		expect(buildExportFields('articles', ['tags.tags_id.name', 'tags.tags_id.id'], createSchema())).toEqual([
			'tags.tags_id.name',
			'tags.tags_id.id',
		]);
	});

	it('never exports a display field that the current role cannot read', () => {
		const metadata = createSchema({ denied: ['directus_users.avatar', 'directus_users.email'] });
		const fields = buildExportFields('articles', ['title', 'editor'], metadata);

		expect(fields).not.toContain('editor.email');
		expect(fields).not.toContain('editor.avatar.id');
	});
});
