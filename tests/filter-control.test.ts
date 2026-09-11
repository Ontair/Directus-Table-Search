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
		['timestamp', 'dateTime'],
		['time', 'time'],
		['uuid', 'uuid'],
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
		expect(buildColumnFilterKinds([plan('title', 'string'), plan('inn', 'bigInteger')])).toEqual({
			inn: 'number',
			title: 'text',
		});
	});

	it('describes exact-match controls directly in their placeholder and help text', () => {
		expect(getColumnFilterControlConfig('number')).toEqual({
			helpText: 'Numeric fields are matched by exact value.',
			inputType: 'text',
			placeholder: 'Exact number…',
		});
		expect(getColumnFilterControlConfig('boolean').placeholder).toBe('Any');
		expect(getColumnFilterControlConfig('date')).toMatchObject({ inputType: 'date', placeholder: 'Exact date…' });
		expect(getColumnFilterControlConfig('dateTime')).toMatchObject({
			inputType: 'datetime-local',
			placeholder: 'Exact date and time…',
		});
		expect(getColumnFilterControlConfig('time')).toMatchObject({ inputType: 'time', placeholder: 'Exact time…' });
		expect(getColumnFilterControlConfig('uuid')).toMatchObject({ inputType: 'text', placeholder: 'Exact UUID…' });
		expect(getColumnFilterControlConfig('unsupported')).toEqual({
			inputType: 'text',
			placeholder: 'Not searchable',
		});
	});
});

function plan(key: string, type: string): ColumnPlan {
	return { key, searchLeaves: [{ path: key, type }] };
}
