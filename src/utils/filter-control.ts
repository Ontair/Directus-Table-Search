import type { ColumnFilterControlKind, ColumnPlan } from '../types';
import { getSearchValueKind } from './search-type';

export interface ColumnFilterControlConfig {
	helpText?: string;
	inputType: 'date' | 'datetime-local' | 'text' | 'time';
	placeholder: string;
}

export function buildColumnFilterKinds(plans: ColumnPlan[]): Record<string, ColumnFilterControlKind> {
	return Object.fromEntries(plans.map((plan) => [plan.key, getColumnFilterKind(plan)]));
}

export function getColumnFilterKind(plan: ColumnPlan): ColumnFilterControlKind {
	const kinds = new Set(plan.searchLeaves.map(({ type }) => getSearchValueKind(type)).filter(isSupportedKind));

	if (kinds.size === 0) return 'unsupported';
	if (kinds.size === 1) return [...kinds][0]!;
	return 'mixed';
}

export function getColumnFilterControlConfig(kind: ColumnFilterControlKind): ColumnFilterControlConfig {
	if (kind === 'number') {
		return {
			helpText: "Enter the complete numeric value; partial matching isn't supported.",
			inputType: 'text',
			placeholder: 'Full number only…',
		};
	}

	if (kind === 'boolean') {
		return {
			helpText: 'Boolean fields are matched by exact value.',
			inputType: 'text',
			placeholder: 'Any',
		};
	}

	if (kind === 'date' || kind === 'dateTime' || kind === 'time') {
		return {
			helpText: 'The filter is applied while you type. Incomplete date and time segments are supported.',
			inputType: 'text',
			placeholder: kind === 'date' ? 'DD.MM.YYYY…' : kind === 'time' ? 'HH:MM:SS…' : 'DD.MM.YYYY HH:MM…',
		};
	}

	if (kind === 'uuid') {
		return {
			helpText: 'UUID fields are matched by exact value.',
			inputType: 'text',
			placeholder: 'Exact UUID…',
		};
	}

	return {
		inputType: 'text',
		placeholder: kind === 'unsupported' ? 'Not searchable' : 'Filter…',
	};
}

function isSupportedKind(kind: ColumnFilterControlKind): boolean {
	return kind !== 'unsupported';
}
