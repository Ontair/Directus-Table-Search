import { describe, expect, it } from 'vitest';

import { getTableRowHeight } from '../src/utils/table-row-height';

describe('table row height', () => {
	it('matches the native Directus 11 table spacing', () => {
		expect(getTableRowHeight('compact', '11.14.0')).toBe(32);
		expect(getTableRowHeight('cozy', '11.14.0')).toBe(48);
		expect(getTableRowHeight('comfortable', '11.14.0')).toBe(64);
	});

	it('matches the native Directus 12 table spacing', () => {
		expect(getTableRowHeight('compact', '12.0.0')).toBe(29);
		expect(getTableRowHeight('cozy', '12.0.0')).toBe(43);
		expect(getTableRowHeight('comfortable', '12.0.0')).toBe(58);
	});

	it('uses the Directus 11-compatible values until the server version is available', () => {
		expect(getTableRowHeight('cozy')).toBe(48);
	});
});
