import { describe, expect, it } from 'vitest';

import { getValueAtPath } from '../src/utils/object';

describe('getValueAtPath', () => {
	it('reads scalar and nested many-to-one values', () => {
		const item = {
			title: 'Organization',
			owner: { first_name: 'Ada' },
		};

		expect(getValueAtPath(item, 'title')).toBe('Organization');
		expect(getValueAtPath(item, 'owner.first_name')).toBe('Ada');
	});

	it('projects nested fields from one-to-many relations', () => {
		const item = {
			children: [{ title: 'First' }, { title: 'Second' }],
		};

		expect(getValueAtPath(item, 'children.title')).toEqual(['First', 'Second']);
	});

	it('projects fields through nested many-to-many junction arrays', () => {
		const item = {
			tags: [{ tags_id: { name: 'News' } }, { tags_id: { name: 'Featured' } }],
		};

		expect(getValueAtPath(item, 'tags.tags_id.name')).toEqual(['News', 'Featured']);
	});

	it('ignores synthetic display path segments just like Directus Table', () => {
		const item = {
			image: { id: 'asset-id' },
		};

		expect(getValueAtPath(item, 'image.$thumbnail.id')).toBe('asset-id');
	});

	it('returns undefined when a path has no displayable value', () => {
		expect(getValueAtPath({ children: [] }, 'children.title')).toBeUndefined();
		expect(getValueAtPath({}, '$thumbnail')).toBeUndefined();
	});
});
