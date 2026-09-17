import { describe, expect, it } from 'vitest';

import { planRowInteraction } from '../src/utils/row-interaction';

const base = {
	collection: 'articles',
	item: { id: 7 },
	primaryKeyField: 'id',
	readonly: false,
	selection: [] as Array<number | string>,
	selectMode: false,
};

describe('planRowInteraction', () => {
	it('navigates to an item when selection is inactive', () => {
		expect(planRowInteraction(base)).toEqual({ route: '/content/articles/7', type: 'navigate' });
	});

	it('does nothing in readonly mode', () => {
		expect(planRowInteraction({ ...base, readonly: true })).toEqual({ type: 'none' });
	});

	it('toggles selection in select mode or when a selection already exists', () => {
		expect(planRowInteraction({ ...base, selectMode: true })).toEqual({ selection: [7], type: 'selection' });
		expect(planRowInteraction({ ...base, selection: [3] })).toEqual({ selection: [3, 7], type: 'selection' });
		expect(planRowInteraction({ ...base, selection: [7] })).toEqual({ selection: [], type: 'selection' });
	});

	it('uses version ids for selection and preserves version navigation', () => {
		const versionItem = { $meta: { version_id: 'version-id' }, id: 7 };

		expect(planRowInteraction({ ...base, item: versionItem, selectMode: true, versionKey: 'draft' })).toEqual({
			selection: ['version-id'],
			type: 'selection',
		});
		expect(planRowInteraction({ ...base, item: versionItem, versionKey: 'draft' })).toEqual({
			route: '/content/articles/7?version=draft',
			type: 'navigate',
		});
	});

	it('supports itemless versions and published-version keys', () => {
		expect(
			planRowInteraction({
				...base,
				item: { $meta: { version_id: 'version-id' }, id: null },
				versionKey: 'draft',
			}),
		).toEqual({
			route: '/content/articles/+?version=draft&versionId=version-id',
			type: 'navigate',
		});
		expect(planRowInteraction({ ...base, versionKey: 'published' })).toEqual({
			route: '/content/articles/7?version=published',
			type: 'navigate',
		});
	});
});
