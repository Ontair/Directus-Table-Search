import type { ColumnFilterValues, ColumnPlan, FilterBuildResult, FilterNode, SearchLeaf } from '../types';
import { getSearchValueKind } from './search-type';
import { buildPartialTemporalCondition } from './temporal-filter';

export function buildGlobalSearchFilter(plans: ColumnPlan[], rawTerm: string | null | undefined): FilterNode | null {
	return buildGlobalSearchFilterResult(plans, rawTerm).filter;
}

export function buildGlobalSearchFilterResult(
	plans: ColumnPlan[],
	rawTerm: string | null | undefined,
): FilterBuildResult {
	const term = rawTerm?.trim();
	if (!term) return { filter: null, status: 'empty' };

	const leaves = uniqueLeaves(plans.flatMap((plan) => plan.searchLeaves));
	const conditions = plans.map((plan) => buildPlanCondition(plan, term, false)).filter(isFilterNode);
	const filter = combineWithOr(conditions);

	if (filter) return { filter, status: 'valid' };
	if (leaves[0]) return { filter: impossibleLeafCondition(leaves[0]), status: 'invalid' };

	const guardPath = plans.find(({ guardPath }) => guardPath)?.guardPath;
	if (guardPath) return { filter: impossiblePathCondition(guardPath), status: 'unsupported' };
	return { filter: null, status: 'unsupported' };
}

export function buildColumnFilters(plans: ColumnPlan[], values: ColumnFilterValues): FilterNode | null {
	return buildColumnFiltersResult(plans, values).filter;
}

export function buildColumnFiltersResult(plans: ColumnPlan[], values: ColumnFilterValues): FilterBuildResult {
	const conditions: FilterNode[] = [];
	let hasActiveValue = false;
	let hasInvalidValue = false;
	let hasUnsupportedValue = false;
	let needsFallbackGuard = false;

	for (const plan of plans) {
		const term = values[plan.key]?.trim();
		if (!term) continue;
		hasActiveValue = true;

		if (plan.searchLeaves.length === 0) {
			hasUnsupportedValue = true;
			if (plan.guardPath) conditions.push(impossiblePathCondition(plan.guardPath));
			else needsFallbackGuard = true;
			continue;
		}

		const columnCondition = buildPlanCondition(plan, term, true);
		if (columnCondition) conditions.push(columnCondition);
		else {
			hasInvalidValue = true;
			conditions.push(impossibleLeafCondition(plan.searchLeaves[0]!));
		}
	}

	if (!hasActiveValue) return { filter: null, status: 'empty' };

	if (needsFallbackGuard) {
		const fallbackLeaf = plans.flatMap((plan) => plan.searchLeaves)[0];
		if (fallbackLeaf) {
			hasInvalidValue = true;
			conditions.push(impossibleLeafCondition(fallbackLeaf));
		}
	}

	const filter = combineWithAnd(conditions);
	if (filter) {
		return { filter, status: hasUnsupportedValue ? 'unsupported' : hasInvalidValue ? 'invalid' : 'valid' };
	}
	return { filter: null, status: 'unsupported' };
}

function buildPlanCondition(plan: ColumnPlan, term: string, partialTemporal: boolean): FilterNode | null {
	const wholeValueConditions = plan.searchLeaves
		.map((leaf) => (partialTemporal ? buildColumnLeafCondition(leaf, term) : buildGlobalLeafCondition(leaf, term)))
		.filter(isFilterNode);
	const tokenizedTextCondition = buildTokenizedTextCondition(plan.searchLeaves, term);

	return combineWithOr([...wholeValueConditions, ...(tokenizedTextCondition ? [tokenizedTextCondition] : [])]);
}

function buildGlobalLeafCondition(leaf: SearchLeaf, term: string): FilterNode | null {
	const kind = getSearchValueKind(leaf.type);
	if (kind !== 'date' && kind !== 'dateTime' && kind !== 'time') return buildLeafCondition(leaf, term);

	const exactCondition = buildLeafCondition(leaf, term);
	if (exactCondition) return exactCondition;
	if (!/^[\d./:\-T\s]+$/iu.test(term)) return null;

	const structuredYear = /^\d{4}$/.test(term) ? `@t:${term},,,,,` : term;
	return buildPartialTemporalCondition(leaf, structuredYear);
}

function buildTokenizedTextCondition(leaves: SearchLeaf[], term: string): FilterNode | null {
	const tokens = term.split(/\s+/u).filter(Boolean);
	if (tokens.length < 2) return null;

	const textLeaves = uniqueLeaves(leaves).filter((leaf) => getSearchValueKind(leaf.type) === 'text');
	if (textLeaves.length === 0) return null;

	return combineWithAnd(
		tokens
			.map((token) =>
				combineWithOr(textLeaves.map((leaf) => nestPath(leaf.path, { _icontains: token })).filter(isFilterNode)),
			)
			.filter(isFilterNode),
	);
}

function buildColumnLeafCondition(leaf: SearchLeaf, term: string): FilterNode | null {
	const kind = getSearchValueKind(leaf.type);
	if (kind === 'date' || kind === 'dateTime' || kind === 'time') {
		return buildPartialTemporalCondition(leaf, term);
	}
	return buildLeafCondition(leaf, term);
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
	return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function isDateValue(type: string, value: string): boolean {
	if (type === 'date') return isValidDate(value);
	if (type === 'time') return isValidTime(value);

	const match = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|([+-])(\d{2}):(\d{2}))?$/);
	if (match === null || !isValidDate(match[1]!) || !isValidTime(match[2]!)) return false;
	if (!match[3] || match[3] === 'Z') return true;

	const offsetHour = Number(match[5]);
	const offsetMinute = Number(match[6]);
	return offsetHour <= 23 && offsetMinute <= 59;
}

function isValidDate(value: string): boolean {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return false;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (year < 1 || month < 1 || month > 12 || day < 1) return false;

	return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidTime(value: string): boolean {
	const match = value.match(/^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
	if (!match) return false;

	const hour = Number(match[1]);
	const minute = Number(match[2]);
	const second = match[3] === undefined ? 0 : Number(match[3]);
	return hour <= 23 && minute <= 59 && second <= 59;
}

function impossibleLeafCondition(leaf: SearchLeaf): FilterNode {
	return impossiblePathCondition(leaf.path);
}

function impossiblePathCondition(path: string): FilterNode {
	return { _and: [nestPath(path, { _null: true }), nestPath(path, { _nnull: true })] };
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
