export interface FieldPermission {
	access?: 'full' | 'none' | 'partial';
	fields?: string[] | null;
}

/**
 * Mirrors Directus' field-level permission rule. A missing permission record
 * is used for administrators; a present record must explicitly expose either
 * the requested field or the wildcard.
 */
export function isFieldAllowed(permission: FieldPermission | null, field: string): boolean {
	if (permission === null) return true;
	if (permission.access === 'none' || !Array.isArray(permission.fields)) return false;

	return permission.fields.includes('*') || permission.fields.includes(field);
}
