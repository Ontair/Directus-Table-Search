import type { TableSpacing } from '../types';

const LEGACY_HEIGHTS: Record<TableSpacing, number> = {
	compact: 32,
	comfortable: 64,
	cozy: 48,
};

const CURRENT_HEIGHTS: Record<TableSpacing, number> = {
	compact: 29,
	comfortable: 58,
	cozy: 43,
};

export function getTableRowHeight(spacing: TableSpacing, directusVersion?: string | null): number {
	const majorVersion = Number.parseInt(directusVersion?.split('.')[0] ?? '', 10);
	const heights = Number.isFinite(majorVersion) && majorVersion >= 12 ? CURRENT_HEIGHTS : LEGACY_HEIGHTS;
	return heights[spacing];
}
