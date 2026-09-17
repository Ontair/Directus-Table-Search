import { describe, expect, it } from 'vitest';

import { isFieldAllowed } from '../src/utils/field-permission';

describe('isFieldAllowed', () => {
	it('treats a missing permission record as administrator access', () => {
		expect(isFieldAllowed(null, 'sort')).toBe(true);
	});

	it('requires an explicit field or wildcard for stored permissions', () => {
		expect(isFieldAllowed({ access: 'partial', fields: null }, 'sort')).toBe(false);
		expect(isFieldAllowed({ access: 'partial', fields: [] }, 'sort')).toBe(false);
		expect(isFieldAllowed({ access: 'partial', fields: ['title'] }, 'sort')).toBe(false);
		expect(isFieldAllowed({ access: 'partial', fields: ['sort'] }, 'sort')).toBe(true);
		expect(isFieldAllowed({ access: 'full', fields: ['*'] }, 'sort')).toBe(true);
	});
});
