import { describe, expect, it } from 'vitest';

import { resolveReadableFieldPath } from '../src/utils/field-path';
import { createSchema } from './fixtures/schema';

describe('resolveReadableFieldPath', () => {
	it.each([
		['M2O', 'author.first_name', 'authors', 'first_name'],
		['O2M', 'comments.body', 'comments', 'body'],
		['M2M', 'tags.tags_id.name', 'tags', 'name'],
		['system user', 'editor.first_name', 'directus_users', 'first_name'],
	])('resolves %s paths', (_kind, path, collection, field) => {
		const result = resolveReadableFieldPath('articles', path, createSchema());
		expect(result?.field.collection).toBe(collection);
		expect(result?.field.field).toBe(field);
	});

	it('rejects a path when a field at any relation hop is not readable', () => {
		const metadata = createSchema({ denied: ['articles_tags.tags_id'] });
		expect(resolveReadableFieldPath('articles', 'tags.tags_id.name', metadata)).toBeNull();
	});

	it('rejects dynamic M2A and internal virtual paths safely', () => {
		const metadata = createSchema();
		expect(resolveReadableFieldPath('articles', 'sections.item:posts.title', metadata)).toBeNull();
		expect(resolveReadableFieldPath('articles', '$thumbnail.id', metadata)).toBeNull();
	});
});
