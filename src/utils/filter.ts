import type { ColumnFilterValues, ColumnPlan, FilterNode, SearchLeaf } from '../types';
import { getSearchValueKind } from './search-type';

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
	const kind = getSearchValueKind(leaf.type);

	if (kind === 'text') {
		operation = { _icontains: term } as FilterNode;
	} else if (kind === 'number') {
		const number = parseNumber(leaf.type, term);
		if (number !== null) operation = { _eq: number } as FilterNode;
	} else if (kind === 'boolean') {
		const value = parseBoolean(term);
		if (value !== null) operation = { _eq: value };
	} else if (kind === 'uuid') {
		if (isUuid(term)) operation = { _eq: term };
	} else if (kind === 'date' || kind === 'dateTime' || kind === 'time') {
		if (isDateValue(leaf.type, term)) operation = { _eq: term } as FilterNode;
	}

	return operation ? nestPath(leaf.path, operation) : null;
}

function parseNumber(type: string, term: string): number | string | null {
	if (type === 'bigInteger') return isInteger(term) ? term : null;
	if (type === 'decimal') return isDecimal(term) ? term : null;

	const value = Number(term);
	if (!Number.isFinite(value)) return null;
	if (type === 'integer' && (!Number.isInteger(value) || !Number.isSafeInteger(value))) return null;
	return value;
}

function isInteger(value: string): boolean {
	return /^[+-]?\d+$/.test(value);
}

function isDecimal(value: string): boolean {
	return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value);
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

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDateValue(type: string, value: string): boolean {
	if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value);
	if (type === 'time') return /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value);
	return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value);
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
