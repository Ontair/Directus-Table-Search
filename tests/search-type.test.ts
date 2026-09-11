import { describe, expect, it } from 'vitest';

import { getSearchValueKind } from '../src/utils/search-type';

describe('search value kinds', () => {
	it('maps every filterable Directus scalar family', () => {
		expect(getSearchValueKind('text')).toBe('text');
		expect(getSearchValueKind('integer')).toBe('number');
		expect(getSearchValueKind('bigInteger')).toBe('number');
		expect(getSearchValueKind('boolean')).toBe('boolean');
		expect(getSearchValueKind('date')).toBe('date');
		expect(getSearchValueKind('dateTime')).toBe('dateTime');
		expect(getSearchValueKind('timestamp')).toBe('dateTime');
		expect(getSearchValueKind('time')).toBe('time');
		expect(getSearchValueKind('uuid')).toBe('uuid');
		expect(getSearchValueKind('json')).toBe('unsupported');
	});
});
