import type { SearchValueKind } from '../types';

const TEXT_TYPES = new Set(['csv', 'hash', 'string', 'text', 'unknown']);
const NUMBER_TYPES = new Set(['bigInteger', 'decimal', 'float', 'integer']);

export function getSearchValueKind(type: string): SearchValueKind {
	if (TEXT_TYPES.has(type)) return 'text';
	if (NUMBER_TYPES.has(type)) return 'number';
	if (type === 'boolean') return 'boolean';
	if (type === 'uuid') return 'uuid';
	if (type === 'date') return 'date';
	if (type === 'time') return 'time';
	if (type === 'dateTime' || type === 'timestamp') return 'dateTime';
	return 'unsupported';
}
