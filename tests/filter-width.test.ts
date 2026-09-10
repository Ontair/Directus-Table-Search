import { describe, expect, it } from 'vitest';

import { getInlineFilterControlWidth, shouldExpandInlineFilterLeft } from '../src/utils/filter-width';

describe('inline column-filter sizing', () => {
	it('tracks the column width while idle', () => {
		expect(getInlineFilterControlWidth(180, 'a long value', false)).toBe(164);
		expect(getInlineFilterControlWidth(40, '', false)).toBe(24);
	});

	it('expands with typed content without changing the column track', () => {
		expect(getInlineFilterControlWidth(180, '', true)).toBe(240);
		expect(getInlineFilterControlWidth(180, 'x'.repeat(35), true)).toBe(352);
		expect(getInlineFilterControlWidth(180, 'x'.repeat(100), true)).toBe(480);
		expect(getInlineFilterControlWidth(600, 'short', true)).toBe(584);
	});

	it('expands filters in the right half toward the left', () => {
		expect(shouldExpandInlineFilterLeft(1, 5)).toBe(false);
		expect(shouldExpandInlineFilterLeft(3, 5)).toBe(true);
		expect(shouldExpandInlineFilterLeft(4, 5)).toBe(true);
	});
});
