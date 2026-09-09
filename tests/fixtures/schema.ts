import type { Field, Relation } from '@directus/types';

import type { MetadataAccess } from '../../src/types';

type FieldOptions = {
	display?: string;
	displayOptions?: Record<string, unknown>;
	primary?: boolean;
	special?: string[];
};

export function field(collection: string, name: string, type: Field['type'], options: FieldOptions = {}): Field {
	return {
		collection,
		field: name,
		meta: {
			collection,
			conditions: null,
			display: options.display ?? null,
			display_options: options.displayOptions ?? null,
			field: name,
			group: null,
			hidden: false,
			id: 1,
			interface: null,
			note: null,
			options: null,
			readonly: false,
			required: false,
			sort: 1,
			special: options.special ?? null,
			translations: null,
			validation: null,
			validation_message: null,
			width: 'full',
		},
		name,
		schema: {
			comment: null,
			data_type: type,
			default_value: null,
			foreign_key_column: null,
			foreign_key_schema: null,
			foreign_key_table: null,
			generation_expression: null,
			has_auto_increment: false,
			is_generated: false,
			is_indexed: false,
			is_nullable: !options.primary,
			is_primary_key: options.primary ?? false,
			is_unique: options.primary ?? false,
			max_length: null,
			name,
			numeric_precision: null,
			numeric_scale: null,
			schema: 'main',
			table: collection,
		},
		type,
	} as Field;
}

export function relation(
	collection: string,
	fieldName: string,
	relatedCollection: string,
	options: { junctionField?: string | null; oneField?: string | null } = {},
): Relation {
	return {
		collection,
		field: fieldName,
		meta: {
			id: 1,
			junction_field: options.junctionField ?? null,
			many_collection: collection,
			many_field: fieldName,
			one_allowed_collections: null,
			one_collection: relatedCollection,
			one_collection_field: null,
			one_deselect_action: 'nullify',
			one_field: options.oneField ?? null,
			sort_field: null,
		},
		related_collection: relatedCollection,
		schema: null,
	};
}

export function createSchema(options: { denied?: string[] } = {}): MetadataAccess {
	const fields = [
		field('articles', 'id', 'integer', { primary: true }),
		field('articles', 'title', 'string'),
		field('articles', 'views', 'integer'),
		field('articles', 'published_on', 'date'),
		field('articles', 'author', 'integer', {
			display: 'related-values',
			displayOptions: { template: '{{ first_name }} {{ last_name }}' },
			special: ['m2o'],
		}),
		field('articles', 'comments', 'alias', { display: 'related-values', special: ['o2m'] }),
		field('articles', 'tags', 'alias', { display: 'related-values', special: ['m2m'] }),
		field('articles', 'editor', 'uuid', { display: 'user', special: ['m2o'] }),
		field('authors', 'id', 'integer', { primary: true }),
		field('authors', 'first_name', 'string'),
		field('authors', 'last_name', 'string'),
		field('comments', 'id', 'integer', { primary: true }),
		field('comments', 'body', 'text'),
		field('comments', 'article_id', 'integer', { special: ['m2o'] }),
		field('articles_tags', 'id', 'integer', { primary: true }),
		field('articles_tags', 'articles_id', 'integer', { special: ['m2o'] }),
		field('articles_tags', 'tags_id', 'integer', { special: ['m2o'] }),
		field('tags', 'id', 'integer', { primary: true }),
		field('tags', 'name', 'string'),
		field('directus_users', 'id', 'uuid', { primary: true }),
		field('directus_users', 'email', 'string'),
		field('directus_users', 'first_name', 'string'),
		field('directus_users', 'last_name', 'string'),
		field('directus_users', 'avatar', 'uuid', { special: ['m2o'] }),
		field('directus_files', 'id', 'uuid', { primary: true }),
		field('directus_files', 'modified_on', 'dateTime'),
	];

	const relations = [
		relation('articles', 'author', 'authors', { oneField: 'articles' }),
		relation('comments', 'article_id', 'articles', { oneField: 'comments' }),
		relation('articles_tags', 'articles_id', 'articles', { junctionField: 'tags_id', oneField: 'tags' }),
		relation('articles_tags', 'tags_id', 'tags', { junctionField: 'articles_id' }),
		relation('articles', 'editor', 'directus_users'),
		relation('directus_users', 'avatar', 'directus_files'),
	];

	const denied = new Set(options.denied ?? []);

	return {
		canReadField: (collection, fieldName) => !denied.has(`${collection}.${fieldName}`),
		getDisplayFields: (currentField) => {
			if (currentField.meta?.display === 'user') {
				return ['id', 'avatar.id', 'avatar.modified_on', 'email', 'first_name', 'last_name'];
			}

			if (currentField.field === 'author') return ['first_name', 'last_name', 'id'];
			if (currentField.field === 'comments') return ['body', 'id'];
			if (currentField.field === 'tags') return ['tags_id.name', 'tags_id.id'];
			return [];
		},
		getField: (collection, fieldName) =>
			fields.find((entry) => entry.collection === collection && entry.field === fieldName) ?? null,
		getPrimaryKeyField: (collection) =>
			fields.find((entry) => entry.collection === collection && entry.schema?.is_primary_key) ?? null,
		getRelationsForField: (collection, fieldName) =>
			relations.filter(
				(entry) =>
					(entry.collection === collection && entry.field === fieldName) ||
					(entry.related_collection === collection && entry.meta?.one_field === fieldName) ||
					(entry.collection === collection && entry.meta?.one_field === fieldName),
			),
	};
}
