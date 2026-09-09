import type { Field, Relation } from '@directus/types';

import type { MetadataAccess } from '../types';

interface FieldsStore {
	getField(collection: string, field: string): Field | null;
	getPrimaryKeyFieldForCollection(collection: string): Field | null;
}

interface RelationsStore {
	getRelationsForField(collection: string, field: string): Relation[];
}

interface ReadPermission {
	access?: 'full' | 'partial' | 'none';
	fields?: string[] | null;
}

interface PermissionsStore {
	getPermission(collection: string, action: 'read'): ReadPermission | null;
	hasPermission(collection: string, action: 'read'): boolean;
}

interface DisplayDefinition {
	fields?:
		| string[]
		| ((
				options: Record<string, unknown> | null,
				context: { collection: string; field: string; type: string },
		  ) => string[]);
	id: string;
}

export interface MetadataDependencies {
	displays: () => DisplayDefinition[];
	fieldsStore: FieldsStore;
	permissionsStore: PermissionsStore;
	relationsStore: RelationsStore;
}

export function createDirectusMetadataAccess(dependencies: MetadataDependencies): MetadataAccess {
	const { fieldsStore, permissionsStore, relationsStore } = dependencies;

	return {
		canReadField,
		getDisplayFields,
		getField: (collection, field) => fieldsStore.getField(collection, field),
		getPrimaryKeyField: (collection) => fieldsStore.getPrimaryKeyFieldForCollection(collection),
		getRelationsForField: (collection, field) => relationsStore.getRelationsForField(collection, field),
	};

	function canReadField(collection: string, field: string): boolean {
		if (!permissionsStore.hasPermission(collection, 'read')) return false;

		const permission = permissionsStore.getPermission(collection, 'read');
		if (!permission) return true;
		if (permission.access === 'none') return false;
		if (!Array.isArray(permission.fields) || permission.fields.length === 0) return true;

		return permission.fields.includes('*') || permission.fields.includes(field);
	}

	function getDisplayFields(field: Field): string[] {
		const displayId = field.meta?.display;
		if (!displayId) return [];

		const display = dependencies.displays().find(({ id }) => id === displayId);
		if (!display?.fields) return [];

		try {
			if (Array.isArray(display.fields)) return display.fields;

			return display.fields((field.meta?.display_options as Record<string, unknown> | null) ?? null, {
				collection: field.collection,
				field: field.field,
				type: field.type,
			});
		} catch {
			// A custom display is allowed to rely on app state that is not available
			// during initial hydration. Fetching the field itself remains a safe fallback.
			return [];
		}
	}
}
