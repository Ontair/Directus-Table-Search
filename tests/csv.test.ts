import { describe, expect, it } from 'vitest';

import { buildCsvDocument, createCsvFilename } from '../src/utils/csv';

describe('CSV export', () => {
	it('encodes headings, unicode, quotes, arrays and line breaks', () => {
		const csv = buildCsvDocument(['Name', 'Related', 'Note'], [['Организация', ['One', 'Two'], 'line 1\n"line 2"']]);

		expect(csv).toBe('\uFEFF"Name","Related","Note"\r\n"Организация","[""One"",""Two""]","line 1\n""line 2"""');
	});

	it('preserves booleans and zero while neutralizing spreadsheet formulas', () => {
		expect(buildCsvDocument(['False', 'Zero', 'Formula'], [[false, 0, '=1+1']])).toBe(
			'\uFEFF"False","Zero","Formula"\r\n"false","0","\'=1+1"',
		);
	});

	it('creates the same date-stamped filename shape as the native table', () => {
		expect(createCsvFilename('organizations', new Date(2026, 8, 7))).toBe('organizations-20260907.csv');
	});
});
