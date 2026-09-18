import type { FilterNode, SearchLeaf } from '../types';

type TemporalComponent = 'day' | 'hour' | 'minute' | 'month' | 'second' | 'year';
export type TemporalFilterType = 'date' | 'dateTime' | 'time' | 'timestamp';

export interface TemporalFilterParts {
	day?: string;
	hour?: string;
	minute?: string;
	month?: string;
	second?: string;
	year?: string;
}

interface ParsedTemporalValue {
	invalid: boolean;
	parts: TemporalFilterParts;
	structured: boolean;
}

export interface TemporalFilterOptions {
	timestampTimezoneOffset?: (parts: Required<TemporalFilterParts>) => number;
}

const STRUCTURED_VALUE_PREFIX = '@t:';
const STRUCTURED_PART_ORDER = ['year', 'month', 'day', 'hour', 'minute', 'second'] as const;

const DATE_COMPONENTS = [
	{ component: 'day', max: 31, min: 1, width: 2 },
	{ component: 'month', max: 12, min: 1, width: 2 },
] as const;

const TIME_COMPONENTS = [
	{ component: 'hour', max: 23, min: 0, width: 2 },
	{ component: 'minute', max: 59, min: 0, width: 2 },
	{ component: 'second', max: 59, min: 0, width: 2 },
] as const;

export function buildPartialTemporalCondition(
	leaf: SearchLeaf,
	rawValue: string,
	options: TemporalFilterOptions = {},
): FilterNode | null {
	if (!isTemporalType(leaf.type)) return null;

	const parsed = parseTemporalValue(leaf.type, rawValue.trim());
	if (leaf.type === 'timestamp') return buildTimestampCondition(leaf, parsed, options);

	const conditions: FilterNode[] = [];
	let invalid = parsed.invalid;

	for (const definition of DATE_COMPONENTS) {
		const prefix = parsed.parts[definition.component];
		if (prefix === undefined) continue;
		const operation = parsed.structured
			? buildExactComponentOperation(prefix, definition.min, definition.max, definition.width)
			: buildDiscretePrefixOperation(prefix, definition.min, definition.max, definition.width);
		if (!operation) invalid = true;
		else conditions.push(nestFunctionPath(leaf.path, definition.component, operation));
	}

	if (parsed.parts.year !== undefined) {
		const operation = buildYearPrefixOperation(parsed.parts.year);
		if (!operation) invalid = true;
		else conditions.push(nestFunctionPath(leaf.path, 'year', operation));
	}

	for (const definition of TIME_COMPONENTS) {
		const prefix = parsed.parts[definition.component];
		if (prefix === undefined) continue;
		const operation = parsed.structured
			? buildExactComponentOperation(prefix, definition.min, definition.max, definition.width)
			: buildDiscretePrefixOperation(prefix, definition.min, definition.max, definition.width);
		if (!operation) invalid = true;
		else conditions.push(nestFunctionPath(leaf.path, definition.component, operation));
	}

	if (invalid || conditions.length === 0) return impossibleTemporalCondition(leaf);
	if (conditions.length === 1) return conditions[0] ?? null;
	return { _and: conditions };
}

export function encodeTemporalFilterValue(parts: TemporalFilterParts): string {
	const values = STRUCTURED_PART_ORDER.map((component) => parts[component]?.trim() ?? '');
	return values.some(Boolean) ? `${STRUCTURED_VALUE_PREFIX}${values.join(',')}` : '';
}

export function decodeTemporalFilterValue(type: TemporalFilterType, rawValue: string): TemporalFilterParts {
	const value = rawValue.trim();
	if (!value) return {};
	return parseTemporalValue(type, value).parts;
}

function parseTemporalValue(type: TemporalFilterType, value: string): ParsedTemporalValue {
	if (value.startsWith(STRUCTURED_VALUE_PREFIX)) return parseStructuredTemporalValue(type, value);
	if (!value || !/^[\d./:\-T\s]+$/i.test(value)) return { invalid: true, parts: {}, structured: false };
	if (type === 'time') return parseTimeValue(value);

	const separatorIndex = value.search(/[T\s]/i);
	const dateToken = separatorIndex === -1 ? value : value.slice(0, separatorIndex);
	const timeToken = separatorIndex === -1 ? undefined : value.slice(separatorIndex + 1).trimStart();
	const parsedDate = parseDateValue(dateToken);

	if (type === 'date') {
		return {
			invalid: parsedDate.invalid || timeToken !== undefined,
			parts: parsedDate.parts,
			structured: false,
		};
	}

	if (timeToken === undefined || timeToken === '') return parsedDate;
	const parsedTime = parseTimeValue(timeToken);
	return {
		invalid: parsedDate.invalid || parsedTime.invalid,
		parts: { ...parsedDate.parts, ...parsedTime.parts },
		structured: false,
	};
}

