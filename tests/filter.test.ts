import { describe, expect, it } from 'vitest';

import type { ColumnPlan } from '../src/types';
import { buildColumnFilters, buildGlobalSearchFilter, buildLeafCondition, combineFilters } from '../src/utils/filter';

const plans: ColumnPlan[] = [
	{
		key: 'title',
		searchLeaves: [{ path: 'title', type: 'string' }],
	},
	{
		key: 'author',
		searchLeaves: [
			{ path: 'author.first_name', type: 'string' },
			{ path: 'author.last_name', type: 'string' },
		],
	},
	{
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

	it('uses type-safe exact operators for integer, float and decimal values', () => {
		expect(buildLeafCondition({ path: 'views', type: 'integer' }, '42')).toEqual({ views: { _eq: 42 } });
		expect(buildLeafCondition({ path: 'large_id', type: 'bigInteger' }, '9007199254740993')).toEqual({
			large_id: { _eq: '9007199254740993' },
		});
		expect(buildLeafCondition({ path: 'amount', type: 'decimal' }, '1234567890.123456789')).toEqual({
			amount: { _eq: '1234567890.123456789' },
		});
		expect(buildLeafCondition({ path: 'ratio', type: 'float' }, '1.25')).toEqual({ ratio: { _eq: 1.25 } });
		expect(buildLeafCondition({ path: 'views', type: 'integer' }, '1.25')).toBeNull();
		expect(buildLeafCondition({ path: 'large_id', type: 'bigInteger' }, '1.25')).toBeNull();
		expect(buildLeafCondition({ path: 'amount', type: 'decimal' }, 'many')).toBeNull();
		expect(buildLeafCondition({ path: 'ratio', type: 'float' }, 'many')).toBeNull();
	});

	it('uses exact operators for boolean, UUID and date values', () => {
		expect(buildLeafCondition({ path: 'active', type: 'boolean' }, 'yes')).toEqual({ active: { _eq: true } });
		expect(buildLeafCondition({ path: 'active', type: 'boolean' }, 'false')).toEqual({ active: { _eq: false } });
		expect(buildLeafCondition({ path: 'published_on', type: 'date' }, '2026-09-09')).toEqual({
			published_on: { _eq: '2026-09-09' },
		});
		expect(buildLeafCondition({ path: 'opens_at', type: 'time' }, '12:34:56')).toEqual({
			opens_at: { _eq: '12:34:56' },
		});
		expect(buildLeafCondition({ path: 'starts_at', type: 'timestamp' }, '2026-09-09T12:34')).toEqual({
			starts_at: { _eq: '2026-09-09T12:34' },
		});
		expect(buildLeafCondition({ path: 'owner', type: 'uuid' }, 'not-a-uuid')).toBeNull();
		expect(buildLeafCondition({ path: 'owner', type: 'uuid' }, '123e4567-e89b-42d3-a456-426614174000')).toEqual({
			owner: { _eq: '123e4567-e89b-42d3-a456-426614174000' },
		});
		expect(buildLeafCondition({ path: 'created_at', type: 'dateTime' }, 'not-a-date')).toBeNull();
	});

	it('omits blank and unsupported conditions', () => {
		expect(buildGlobalSearchFilter(plans, '   ')).toBeNull();
		expect(buildColumnFilters(plans, {})).toBeNull();
		expect(combineFilters(null, undefined)).toBeNull();
	});
});
