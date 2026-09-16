import type { FilterNode, SearchLeaf } from '../types';

type TemporalComponent = 'day' | 'hour' | 'minute' | 'month' | 'second' | 'year';
type TemporalType = 'date' | 'dateTime' | 'time' | 'timestamp';

interface TemporalParts {
	day?: string;
	hour?: string;
	minute?: string;
	month?: string;
	second?: string;
	year?: string;
}

interface ParsedTemporalValue {
	invalid: boolean;
	parts: TemporalParts;
}

const DATE_COMPONENTS = [
	{ component: 'day', max: 31, min: 1, width: 2 },
	{ component: 'month', max: 12, min: 1, width: 2 },
] as const;

const TIME_COMPONENTS = [
	{ component: 'hour', max: 23, min: 0, width: 2 },
	{ component: 'minute', max: 59, min: 0, width: 2 },
	{ component: 'second', max: 59, min: 0, width: 2 },
] as const;

export function buildPartialTemporalCondition(leaf: SearchLeaf, rawValue: string): FilterNode | null {
	if (!isTemporalType(leaf.type)) return null;

	const parsed = parseTemporalValue(leaf.type, rawValue.trim());
	const conditions: FilterNode[] = [];
	let invalid = parsed.invalid;

	for (const definition of DATE_COMPONENTS) {
		const prefix = parsed.parts[definition.component];
		if (prefix === undefined) continue;
		const operation = buildDiscretePrefixOperation(prefix, definition.min, definition.max, definition.width);
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
		const operation = buildDiscretePrefixOperation(prefix, definition.min, definition.max, definition.width);
		if (!operation) invalid = true;
		else conditions.push(nestFunctionPath(leaf.path, definition.component, operation));
	}

	if (invalid || conditions.length === 0) return impossibleTemporalCondition(leaf);
	if (conditions.length === 1) return conditions[0] ?? null;
	return { _and: conditions };
}

function parseTemporalValue(type: TemporalType, value: string): ParsedTemporalValue {
	if (!value || !/^[\d./:\-T\s]+$/i.test(value)) return { invalid: true, parts: {} };
	if (type === 'time') return parseTimeValue(value);

	const separatorIndex = value.search(/[T\s]/i);
	const dateToken = separatorIndex === -1 ? value : value.slice(0, separatorIndex);
	const timeToken = separatorIndex === -1 ? undefined : value.slice(separatorIndex + 1).trimStart();
	const parsedDate = parseDateValue(dateToken);

	if (type === 'date') {
		return {
			invalid: parsedDate.invalid || timeToken !== undefined,
			parts: parsedDate.parts,
		};
	}

	if (timeToken === undefined || timeToken === '') return parsedDate;
	const parsedTime = parseTimeValue(timeToken);
	return {
		invalid: parsedDate.invalid || parsedTime.invalid,
		parts: { ...parsedDate.parts, ...parsedTime.parts },
	};
}

function parseDateValue(value: string): ParsedTemporalValue {
	if (!value) return { invalid: true, parts: {} };

	if (/[./-]/.test(value)) {
		const segments = value.split(/[./-]/);
		if (segments.length > 3 || segments.some((segment) => segment && !/^\d+$/.test(segment))) {
			return { invalid: true, parts: {} };
		}

		const isoOrder = value.includes('-') && segments[0]?.length === 4;
		const [first = '', second = '', third = ''] = segments;
		const parts: TemporalParts = {};
		assignPart(parts, isoOrder ? 'year' : 'day', first);
		assignPart(parts, 'month', second);
		assignPart(parts, isoOrder ? 'day' : 'year', third);
		return { invalid: false, parts };
	}

	if (!/^\d+$/.test(value) || value.length > 8) return { invalid: true, parts: {} };
	const parts: TemporalParts = {};
	assignPart(parts, 'day', value.slice(0, 2));
	assignPart(parts, 'month', value.slice(2, 4));
	assignPart(parts, 'year', value.slice(4, 8));
	return { invalid: false, parts };
}

function parseTimeValue(value: string): ParsedTemporalValue {
	if (!value) return { invalid: true, parts: {} };

	if (value.includes(':')) {
		const segments = value.split(':');
		if (segments.length > 3 || segments.some((segment) => segment && !/^\d+$/.test(segment))) {
			return { invalid: true, parts: {} };
		}

		const [hour = '', minute = '', second = ''] = segments;
		const parts: TemporalParts = {};
		assignPart(parts, 'hour', hour);
		assignPart(parts, 'minute', minute);
		assignPart(parts, 'second', second);
		return { invalid: false, parts };
	}

	if (!/^\d+$/.test(value) || value.length > 6) return { invalid: true, parts: {} };
	const parts: TemporalParts = {};
	assignPart(parts, 'hour', value.slice(0, 2));
	assignPart(parts, 'minute', value.slice(2, 4));
	assignPart(parts, 'second', value.slice(4, 6));
	return { invalid: false, parts };
}

function assignPart(parts: TemporalParts, component: TemporalComponent, value: string): void {
	if (value) parts[component] = value;
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
	const functionName = leaf.type === 'time' ? 'hour' : 'day';
	return nestFunctionPath(leaf.path, functionName, { _eq: leaf.type === 'time' ? -1 : 0 });
}

function isTemporalType(type: string): type is TemporalType {
	return type === 'date' || type === 'dateTime' || type === 'time' || type === 'timestamp';
}