function parseStructuredTemporalValue(type: TemporalFilterType, value: string): ParsedTemporalValue {
	const segments = value.slice(STRUCTURED_VALUE_PREFIX.length).split(',');
	const parts: TemporalFilterParts = {};
	let invalid = segments.length > STRUCTURED_PART_ORDER.length;

	for (const [index, component] of STRUCTURED_PART_ORDER.entries()) {
		const segment = segments[index] ?? '';
		if (!segment) continue;
		if (!/^\d+$/.test(segment) || !isComponentAllowed(type, component)) {
			invalid = true;
			continue;
		}
		parts[component] = segment;
	}

	return { invalid, parts, structured: true };
}

function parseDateValue(value: string): ParsedTemporalValue {
	if (!value) return { invalid: true, parts: {}, structured: false };

	if (/[./-]/.test(value)) {
		const segments = value.split(/[./-]/);
		if (segments.length > 3 || segments.some((segment) => segment && !/^\d+$/.test(segment))) {
			return { invalid: true, parts: {}, structured: false };
		}

		const isoOrder = value.includes('-') && segments[0]?.length === 4;
		const [first = '', second = '', third = ''] = segments;
		const parts: TemporalFilterParts = {};
		assignPart(parts, isoOrder ? 'year' : 'day', first);
		assignPart(parts, 'month', second);
		assignPart(parts, isoOrder ? 'day' : 'year', third);
		return { invalid: false, parts, structured: false };
	}

	if (!/^\d+$/.test(value) || value.length > 8) return { invalid: true, parts: {}, structured: false };
	const parts: TemporalFilterParts = {};
	assignPart(parts, 'day', value.slice(0, 2));
	assignPart(parts, 'month', value.slice(2, 4));
	assignPart(parts, 'year', value.slice(4, 8));
	return { invalid: false, parts, structured: false };
}

function parseTimeValue(value: string): ParsedTemporalValue {
	if (!value) return { invalid: true, parts: {}, structured: false };

	if (value.includes(':')) {
		const segments = value.split(':');
		if (segments.length > 3 || segments.some((segment) => segment && !/^\d+$/.test(segment))) {
			return { invalid: true, parts: {}, structured: false };
		}

		const [hour = '', minute = '', second = ''] = segments;
		const parts: TemporalFilterParts = {};
		assignPart(parts, 'hour', hour);
		assignPart(parts, 'minute', minute);
		assignPart(parts, 'second', second);
		return { invalid: false, parts, structured: false };
	}

	if (!/^\d+$/.test(value) || value.length > 6) return { invalid: true, parts: {}, structured: false };
	const parts: TemporalFilterParts = {};
	assignPart(parts, 'hour', value.slice(0, 2));
	assignPart(parts, 'minute', value.slice(2, 4));
	assignPart(parts, 'second', value.slice(4, 6));
	return { invalid: false, parts, structured: false };
}

function assignPart(parts: TemporalFilterParts, component: TemporalComponent, value: string): void {
	if (value) parts[component] = value;
}

function buildExactComponentOperation(value: string, min: number, max: number, width: number): FilterNode | null {
	if (!/^\d+$/.test(value) || value.length > width) return null;
	const numericValue = Number(value);
	return numericValue >= min && numericValue <= max ? { _eq: numericValue } : null;
}

function buildDiscretePrefixOperation(prefix: string, min: number, max: number, width: number): FilterNode | null {
	if (!/^\d+$/.test(prefix) || prefix.length > width) return null;

	const values = Array.from({ length: max - min + 1 }, (_, index) => min + index).filter((value) => {
		const regular = String(value);
		const padded = regular.padStart(width, '0');
		return regular.startsWith(prefix) || padded.startsWith(prefix);
	});

	if (values.length === 0) return null;
	if (values.length === 1) return { _eq: values[0] };
	return { _in: values };
}

function buildYearPrefixOperation(prefix: string): FilterNode | null {
	if (!/^\d{1,4}$/.test(prefix)) return null;
	if (prefix.length === 4) {
		const year = Number(prefix);
		return year > 0 ? { _eq: year } : null;
	}

	const multiplier = 10 ** (4 - prefix.length);
	const start = Number(prefix) * multiplier;
	return { _gte: start, _lt: start + multiplier };
}

function nestFunctionPath(path: string, functionName: TemporalComponent, operation: FilterNode): FilterNode {
	const segments = path.split('.').filter(Boolean);
	const field = segments.pop();
	if (!field) return operation;
	segments.push(`${functionName}(${field})`);
	return segments.reverse().reduce<FilterNode>((child, segment) => ({ [segment]: child }), operation);
}

function impossibleTemporalCondition(leaf: SearchLeaf): FilterNode {
	if (leaf.type === 'timestamp') {
		return { _and: [nestFieldPath(leaf.path, { _null: true }), nestFieldPath(leaf.path, { _nnull: true })] };
	}

	const functionName = leaf.type === 'time' ? 'hour' : 'day';
	return nestFunctionPath(leaf.path, functionName, { _eq: leaf.type === 'time' ? -1 : 0 });
}

function isTemporalType(type: string): type is TemporalFilterType {
	return type === 'date' || type === 'dateTime' || type === 'time' || type === 'timestamp';
}

function isComponentAllowed(type: TemporalFilterType, component: TemporalComponent): boolean {
	if (type === 'date') return component === 'day' || component === 'month' || component === 'year';
	if (type === 'time') return component === 'hour' || component === 'minute' || component === 'second';
	return true;
}

