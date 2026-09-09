import type { ColumnFilterValues, ColumnPlan, FilterNode, SearchLeaf } from '../types';

const TEXT_TYPES = new Set(['csv', 'hash', 'string', 'text', 'unknown', 'uuid']);
const NUMBER_TYPES = new Set(['bigInteger', 'decimal', 'float', 'integer']);
const DATE_TYPES = new Set(['date', 'dateTime', 'time', 'timestamp']);

export function buildGlobalSearchFilter(plans: ColumnPlan[], rawTerm: string | null | undefined): FilterNode | null {
	const term = rawTerm?.trim();
	if (!term) return null;

	const conditions = uniqueLeaves(plans.flatMap((plan) => plan.searchLeaves))
		.map((leaf) => buildLeafCondition(leaf, term))
		.filter(isFilterNode);

	return combineWithOr(conditions);
}

export function buildColumnFilters(plans: ColumnPlan[], values: ColumnFilterValues): FilterNode | null {
	const conditions = plans
		.map((plan) => {
			const term = values[plan.key]?.trim();
			if (!term) return null;

			return combineWithOr(plan.searchLeaves.map((leaf) => buildLeafCondition(leaf, term)).filter(isFilterNode));
		})
		.filter(isFilterNode);

	return combineWithAnd(conditions);
}

export function combineFilters(...filters: Array<FilterNode | null | undefined>): FilterNode | null {
	const active = filters.filter(isFilterNode);
	return combineWithAnd(active);
}

export function buildLeafCondition(leaf: SearchLeaf, term: string): FilterNode | null {
	let operation: FilterNode | null = null;

	if (TEXT_TYPES.has(leaf.type)) {
		operation = { _icontains: term } as FilterNode;
	} else if (NUMBER_TYPES.has(leaf.type)) {
		const number = Number(term);
		if (Number.isFinite(number)) operation = { _eq: number } as FilterNode;
	} else if (leaf.type === 'boolean') {
		const value = parseBoolean(term);
		if (value !== null) operation = { _eq: value };
	} else if (DATE_TYPES.has(leaf.type)) {
		operation = { _eq: term } as FilterNode;
	}

	return operation ? nestPath(leaf.path, operation) : null;
}

export function nestPath(path: string, operation: FilterNode): FilterNode {
	return path
		.split('.')
		.filter(Boolean)
		.reverse()
		.reduce<FilterNode>((child, segment) => ({ [segment]: child }) as FilterNode, operation);
}

function combineWithAnd(filters: FilterNode[]): FilterNode | null {
	if (filters.length === 0) return null;
	if (filters.length === 1) return filters[0] ?? null;
	return { _and: filters } as FilterNode;
}

function combineWithOr(filters: FilterNode[]): FilterNode | null {
	if (filters.length === 0) return null;
	if (filters.length === 1) return filters[0] ?? null;
	return { _or: filters } as FilterNode;
}

function isFilterNode(value: FilterNode | null | undefined): value is FilterNode {
	return value !== null && value !== undefined && typeof value === 'object' && Object.keys(value).length > 0;
}

function parseBoolean(term: string): boolean | null {
	const normalized = term.toLocaleLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return null;
}

function uniqueLeaves(leaves: SearchLeaf[]): SearchLeaf[] {
	const seen = new Set<string>();
	return leaves.filter((leaf) => {
		const key = `${leaf.path}:${leaf.type}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
