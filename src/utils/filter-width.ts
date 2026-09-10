const CONTROL_GUTTER = 16;
const CHARACTER_WIDTH = 8;
const CONTENT_PADDING = 72;
const MIN_EXPANDED_WIDTH = 240;
const MAX_EXPANDED_WIDTH = 480;

/**
 * Keep an idle filter inside its column, then let it grow over adjacent cells
 * while focused. The containing grid track never changes, so table geometry,
 * resizing, and horizontal scrolling remain stable.
 */
export function getInlineFilterControlWidth(columnWidth: number, value: string, focused: boolean): number {
	const baseWidth = Math.max(0, columnWidth - CONTROL_GUTTER);
	if (!focused) return baseWidth;

	const contentWidth = Array.from(value).length * CHARACTER_WIDTH + CONTENT_PADDING;
	const expandedWidth = Math.min(MAX_EXPANDED_WIDTH, Math.max(MIN_EXPANDED_WIDTH, contentWidth));
	return Math.max(baseWidth, expandedWidth);
}

export function shouldExpandInlineFilterLeft(index: number, total: number): boolean {
	return total > 1 && index >= Math.ceil(total / 2);
}
