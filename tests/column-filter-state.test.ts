import { describe, expect, it } from 'vitest';

import { pruneColumnFilters } from '../src/utils/column-filter-state';

describe('column filter state', () => {
	it('keeps only non-empty filters for currently visible fields', () => {
		expect(
			pruneColumnFilters(
				{
					author: 'Ada',
					hidden: 'stale value',
					title: '  ',
				},
				['title', 'author'],
			),
		).toEqual({ author: 'Ada' });
	});

	it('does not mutate persisted layout state while pruning it', () => {
		const filters = { hidden: 'stale value', title: 'Guide' };

		expect(pruneColumnFilters(filters, ['title'])).toEqual({ title: 'Guide' });
		expect(filters).toEqual({ hidden: 'stale value', title: 'Guide' });
	});
});
