import type { ColumnFilterValues } from '../types';

export function pruneColumnFilters(values: ColumnFilterValues, visibleFields: readonly string[]): ColumnFilterValues {
	const visible = new Set(visibleFields);
	return Object.fromEntries(
		Object.entries(values).filter(([field, value]) => visible.has(field) && value.trim().length > 0),
	);
}
