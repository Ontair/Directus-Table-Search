import type {
	ColumnFilterBuildResult,
	ColumnFilterValues,
	ColumnPlan,
	FilterBuildResult,
	FilterNode,
	SearchLeaf,
} from '../types';
import { getSearchValueKind } from './search-type';
import { buildPartialTemporalCondition } from './temporal-filter';

export const MAX_SEARCH_TERM_LENGTH = 256;
export const MAX_SEARCH_TOKEN_COUNT = 12;
export const MAX_GENERATED_SEARCH_CLAUSES = 256;

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
	if (exceedsSearchLimits(leaves, term)) {
		if (leaves[0]) return { filter: impossibleLeafCondition(leaves[0]), status: 'limited' };
		const guardPath = plans.find(({ guardPath }) => guardPath)?.guardPath;
		return guardPath
			? { filter: impossiblePathCondition(guardPath), status: 'limited' }
			: { filter: null, status: 'unsupported' };
	}

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

/**
 * Reports which columns could not be turned into a condition, not only that
 * some column could not: the caller needs the key to mark the control the
 * value was typed into, and a notice naming the column is the difference
 * between a fixable mistake and an empty table without a reason.
 */
export function buildColumnFiltersResult(plans: ColumnPlan[], values: ColumnFilterValues): ColumnFilterBuildResult {
	const conditions: FilterNode[] = [];
	const invalidKeys: string[] = [];
	const limitedKeys: string[] = [];
	const unsupportedKeys: string[] = [];
	let hasActiveValue = false;
	let needsFallbackGuard = false;

	for (const plan of plans) {
		const term = values[plan.key]?.trim();
		if (!term) continue;
		hasActiveValue = true;

		if (plan.searchLeaves.length === 0) {
			unsupportedKeys.push(plan.key);
			if (plan.guardPath) conditions.push(impossiblePathCondition(plan.guardPath));
			else needsFallbackGuard = true;
			continue;
		}

		if (exceedsSearchLimits(plan.searchLeaves, term)) {
			limitedKeys.push(plan.key);
			conditions.push(impossibleLeafCondition(plan.searchLeaves[0]!));
			continue;
		}

		const columnCondition = buildPlanCondition(plan, term, true);
		if (columnCondition) conditions.push(columnCondition);
		else {
			invalidKeys.push(plan.key);
			conditions.push(impossibleLeafCondition(plan.searchLeaves[0]!));
		}
	}

	if (!hasActiveValue) return { filter: null, invalidKeys, limitedKeys, status: 'empty', unsupportedKeys };

	if (needsFallbackGuard) {
		const fallbackLeaf = plans.flatMap((plan) => plan.searchLeaves)[0];
		if (fallbackLeaf) conditions.push(impossibleLeafCondition(fallbackLeaf));
	}

	const filter = combineWithAnd(conditions);
	if (filter) {
		if (limitedKeys.length > 0) return { filter, invalidKeys, limitedKeys, status: 'limited', unsupportedKeys };
		if (unsupportedKeys.length > 0) return { filter, invalidKeys, limitedKeys, status: 'unsupported', unsupportedKeys };
		if (invalidKeys.length > 0) return { filter, invalidKeys, limitedKeys, status: 'invalid', unsupportedKeys };
		return { filter, invalidKeys, limitedKeys, status: 'valid', unsupportedKeys };
	}

	return { filter: null, invalidKeys, limitedKeys, status: 'unsupported', unsupportedKeys };
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
			.map((token) => combineWithOr(textLeaves.map((leaf) => buildLeafCondition(leaf, token)).filter(isFilterNode)))
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
	} else if (kind === 'date' || kind === 'dateTime' || kind === 'time' || kind === 'timestamp') {
		if (isDateValue(leaf.type, term)) operation = { _eq: term } as FilterNode;
	}

	const conditions = [operation ? nestPath(leaf.path, operation) : null, buildChoiceCondition(leaf, term)].filter(
		isFilterNode,
	);
	return combineWithOr(conditions);
}

function buildChoiceCondition(leaf: SearchLeaf, term: string): FilterNode | null {
	const normalizedTerm = term.toLocaleLowerCase();
	const values = (leaf.choices ?? [])
		.filter(({ text }) => text.toLocaleLowerCase().includes(normalizedTerm))
		.map(({ value }) => value)
		.filter((value, index, all) => all.indexOf(value) === index);

	if (values.length === 0) return null;
	return nestPath(leaf.path, values.length === 1 ? { _eq: values[0] } : { _in: values });
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
	return offsetMinute <= 59 && (offsetHour < 14 || (offsetHour === 14 && offsetMinute === 0));
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

function exceedsSearchLimits(leaves: SearchLeaf[], term: string): boolean {
	if (term.length > MAX_SEARCH_TERM_LENGTH) return true;

	const tokens = term.split(/\s+/u).filter(Boolean);
	if (tokens.length > MAX_SEARCH_TOKEN_COUNT) return true;

	const unique = uniqueLeaves(leaves);
	const textLeafCount = unique.filter((leaf) => getSearchValueKind(leaf.type) === 'text').length;
	const estimatedClauses = unique.length + (tokens.length > 1 ? tokens.length * textLeafCount : 0);
	return estimatedClauses > MAX_GENERATED_SEARCH_CLAUSES;
}
