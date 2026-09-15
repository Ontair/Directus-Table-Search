import { describe, expect, it } from 'vitest';

import { buildColumnPlans } from '../src/utils/column-plan';
import { createSchema, field } from './fixtures/schema';

describe('buildColumnPlans', () => {
	it('derives searchable paths from rendered relation displays', () => {
		const plans = buildColumnPlans('articles', ['title', 'author', 'comments', 'tags', 'editor'], createSchema());

		expect(plans).toEqual([
			{
				key: 'title',
				searchLeaves: [{ path: 'title', type: 'string' }],
			},
			{
				key: 'author',
				searchLeaves: [
					{ path: 'author.first_name', type: 'string' },
					{ path: 'author.last_name', type: 'string' },
					{ path: 'author.id', type: 'integer' },
				],
			},
			{
				key: 'comments',
				searchLeaves: [
					{ path: 'comments.body', type: 'text' },
					{ path: 'comments.id', type: 'integer' },
				],
			},
			{
				key: 'tags',
				searchLeaves: [
					{ path: 'tags.tags_id.name', type: 'string' },
					{ path: 'tags.tags_id.id', type: 'integer' },
				],
			},
			{
				key: 'editor',
				searchLeaves: [
					{ path: 'editor.id', type: 'uuid' },
					{ path: 'editor.avatar.id', type: 'uuid' },
					{ path: 'editor.avatar.modified_on', type: 'dateTime' },
					{ path: 'editor.email', type: 'string' },
					{ path: 'editor.first_name', type: 'string' },
					{ path: 'editor.last_name', type: 'string' },
				],
			},
		]);
	});

	it('excludes forbidden display fields from generated search filters', () => {
		const metadata = createSchema({
			denied: ['directus_users.email', 'directus_users.avatar'],
		});
		const [plan] = buildColumnPlans('articles', ['editor'], metadata);

		expect(plan?.searchLeaves.map(({ path }) => path)).toEqual(['editor.id', 'editor.first_name', 'editor.last_name']);
	});

	it('supports explicitly selected nested relation fields', () => {
		const [plan] = buildColumnPlans('articles', ['author.first_name'], createSchema());
		expect(plan).toEqual({
			key: 'author.first_name',
			searchLeaves: [{ path: 'author.first_name', type: 'string' }],
		});
	});

	it('does not generate filters for scalar types rejected by Directus operators', () => {
		const baseMetadata = createSchema();
		const metadata = {
			...baseMetadata,
			getField: (collection: string, fieldName: string) => {
				if (collection === 'articles' && fieldName === 'password_hash') {
					return field('articles', fieldName, 'string', { special: ['hash', 'conceal'] });
				}
				if (collection === 'articles' && fieldName === 'binary_payload') {
					return field('articles', fieldName, 'unknown');
				}
				return baseMetadata.getField(collection, fieldName);
			},
		};

		expect(buildColumnPlans('articles', ['password_hash', 'binary_payload'], metadata)).toEqual([
			{ key: 'password_hash', searchLeaves: [] },
			{ key: 'binary_payload', searchLeaves: [] },
		]);
	});
});
