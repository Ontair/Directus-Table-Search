import { describe, expect, it } from 'vitest';

import type { ColumnPlan } from '../src/types';
import { buildColumnFilterKinds, getColumnFilterControlConfig, getColumnFilterKind } from '../src/utils/filter-control';

describe('column filter controls', () => {
	it.each([
		['string', 'text'],
		['bigInteger', 'number'],
		['decimal', 'number'],
		['float', 'number'],
		['integer', 'number'],
		['boolean', 'boolean'],
		['date', 'date'],
		['dateTime', 'dateTime'],
		['timestamp', 'timestamp'],
		['time', 'time'],
		['uuid', 'uuid'],
		['csv', 'text'],
	] as const)('maps %s leaves to a %s control', (type, expected) => {
		expect(getColumnFilterKind(plan('value', type))).toBe(expected);
	});

	it('uses a regular text control for relational displays with mixed searchable values', () => {
		const relationPlan: ColumnPlan = {
			key: 'editor',
			searchLeaves: [
				{ path: 'editor.first_name', type: 'string' },
				{ path: 'editor.id', type: 'uuid' },
			],
		};

		expect(getColumnFilterKind(relationPlan)).toBe('mixed');
	});

	it('marks a column without supported leaves as unavailable', () => {
		expect(getColumnFilterKind({ key: 'payload', searchLeaves: [] })).toBe('unsupported');
		expect(getColumnFilterKind(plan('password', 'hash'))).toBe('unsupported');
		expect(getColumnFilterKind(plan('blob', 'unknown'))).toBe('unsupported');
		expect(buildColumnFilterKinds([plan('title', 'string'), plan('inn', 'bigInteger')])).toEqual({
			inn: 'number',
			title: 'text',
		});
	});

	it('describes exact-match controls directly in their placeholder and help text', () => {
		expect(getColumnFilterControlConfig('number')).toEqual({
			helpText: "Enter the complete numeric value; partial matching isn't supported.",
			inputType: 'text',
			placeholder: 'Full number only…',
			visibleHint: 'Exact value',
		});
		expect(getColumnFilterControlConfig('boolean').placeholder).toBe('Any');
		expect(getColumnFilterControlConfig('date')).toMatchObject({ inputType: 'text', placeholder: 'DD.MM.YYYY' });
		expect(getColumnFilterControlConfig('dateTime')).toMatchObject({
			inputType: 'text',
			placeholder: 'DD.MM.YYYY, HH:MM:SS',
		});
		expect(getColumnFilterControlConfig('time')).toMatchObject({ inputType: 'text', placeholder: 'HH:MM:SS' });
		expect(getColumnFilterControlConfig('uuid')).toMatchObject({ inputType: 'text', placeholder: 'Exact UUID…' });
		expect(getColumnFilterControlConfig('timestamp')).toMatchObject({
			inputType: 'text',
			placeholder: 'Exact ISO timestamp…',
			visibleHint: 'Exact ISO value',
		});
		expect(getColumnFilterControlConfig('unsupported')).toEqual({
			inputType: 'text',
			placeholder: 'Not searchable',
		});
	});
});

function plan(key: string, type: string): ColumnPlan {
	return { key, searchLeaves: [{ path: key, type }] };
}