type TimestampPrecision = 'day' | 'hour' | 'minute' | 'month' | 'second' | 'year';

function buildTimestampCondition(
	leaf: SearchLeaf,
	parsed: ParsedTemporalValue,
	options: TemporalFilterOptions,
): FilterNode {
	if (parsed.invalid) return impossibleTemporalCondition(leaf);

	const normalized = normalizeTimestampParts(parsed.parts);
	if (!normalized) return impossibleTemporalCondition(leaf);

	const start = localTimestampToUtc(normalized.parts, options.timestampTimezoneOffset);
	if (!start) return impossibleTemporalCondition(leaf);
	if (normalized.precision === 'second') return nestFieldPath(leaf.path, { _eq: start.toISOString() });

	const nextLocalParts = incrementLocalTimestamp(normalized.parts, normalized.precision);
	const end = localTimestampToUtc(nextLocalParts, options.timestampTimezoneOffset);
	if (!end || end.getTime() <= start.getTime()) return impossibleTemporalCondition(leaf);

	return nestFieldPath(leaf.path, { _gte: start.toISOString(), _lt: end.toISOString() });
}

function normalizeTimestampParts(
	parts: TemporalFilterParts,
): { parts: Required<TemporalFilterParts>; precision: TimestampPrecision } | null {
	const ordered = [parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second];
	const firstMissing = ordered.findIndex((value) => value === undefined);
	const populatedLength = firstMissing === -1 ? ordered.length : firstMissing;
	if (populatedLength === 0 || ordered.slice(populatedLength).some((value) => value !== undefined)) return null;

	const widths = [4, 2, 2, 2, 2, 2];
	for (let index = 0; index < populatedLength; index += 1) {
		if (!new RegExp(`^\\d{${widths[index]}}$`).test(ordered[index]!)) return null;
	}

	const normalized: Required<TemporalFilterParts> = {
		day: parts.day ?? '01',
		hour: parts.hour ?? '00',
		minute: parts.minute ?? '00',
		month: parts.month ?? '01',
		second: parts.second ?? '00',
		year: parts.year!,
	};
	const precision = (['year', 'month', 'day', 'hour', 'minute', 'second'] as const)[populatedLength - 1]!;

	return isValidTimestampParts(normalized) ? { parts: normalized, precision } : null;
}

function isValidTimestampParts(parts: Required<TemporalFilterParts>): boolean {
	const year = Number(parts.year);
	const month = Number(parts.month);
	const day = Number(parts.day);
	const hour = Number(parts.hour);
	const minute = Number(parts.minute);
	const second = Number(parts.second);
	if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;

	return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function localTimestampToUtc(
	parts: Required<TemporalFilterParts>,
	offsetResolver: TemporalFilterOptions['timestampTimezoneOffset'],
): Date | null {
	const offset = offsetResolver?.(parts) ?? browserTimezoneOffset(parts);
	if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) return null;

	const timestamp = createUtcDate(parts).getTime() + offset * 60_000;
	const date = new Date(timestamp);
	return Number.isNaN(date.getTime()) ? null : date;
}

function browserTimezoneOffset(parts: Required<TemporalFilterParts>): number {
	const local = new Date(0);
	local.setFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
	local.setHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0);
	if (
		local.getFullYear() !== Number(parts.year) ||
		local.getMonth() !== Number(parts.month) - 1 ||
		local.getDate() !== Number(parts.day) ||
		local.getHours() !== Number(parts.hour) ||
		local.getMinutes() !== Number(parts.minute) ||
		local.getSeconds() !== Number(parts.second)
	) {
		return Number.NaN;
	}

	return local.getTimezoneOffset();
}

function incrementLocalTimestamp(
	parts: Required<TemporalFilterParts>,
	precision: Exclude<TimestampPrecision, 'second'>,
): Required<TemporalFilterParts> {
	const next = createUtcDate(parts);

	if (precision === 'year') next.setUTCFullYear(next.getUTCFullYear() + 1);
	else if (precision === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
	else if (precision === 'day') next.setUTCDate(next.getUTCDate() + 1);
	else if (precision === 'hour') next.setUTCHours(next.getUTCHours() + 1);
	else next.setUTCMinutes(next.getUTCMinutes() + 1);

	return {
		day: String(next.getUTCDate()).padStart(2, '0'),
		hour: String(next.getUTCHours()).padStart(2, '0'),
		minute: String(next.getUTCMinutes()).padStart(2, '0'),
		month: String(next.getUTCMonth() + 1).padStart(2, '0'),
		second: String(next.getUTCSeconds()).padStart(2, '0'),
		year: String(next.getUTCFullYear()).padStart(4, '0'),
	};
}

function createUtcDate(parts: Required<TemporalFilterParts>): Date {
	const date = new Date(0);
	date.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
	date.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0);
	return date;
}

function nestFieldPath(path: string, operation: FilterNode): FilterNode {
	return path
		.split('.')
		.filter(Boolean)
		.reverse()
		.reduce<FilterNode>((child, segment) => ({ [segment]: child }), operation);
}
