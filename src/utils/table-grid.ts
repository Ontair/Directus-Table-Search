export interface TableGridMetrics {
	columnWidths: number[];
	templateColumns: string;
}

/**
 * Read the grid resolved by Directus' VTable header. VTable's auxiliary
 * columns have changed between Directus releases, so copying the browser's
 * resolved grid keeps the filter row aligned without version-specific sizes.
 */
export function getTableGridMetrics(
	headerRow: Element,
	dataColumnOffset: number,
	dataColumnCount: number,
): TableGridMetrics | null {
	const templateColumns = getComputedStyle(headerRow).gridTemplateColumns.trim();
	if (!templateColumns || templateColumns === 'none') return null;

	const cells = Array.from(headerRow.children).filter((element) => element.matches('th, td'));
	const dataCells = cells.slice(dataColumnOffset, dataColumnOffset + dataColumnCount);
	if (dataCells.length !== dataColumnCount) return null;

	const columnWidths = dataCells.map((element) => element.getBoundingClientRect().width);
	if (columnWidths.some((width) => !Number.isFinite(width) || width <= 0)) return null;

	return { columnWidths, templateColumns };
}
