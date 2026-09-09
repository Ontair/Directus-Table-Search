# Directus Table Search

A schema-independent Directus layout extension for searching and filtering the values users actually see in table columns.

## Features

- Global search is scoped to visible columns instead of every searchable field in the collection.
- Relational columns are searched through the fields required by their configured Directus display.
- M2O, O2M, M2M, nested fields, and system-user displays use Directus relation metadata rather than schema-specific names.
- Each visible column has an independent filter. Display fields inside one relational column are combined with OR; different columns are combined with AND.
- Existing user and system filters stay active and are combined with the generated filters.
- Read permissions are checked for every field and relation hop before a query or filter path is generated.
- Native Directus pagination, sorting, selection, field reordering, column resizing, displays, and manual sorting remain available.

## Compatibility

The package declares support for Directus `^11.12.0 || ^12.0.0`. The integration suite is exercised against Directus 11.12.0, the version used by the local development environment.

## Install

```sh
npm install
npm run build
```

Copy the package directory (at minimum `package.json` and `dist/`) into the Directus extensions directory, then restart Directus. In Data Studio, open a collection and select **Table Search** in Layout Options.

For a bind-mounted development installation, build directly and copy the generated package:

```sh
npm run build
mkdir -p /path/to/directus/extensions/directus-extension-table-search/dist
cp package.json /path/to/directus/extensions/directus-extension-table-search/
cp dist/index.js /path/to/directus/extensions/directus-extension-table-search/dist/
```

## Search semantics

The extension converts the Data Studio search term into a Directus filter:

- text-like fields use `_icontains`;
- numeric and boolean fields participate when the term can be converted safely;
- date/time fields use exact matching;
- unsupported values such as JSON, binary, geometry, and presentation-only aliases are not included.

For example, with visible `title` and relational `author` columns, where `author` renders `first_name` and `last_name`, a search for `Ada` becomes conceptually:

```json
{
	"_or": [
		{ "title": { "_icontains": "Ada" } },
		{ "author": { "first_name": { "_icontains": "Ada" } } },
		{ "author": { "last_name": { "_icontains": "Ada" } } }
	]
}
```

This generated expression is combined with the active Directus filter using `_and`.

## Development

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The domain logic under `src/utils/` is framework-independent and covered by unit tests. The layout adapter reads fields, relations, displays, and permissions from Directus at runtime, keeping the implementation reusable across collections.

## Known limitations

- Dynamic M2A paths are skipped because a single visible M2A column can target collections with incompatible field sets and filter scopes.
- A custom display that does not declare its required `fields` can only be searched through the visible field value itself.
- Date/time matching is exact to avoid database-dependent casts.
