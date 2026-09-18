# Directus Table Search

A schema-independent Directus layout extension for searching and filtering readable source values behind visible table columns.

## Features

- Global search is scoped to visible columns instead of every searchable field in the collection.
- Relational columns are searched through the fields required by their configured Directus display.
- Choice labels configured on standard Directus interfaces and displays are translated back to their stored values.
- M2O, O2M, M2M, nested fields, and system-user displays use Directus relation metadata rather than schema-specific names.
- Each visible column has an independent filter. Display fields inside one relational column are combined with OR; different columns are combined with AND.
- Date, datetime, and time column filters expose independent `DD.MM.YYYY` and `HH:MM:SS` segments. Users can start with any component, the active segment is highlighted, completed segments advance automatically, impossible prefixes are zero-padded like a native date input, and every populated component is applied immediately. Timestamp filters accept an exact ISO timestamp to preserve timezone semantics.
- Column filters can use a responsive panel or a column-aligned row. Aligned filters follow resized column widths and expand over adjacent cells while focused so long values remain easy to edit without changing table geometry.
- Existing user and system filters stay active and are combined with the generated filters.
- Read permissions are checked for every field and relation hop before a query or filter path is generated.
- Native Directus pagination, sorting, selection, field reordering, column resizing, displays, and manual sorting remain available.
- A layout-owned export sidebar downloads the rows the table shows, including the column filters and the visible-column search.

## Compatibility

This version was tested with Directus `11.12.0` and `12.0.2`, and declares only those two host versions. Compatibility with other Directus versions is not guaranteed.

Database-dependent API and Data Studio checks were run against PostgreSQL `16`. Compatibility with other PostgreSQL releases or other database engines is not guaranteed.

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
- UUID, integer, bigint, decimal, and other numeric fields use exact matching. Their column controls keep an **Exact value** hint visible because partial matching is not supported by the portable Directus filter API;
- date and datetime fields accept exact storage values, rendered `DD.MM.YYYY` values, and a four-digit year in global search; their column filters additionally use Directus date-part functions so independently populated components can be combined safely;
- timestamp fields require an exact ISO value so their meaning is not silently changed by database or user time zones;
- unsupported values such as JSON, binary, geometry, and presentation-only aliases are not included.

To prevent pasted text from producing an excessively large Directus filter, one search value is limited to 256 characters, 12 whitespace-separated tokens, and an estimated 256 generated clauses. The layout rejects a larger expression before sending it and shows a visible explanation. Ordinary typing remains unaffected.

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

## Export

The layout contributes its own **Export Table Search** panel to the sidebar. It
describes the same query the list request uses — projection, generated filter,
sort, and content version — and hands that description to Directus, which
renders the file itself under the same permissions as the table. CSV, JSON,
XML, and YAML are available.

The route depends on how much is exported. The current page and the current
selection are bounded, so they are rendered inline through the documented
`export` query parameter and saved by the browser. All matching items may be
an arbitrarily large result set, so that export is started on the server with
`POST /utils/export/:collection`: Directus writes the file to the file library
and notifies the user, which keeps a large export out of the browser tab and
off an open request. The layout warns that this can consume substantial file
storage and requires a separate confirmation before starting the export.

When a content version is open, only the current page can be downloaded. The
background Directus export endpoint reads published data and does not accept a
version, so the extension disables full export instead of silently exporting a
different result set.

Directus' built-in **Export Items** panel is rendered by the collection route
and receives only the host filter and search, so it cannot see this layout's
column filters or its visible-column search. A layout cannot change those props
(`LayoutContext` emits `update:selection`, `update:layoutOptions`, and
`update:layoutQuery` only), so use the layout panel whenever the generated
filters are active.

## Development

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run validate
```

The repository includes a local PostgreSQL 16 stack for database-dependent
integration and Data Studio testing. See
[`docs/local-postgres.md`](docs/local-postgres.md) for startup and one-time
SQLite migration instructions.

Run the real-API suite against a disposable or local development Directus instance:

```sh
DIRECTUS_ADMIN_EMAIL=admin@example.com \
DIRECTUS_ADMIN_PASSWORD=local-development-password \
npm run test:integration
```

The suite creates idempotent `table_search_it_*` fixtures, including M2O, O2M, M2M, system-user relations, and a restricted test policy. Never point it at a production instance.

For a Directus edition where custom row permission rules are unavailable, set `DIRECTUS_EXPECT_ROW_PERMISSION_RULES=false`. Field-level permission checks still run; only the row-rule assertion is skipped. If that edition also prevents creating field restrictions, use `DIRECTUS_TEST_RESTRICTED_PERMISSIONS=false`; relational, filter-composition, sorting, and pagination integration cases still run, while restricted-permission cases are skipped.

The integration suite expects PostgreSQL-style Unicode case folding for `_icontains`. When intentionally testing a database whose collation does not provide it (notably a default SQLite setup), set `DIRECTUS_EXPECT_UNICODE_CASE_FOLDING=false`. This flag documents a database limitation; it does not change generated filters.

The domain logic under `src/utils/` is framework-independent and covered by unit tests. The layout adapter reads fields, relations, displays, and permissions from Directus at runtime, keeping the implementation reusable across collections.

## Known limitations

- Dynamic M2A paths are skipped because a single visible M2A column can target collections with incompatible field sets and filter scopes.
- Display rendering is not generally reversible. Standard configured choice labels and declared display fields are searchable; arbitrary formatting performed inside a custom display cannot be translated back into a database filter. A custom display that does not declare its required `fields` can only be searched through the visible field value itself.
- Global date/time search intentionally treats an unseparated four-digit number as a year. Other partial components remain scoped to column filters, where their meaning is unambiguous.
- UUID, integer, bigint, decimal, and other numeric values require a complete exact value.
- Timestamp values require a complete ISO timestamp. Partial date/time component matching remains available for timezone-independent `date`, `dateTime`, and `time` fields.
