// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTableGridMetrics } from '../src/utils/table-grid';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Directus table-grid measurement', () => {
	it('uses the resolved VTable grid and skips auxiliary columns', () => {
		const row = document.createElement('tr');
		const widths = [36, 36, 180, 240, 12, 36];

		for (const width of widths) {
			const cell = document.createElement('th');
			cell.getBoundingClientRect = () => ({ width }) as DOMRect;
			row.append(cell);
		}

		vi.spyOn(window, 'getComputedStyle').mockReturnValue({
			gridTemplateColumns: '36px 36px 180px 240px 12px 36px',
		} as CSSStyleDeclaration);

		expect(getTableGridMetrics(row, 2, 2)).toEqual({
			columnWidths: [180, 240],
			templateColumns: '36px 36px 180px 240px 12px 36px',
		});
	});

	it('rejects an incomplete or unresolved table header', () => {
		const row = document.createElement('tr');
		row.append(document.createElement('th'));

		vi.spyOn(window, 'getComputedStyle').mockReturnValue({ gridTemplateColumns: 'none' } as CSSStyleDeclaration);
		expect(getTableGridMetrics(row, 0, 1)).toBeNull();

		vi.mocked(window.getComputedStyle).mockReturnValue({ gridTemplateColumns: '180px' } as CSSStyleDeclaration);
		expect(getTableGridMetrics(row, 1, 1)).toBeNull();
	});
});
