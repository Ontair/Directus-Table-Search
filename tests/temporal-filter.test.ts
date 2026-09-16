import { describe, expect, it } from 'vitest';

import { buildPartialTemporalCondition } from '../src/utils/temporal-filter';

describe('partial temporal filters', () => {
	it('filters date values from the first day digit', () => {
		expect(buildPartialTemporalCondition({ path: 'published_on', type: 'date' }, '1')).toEqual({
			'day(published_on)': { _in: [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
		});
	});

	it('narrows localized date prefixes component by component', () => {
		expect(buildPartialTemporalCondition({ path: 'published_on', type: 'date' }, '01.1')).toEqual({
			_and: [{ 'day(published_on)': { _eq: 1 } }, { 'month(published_on)': { _in: [1, 10, 11, 12] } }],
		});

		expect(buildPartialTemporalCondition({ path: 'published_on', type: 'date' }, '01.01.2026')).toEqual({
			_and: [
				{ 'day(published_on)': { _eq: 1 } },
				{ 'month(published_on)': { _eq: 1 } },
				{ 'year(published_on)': { _eq: 2026 } },
			],
		});
	});

	it('accepts existing ISO date and datetime values', () => {
		expect(buildPartialTemporalCondition({ path: 'starts_at', type: 'dateTime' }, '2026-09-10T12:34')).toEqual({
			_and: [
				{ 'day(starts_at)': { _eq: 10 } },
				{ 'month(starts_at)': { _eq: 9 } },
				{ 'year(starts_at)': { _eq: 2026 } },
				{ 'hour(starts_at)': { _eq: 12 } },
				{ 'minute(starts_at)': { _eq: 34 } },
			],
		});
	});

	it('supports partial time values', () => {
		expect(buildPartialTemporalCondition({ path: 'opens_at', type: 'time' }, '1')).toEqual({
			'hour(opens_at)': { _in: [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
		});

		expect(buildPartialTemporalCondition({ path: 'opens_at', type: 'time' }, '13:5')).toEqual({
			_and: [
				{ 'hour(opens_at)': { _eq: 13 } },
				{ 'minute(opens_at)': { _in: [5, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59] } },
			],
		});
	});

	it('supports timestamp fields and nested relation paths', () => {
		expect(buildPartialTemporalCondition({ path: 'event.recorded_at', type: 'timestamp' }, '01.01.2026 1')).toEqual({
			_and: [
				{ event: { 'day(recorded_at)': { _eq: 1 } } },
				{ event: { 'month(recorded_at)': { _eq: 1 } } },
				{ event: { 'year(recorded_at)': { _eq: 2026 } } },
				{
					event: {
						'hour(recorded_at)': { _in: [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
					},
				},
			],
		});
	});

	it('uses valid no-match conditions for invalid input', () => {
		expect(buildPartialTemporalCondition({ path: 'published_on', type: 'date' }, 'not-a-date')).toEqual({
			'day(published_on)': { _eq: 0 },
		});
		expect(buildPartialTemporalCondition({ path: 'opens_at', type: 'time' }, '99')).toEqual({
			'hour(opens_at)': { _eq: -1 },
		});
	});
});
