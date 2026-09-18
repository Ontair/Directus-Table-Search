import { describe, expect, it } from 'vitest';

import type { ColumnPlan } from '../src/types';
import { buildColumnPlans } from '../src/utils/column-plan';
import {
	buildColumnFilters,
	buildColumnFiltersResult,
	buildGlobalSearchFilter,
	buildGlobalSearchFilterResult,
	buildLeafCondition,
	combineFilters,
} from '../src/utils/filter';
import { encodeTemporalFilterValue } from '../src/utils/temporal-filter';
import { createSchema } from './fixtures/schema';

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
				{
					_or: [{ author: { first_name: { _icontains: 'Ada' } } }, { author: { last_name: { _icontains: 'Ada' } } }],
				},
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

	it('matches multi-part display text across separate relational fields', () => {
		const filter = buildColumnFilters(plans, { author: 'Ada Lovelace' });

		expect(filter).toEqual({
			_or: [
				{ author: { first_name: { _icontains: 'Ada Lovelace' } } },
				{ author: { last_name: { _icontains: 'Ada Lovelace' } } },
				{
					_and: [
						{
							_or: [
								{ author: { first_name: { _icontains: 'Ada' } } },
								{ author: { last_name: { _icontains: 'Ada' } } },
							],
						},
						{
							_or: [
								{ author: { first_name: { _icontains: 'Lovelace' } } },
								{ author: { last_name: { _icontains: 'Lovelace' } } },
							],
						},
					],
				},
			],
		});
		expect(buildGlobalSearchFilter(plans.slice(1, 2), 'Ada Lovelace')).toEqual(filter);
	});

	it('supports rendered and partial temporal values in global and column filters', () => {
		const temporalPlans: ColumnPlan[] = [
			{ key: 'published_on', searchLeaves: [{ path: 'published_on', type: 'date' }] },
		];

		expect(buildColumnFilters(temporalPlans, { published_on: encodeTemporalFilterValue({ day: '1' }) })).toEqual({
			'day(published_on)': { _eq: 1 },
		});
		expect(buildGlobalSearchFilter(temporalPlans, '2026')).toEqual({
			'year(published_on)': { _eq: 2026 },
		});
		expect(buildGlobalSearchFilter(temporalPlans, '09.09.2026')).toEqual({
			_and: [
				{ 'day(published_on)': { _eq: 9 } },
				{ 'month(published_on)': { _eq: 9 } },
				{ 'year(published_on)': { _eq: 2026 } },
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
		expect(buildLeafCondition({ path: 'owner', type: 'uuid' }, '00000000-0000-0000-0000-000000000000')).toEqual({
			owner: { _eq: '00000000-0000-0000-0000-000000000000' },
		});
		expect(buildLeafCondition({ path: 'created_at', type: 'dateTime' }, 'not-a-date')).toBeNull();
	});

	it('omits blank and unsupported conditions', () => {
		expect(buildGlobalSearchFilter(plans, '   ')).toBeNull();
		expect(buildColumnFilters(plans, {})).toBeNull();
		expect(combineFilters(null, undefined)).toBeNull();
	});

	it('keeps a search over an unreadable visible column from becoming an unfiltered query', () => {
		const metadata = createSchema({ denied: ['directus_users.email'] });
		const plans = buildColumnPlans('articles', ['editor.email'], metadata);
		const impossible = { _and: [{ id: { _null: true } }, { id: { _nnull: true } }] };

		expect(buildGlobalSearchFilterResult(plans, 'anything')).toEqual({ filter: impossible, status: 'unsupported' });
		expect(buildColumnFiltersResult(plans, { 'editor.email': 'anything' })).toEqual({
			filter: impossible,
			invalidKeys: [],
			limitedKeys: [],
			status: 'unsupported',
			unsupportedKeys: ['editor.email'],
		});
	});

	it('still narrows a readable column when a sibling column is unreadable', () => {
		const metadata = createSchema({ denied: ['directus_users.email'] });
		const plans = buildColumnPlans('articles', ['title', 'editor.email'], metadata);

		expect(buildGlobalSearchFilterResult(plans, 'guide')).toEqual({
			filter: { title: { _icontains: 'guide' } },
			status: 'valid',
		});
		expect(buildColumnFiltersResult(plans, { title: 'guide', 'editor.email': 'anything' })).toEqual({
			filter: {
				_and: [{ title: { _icontains: 'guide' } }, { _and: [{ id: { _null: true } }, { id: { _nnull: true } }] }],
			},
			invalidKeys: [],
			limitedKeys: [],
			status: 'unsupported',
			unsupportedKeys: ['editor.email'],
		});
	});

	it('names every column that could not be turned into a condition', () => {
		const plans: ColumnPlan[] = [
			{ key: 'title', searchLeaves: [{ path: 'title', type: 'string' }] },
			{ key: 'owner', searchLeaves: [{ path: 'owner', type: 'uuid' }] },
			{ guardPath: 'payload', key: 'payload', searchLeaves: [] },
		];
		const result = buildColumnFiltersResult(plans, { title: 'guide', owner: 'not-a-uuid', payload: 'anything' });

		expect(result.invalidKeys).toEqual(['owner']);
		expect(result.unsupportedKeys).toEqual(['payload']);
		expect(result.status).toBe('unsupported');
	});

	it('reports no issue keys while every active column filter is usable', () => {
		const plans: ColumnPlan[] = [{ key: 'title', searchLeaves: [{ path: 'title', type: 'string' }] }];

		expect(buildColumnFiltersResult(plans, { title: 'guide' })).toEqual({
			filter: { title: { _icontains: 'guide' } },
			invalidKeys: [],
			limitedKeys: [],
			status: 'valid',
			unsupportedKeys: [],
		});
	});

	it('keeps a search over only unsupported visible fields from becoming an unfiltered query', () => {
		const unsupportedPlans: ColumnPlan[] = [{ guardPath: 'payload', key: 'payload', searchLeaves: [] }];
		const expected = { _and: [{ payload: { _null: true } }, { payload: { _nnull: true } }] };

		expect(buildGlobalSearchFilterResult(unsupportedPlans, 'anything')).toEqual({
			filter: expected,
			status: 'unsupported',
		});
		expect(buildColumnFiltersResult(unsupportedPlans, { payload: 'anything' })).toEqual({
			filter: expected,
			invalidKeys: [],
			limitedKeys: [],
			status: 'unsupported',
			unsupportedKeys: ['payload'],
		});
	});

	it('turns active invalid exact values into a safe no-match filter', () => {
		const uuidPlans: ColumnPlan[] = [{ key: 'owner', searchLeaves: [{ path: 'owner', type: 'uuid' }] }];
		const expected = {
			_and: [{ owner: { _null: true } }, { owner: { _nnull: true } }],
		};

		expect(buildColumnFiltersResult(uuidPlans, { owner: 'partial-uuid' })).toEqual({
			filter: expected,
			invalidKeys: ['owner'],
			limitedKeys: [],
			status: 'invalid',
			unsupportedKeys: [],
		});
		expect(buildGlobalSearchFilterResult(uuidPlans, 'partial-uuid')).toEqual({
			filter: expected,
			status: 'invalid',
		});
	});

	it('validates complete calendar and clock values before sending them to Directus', () => {
		expect(buildLeafCondition({ path: 'published_on', type: 'date' }, '2026-02-29')).toBeNull();
		expect(buildLeafCondition({ path: 'published_on', type: 'date' }, '2024-02-29')).toEqual({
			published_on: { _eq: '2024-02-29' },
		});
		expect(buildLeafCondition({ path: 'opens_at', type: 'time' }, '24:00')).toBeNull();
		expect(buildLeafCondition({ path: 'starts_at', type: 'dateTime' }, '2026-01-01T23:59tail')).toBeNull();
		expect(buildLeafCondition({ path: 'starts_at', type: 'dateTime' }, '2026-01-01T23:59Z')).toEqual({
			starts_at: { _eq: '2026-01-01T23:59Z' },
		});
		expect(buildLeafCondition({ path: 'starts_at', type: 'dateTime' }, '2026-01-01T23:59+23:59')).toBeNull();
		expect(buildLeafCondition({ path: 'starts_at', type: 'dateTime' }, '2026-01-01T23:59+14:00')).toEqual({
			starts_at: { _eq: '2026-01-01T23:59+14:00' },
		});
		expect(buildLeafCondition({ path: 'starts_at', type: 'dateTime' }, '2026-01-01T23:59+14:01')).toBeNull();
		expect(buildLeafCondition({ path: 'starts_at', type: 'dateTime' }, '2026-01-01T23:59+24:00')).toBeNull();
		expect(buildLeafCondition({ path: 'starts_at', type: 'dateTime' }, '2026-01-01T23:59+01:60')).toBeNull();
	});

	it('matches configured display choice labels without hardcoded schema values', () => {
		const leaf = {
			choices: [
				{ text: 'Needs review', value: 'pending' },
				{ text: 'Ready to publish', value: 'ready' },
			],
			path: 'status',
			type: 'string',
		};

		expect(buildLeafCondition(leaf, 'publish')).toEqual({
			_or: [{ status: { _icontains: 'publish' } }, { status: { _eq: 'ready' } }],
		});
	});

	it('rejects oversized and highly tokenized searches before expanding the filter tree', () => {
		const expected = { _and: [{ title: { _null: true } }, { title: { _nnull: true } }] };
		const longTerm = 'x'.repeat(257);
		const manyTokens = Array.from({ length: 13 }, (_, index) => `word${index}`).join(' ');
		const broadPlans = Array.from({ length: 22 }, (_, index) => ({
			key: `field_${index}`,
			searchLeaves: [{ path: `field_${index}`, type: 'string' }],
		}));
		const twelveTokens = Array.from({ length: 12 }, (_, index) => `term${index}`).join(' ');

		expect(buildGlobalSearchFilterResult(plans, longTerm)).toEqual({ filter: expected, status: 'limited' });
		expect(buildGlobalSearchFilterResult(plans, manyTokens)).toEqual({ filter: expected, status: 'limited' });
		expect(buildGlobalSearchFilterResult(broadPlans, twelveTokens)).toEqual({
			filter: { _and: [{ field_0: { _null: true } }, { field_0: { _nnull: true } }] },
			status: 'limited',
		});
		expect(buildColumnFiltersResult(plans, { title: longTerm })).toEqual({
			filter: expected,
			invalidKeys: [],
			limitedKeys: ['title'],
			status: 'limited',
			unsupportedKeys: [],
		});
	});
});
