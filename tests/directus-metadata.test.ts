import type { Relation } from '@directus/types';
import { describe, expect, it, vi } from 'vitest';

import { createDirectusMetadataAccess } from '../src/services/directus-metadata';
import { field } from './fixtures/schema';

describe('createDirectusMetadataAccess', () => {
	it('uses full admin access when no explicit permission record exists', () => {
		const access = makeAccess({ permission: null, hasPermission: true });
		expect(access.canReadField('articles', 'title')).toBe(true);
	});

	it('honors partial field permissions and wildcards', () => {
		const partial = makeAccess({
			hasPermission: true,
			permission: { access: 'partial', fields: ['id', 'title'] },
		});
		expect(partial.canReadField('articles', 'title')).toBe(true);
		expect(partial.canReadField('articles', 'secret')).toBe(false);

		const wildcard = makeAccess({ hasPermission: true, permission: { access: 'full', fields: ['*'] } });
		expect(wildcard.canReadField('articles', 'anything')).toBe(true);
	});

	it('invokes a display field resolver with field context', () => {
		const resolver = vi.fn(() => ['first_name', 'last_name']);
		const access = makeAccess({
			displays: [{ id: 'related-values', fields: resolver }],
			hasPermission: true,
			permission: null,
		});
		const author = field('articles', 'author', 'integer', {
			display: 'related-values',
			displayOptions: { template: '{{ first_name }}' },
		});

		expect(access.getDisplayFields(author)).toEqual(['first_name', 'last_name']);
		expect(resolver).toHaveBeenCalledWith(
			{ template: '{{ first_name }}' },
			{ collection: 'articles', field: 'author', type: 'integer' },
		);
	});
});

function makeAccess(options: {
	displays?: Array<{
		fields?: string[] | ((options: Record<string, unknown> | null, context: any) => string[]);
		id: string;
	}>;
	hasPermission: boolean;
	permission: { access?: 'full' | 'partial' | 'none'; fields?: string[] | null } | null;
}) {
	return createDirectusMetadataAccess({
		displays: () => options.displays ?? [],
		fieldsStore: {
			getField: () => null,
			getPrimaryKeyFieldForCollection: () => null,
		},
		permissionsStore: {
			getPermission: () => options.permission,
			hasPermission: () => options.hasPermission,
		},
		relationsStore: {
			getRelationsForField: () => [] as Relation[],
		},
	});
}
