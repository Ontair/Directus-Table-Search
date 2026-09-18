import { isPublishedVersionKey } from '@directus/constants';
import type { Item } from '@directus/types';

type PrimaryKey = number | string;

export type RowInteraction =
	| { type: 'none' }
	| { selection: PrimaryKey[]; type: 'selection' }
	| { route: string; type: 'navigate' };

export interface RowInteractionInput {
	collection: string;
	item: Item;
	primaryKeyField: string | null | undefined;
	readonly: boolean;
	selection: PrimaryKey[];
	selectMode: boolean;
	versionKey?: string | null;
}

/**
 * Pure counterpart of Directus' table row-click behavior. Keeping navigation
 * and selection decisions outside Vue makes host-version parity testable.
 */
export function planRowInteraction(input: RowInteractionInput): RowInteraction {
	if (input.readonly || !input.primaryKeyField) return { type: 'none' };

	const primaryKey = input.item[input.primaryKeyField] as PrimaryKey | null | undefined;
	const versionId = getVersionId(input.item);
	const isVersion = Boolean(input.versionKey && !isPublishedVersionKey(input.versionKey));
	const selectionId = isVersion ? versionId : primaryKey;

	if (input.selectMode || input.selection.length > 0) {
		if (selectionId === null || selectionId === undefined) return { type: 'none' };

		return {
			selection: input.selection.includes(selectionId)
				? input.selection.filter((selected) => selected !== selectionId)
				: [...input.selection, selectionId],
			type: 'selection',
		};
	}

	const isItemlessVersion = primaryKey === null && versionId !== null;
	if (!isItemlessVersion && (primaryKey === null || primaryKey === undefined)) return { type: 'none' };

	const itemKey = isItemlessVersion ? '+' : String(primaryKey);
	const encodedItemKey = isItemlessVersion ? '+' : encodeURIComponent(itemKey);
	const path = `/content/${encodeURIComponent(input.collection)}/${encodedItemKey}`;
	const query = new URLSearchParams();
	if (input.versionKey) query.set('version', input.versionKey);
	if (isItemlessVersion && versionId) query.set('versionId', versionId);

	return { route: query.size > 0 ? `${path}?${query.toString()}` : path, type: 'navigate' };
}

function getVersionId(item: Item): string | null {
	const meta = item.$meta;
	if (!meta || typeof meta !== 'object') return null;
	const versionId = (meta as Record<string, unknown>).version_id;
	return typeof versionId === 'string' && versionId ? versionId : null;
}
