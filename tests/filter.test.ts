import { describe, expect, it } from 'vitest';

import type { ColumnPlan } from '../src/types';
import { buildColumnFilters, buildGlobalSearchFilter, buildLeafCondition, combineFilters } from '../src/utils/filter';

const plans: ColumnPlan[] = [
	{
		fetchPaths: ['title'],
		key: 'title',
		searchLeaves: [{ path: 'title', type: 'string' }],
	},
	{
		fetchPaths: ['author.first_name', 'author.last_name'],
		key: 'author',
		searchLeaves: [
			{ path: 'author.first_name', type: 'string' },
			{ path: 'author.last_name', type: 'string' },
		],
	},
	{
		fetchPaths: ['views'],
		key: 'views',
		searchLeaves: [{ path: 'views', type: 'integer' }],
	},
];

describe('filter generation', () => {
	it('searches globally across visible scalar and relational display values', () => {
		expect(buildGlobalSearchFilter(plans, ' Ada ')).toEqual({
			_or: [
				{ title: { _icontains: 'Ada' } },
				{ author: { first_name: { _icontains: 'Ada' } } },
				{ author: { last_name: { _icontains: 'Ada' } } },
			],
		});
	});

	it('uses OR within one column and AND between different column filters', () => {
		expect(buildColumnFilters(plans, { title: 'guide', author: 'Ada', views: '' })).toEqual({
			_and: [
				{ title: { _icontains: 'guide' } },
				{
					_or: [{ author: { first_name: { _icontains: 'Ada' } } }, { author: { last_name: { _icontains: 'Ada' } } }],
				},
			],
		});
	});

	it('keeps existing Directus filters active', () => {
		const existing = { status: { _eq: 'published' } };
		const global = buildGlobalSearchFilter(plans, 'guide');
		const columns = buildColumnFilters(plans, { author: 'Ada' });

		expect(combineFilters(existing, global, columns)).toEqual({
			_and: [existing, global, columns],
		});
	});

	it('uses type-safe exact operators for numeric, boolean and date values', () => {
		expect(buildLeafCondition({ path: 'views', type: 'integer' }, '42')).toEqual({ views: { _eq: 42 } });
		expect(buildLeafCondition({ path: 'active', type: 'boolean' }, 'yes')).toEqual({ active: { _eq: true } });
		expect(buildLeafCondition({ path: 'published_on', type: 'date' }, '2026-09-09')).toEqual({
			published_on: { _eq: '2026-09-09' },
		});
		expect(buildLeafCondition({ path: 'views', type: 'integer' }, 'many')).toBeNull();
	});

	it('omits blank and unsupported conditions', () => {
		expect(buildGlobalSearchFilter(plans, '   ')).toBeNull();
		expect(buildColumnFilters(plans, {})).toBeNull();
		expect(combineFilters(null, undefined)).toBeNull();
	});
});
