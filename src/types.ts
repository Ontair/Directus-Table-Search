import type { Field, Item, Relation } from '@directus/types';

export type FilterNode = Record<string, unknown>;

export type ShowSelect = 'multiple' | 'none' | 'one';

export type ColumnFilterValues = Record<string, string>;

export type TableSpacing = 'compact' | 'cozy' | 'comfortable';

export interface LayoutOptions {
	align?: Record<string, ColumnAlignment>;
	showColumnFilters?: boolean;
	spacing?: TableSpacing;
	widths?: Record<string, number>;
}

export interface LayoutQuery {
	columnFilters?: ColumnFilterValues;
	fields?: string[];
	limit?: number;
	page?: number;
	sort?: string[];
}

export type ColumnAlignment = 'left' | 'center' | 'right';

export interface HeaderField {
	collection: string;
	display: string;
	displayOptions?: Record<string, unknown> | null;
	field: string;
	interface?: string | null;
	interfaceOptions?: Record<string, unknown> | null;
	type: string;
}

export interface TableHeader {
	align: ColumnAlignment;
	description: string | null;
	field: HeaderField;
	sortable: boolean;
	text: string;
	value: string;
	width: number;
}

export interface SearchLeaf {
	path: string;
	type: string;
}

export interface ColumnPlan {
	fetchPaths: string[];
	key: string;
	searchLeaves: SearchLeaf[];
}

export interface MetadataAccess {
	canReadField(collection: string, field: string): boolean;
	getDisplayFields(field: Field): string[];
	getField(collection: string, field: string): Field | null;
	getPrimaryKeyField(collection: string): Field | null;
	getRelationsForField(collection: string, field: string): Relation[];
}

export interface ResolvedFieldPath {
	field: Field;
	path: string;
}

export interface LayoutComponentProps {
	changeManualSort: (data: { item: number | string; to: number | string }) => Promise<void>;
	collection: string;
	columnFilters: ColumnFilterValues;
	error?: unknown;
	fields: string[];
	itemCount?: number | null;
	items: Item[];
	limit: number;
	loading: boolean;
	onAlignChange: (field: string, align: ColumnAlignment) => void;
	onRowClick: (payload: { event: PointerEvent; item: Item }) => void;
	onSortChange: (sort: TableSort | null) => void;
	page: number;
	primaryKeyField?: Field | null;
	resetPresetAndRefresh: () => Promise<void>;
	search?: string | null;
	searchableFields: string[];
	selectAll: () => void;
	selection: (number | string)[];
	showColumnFilters: boolean;
	showSelect: ShowSelect;
	sortAllowed: boolean;
	sortField?: string | null;
	tableHeaders: TableHeader[];
	tableRowHeight: number;
	tableSort: TableSort | null;
	toPage: (page: number) => void;
	totalPages: number;
}

export interface TableSort {
	by: string;
	desc: boolean;
}
