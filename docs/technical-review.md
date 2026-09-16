# Technical Review Context

Last reviewed: 2026-09-16  
Baseline: `feature/table-search` at `41bd0a2`

## Product context

The extension is intended to add convenient global and per-column search to
Directus tables without changing the behavior of the standard Table layout.
It must remain schema-independent, respect Directus permissions, preserve
native filters, displays, sorting, pagination, selection, export, and support
the Directus versions declared in `package.json`.

The current implementation has a good separation between pure filter-planning
utilities and the Directus/Vue adapter. However, it also owns a substantial
copy of the native Table layout behavior. That creates the main maintenance
risk: every relevant upstream Table change must either be inherited or
deliberately reproduced and tested.

## Priority definitions

- **P0 — release blocker:** can expose forbidden query paths, return the wrong
  dataset, or break a fundamental Directus workflow.
- **P1 — high:** visible correctness or compatibility regression affecting a
  common workflow.
- **P2 — medium:** edge-case correctness, scalability, usability, or
  maintainability risk.
- **P3 — low:** cleanup, documentation, developer experience, or future-proofing.

## P0 — release blockers

### P0.1 Relational display queries can request forbidden fields

`buildColumnPlan()` checks `canReadField()` when generating search filters, but
`buildDisplayQuery()` independently expands every field declared by a display
without applying the same permission checks.

Impact:

- a relational display containing one forbidden nested field can make the
  complete table request fail for a restricted user;
- the filter may be permission-safe while the accompanying `fields` query is
  not;
- the current restricted integration test does not detect this because it
  manually supplies a safe fields list instead of executing the result of
  `buildDisplayQuery()`.

Relevant code:

- `src/utils/display-query.ts`, `adjustFieldForDisplay()`;
- `src/services/directus-metadata.ts`, `canReadField()`;
- `tests/integration/directus.test.ts`, restricted-permission case.

Required acceptance coverage:

- M2O, O2M, M2M, and `directus_users` displays containing a mix of readable
  and forbidden fields;
- the actual generated `alias`, `fields`, and filter sent through the API;
- restricted user receives data without a 403 and forbidden values are not
  requested or rendered.

### P0.2 Export does not represent the filtered table

Generated global and column filters exist only as the internal
`effectiveFilter` passed to `useItems()`. Directus Export Sidebar receives the
original host `filter` and `search`, so it cannot see column filters and applies
native global-search semantics instead of visible-column semantics.

Impact:

- exported rows can differ from the rows currently shown;
- column filters are ignored by full export;
- the layout does not expose a `download` handler, so native “Download page as
  CSV” is disabled.

Relevant code:

- `src/index.ts`, `effectiveFilter` and returned layout state;
- the absence of a `download` function in the returned state.

Required acceptance coverage:

- current-page CSV exactly matches the visible rows and columns;
- full export receives the same effective filter semantics;
- native user and system filters remain combined with extension filters;
- permissions still apply to exported fields and items.

### P0.3 Directus 12 Content Versions are not supported despite the host range

The package declares Directus 12 compatibility, but the layout does not read
the version route, pass `version` to `useItems()`, use version IDs for selection,
disable manual sorting in version mode, or preserve the version when opening an
item.

Impact:

- Draft/Version views can show published items or navigate to the wrong item
  state;
- selection and item keys can be incorrect for itemless versions;
- manual sorting may be offered where Directus explicitly disables it.

Relevant code:

- `package.json`, `directus:extension.host`;
- `src/index.ts`, `useItems()`, `onRowClick()`, `selectAll()`;
- `src/components/table-layout.vue`, `item-key` and manual-sort props.

Required acceptance coverage:

- published, draft, named version, and itemless-version scenarios on Directus
  12;
- normal and select modes;
- navigation, selection, counts, filters, and disabled manual sorting.

## P1 — high priority

### P1.1 Row-click and selection behavior diverges from native Table

The custom row handler ignores `readonly`, ignores an already non-empty
selection unless `selectMode` is active, does not support Ctrl/Cmd-click in a
new tab, and has no version-aware routing.

Impact:

- clicking another row after selecting one opens it instead of extending the
  selection;
- read-only behavior differs from Directus;
- power-user navigation is lost.

Relevant code: `src/index.ts`, `onRowClick()`.

### P1.2 Manual sorting checks collection update but not sort-field access

`sortAllowed` only checks for a collection-level update permission. Native
Directus checks whether the user may update the configured sort field.

Impact: restricted users can see drag handles and then receive a 403 while
sorting.

Relevant code: `src/index.ts`, `sortAllowed`.

### P1.3 Invalid active input can silently remove filtering

When a UUID, number, boolean, date/time, or mixed value cannot be converted into
an operator, the condition is omitted. If no other searchable leaf accepts the
term, the final filter is `null`.

Impact: the UI contains an active value while every row is shown. A partial UUID
is the clearest example: exact matching is intentional, but incomplete input
must not silently mean “no filter”.

Relevant code: `src/utils/filter.ts`, `buildGlobalSearchFilter()`,
`buildColumnFilters()`, and `buildLeafCondition()`.

Required behavior: distinguish empty input, invalid input, and unsupported
fields. Invalid active input should produce a safe no-match condition or a
visible validation state.

### P1.4 Refresh can leave cached counts stale on Directus 12

Directus 12 count requests are memoized and explicit refresh accepts a force
flag. The layout calls `getItemCount()` and `getTotalCount()` without forcing
fresh aggregates.

Impact: after create/delete/import/batch operations, rows can refresh while the
header count and pagination remain stale.

Relevant code: `src/index.ts`, `refresh()`.

### P1.5 Displayed-value search is not universally the rendered-value search

The extension searches raw fields declared by the display, not the final text
produced by the display component.

Affected examples:

- translated labels and choices;
- localized booleans;
- custom formatted dates;
- computed or transformed custom displays.

This is partly a Directus display API limitation, but the public description
must not promise exact rendered-text search until inverse mappings or explicit
display search adapters exist.

## P2 — medium priority

### P2.1 Relational arrays drop valid falsy values

`getArrayValues()` uses `.filter(Boolean)`, which removes `false`, `0`, and
empty strings from O2M/M2M display values.

Relevant code: `src/utils/object.ts`.

### P2.2 Root `$thumbnail` values are lost

Virtual path removal turns a root `$thumbnail` path into an empty path and
returns `undefined`, although Directus `useItems()` injects `$thumbnail` for the
file library.

Relevant code: `src/utils/object.ts` and its current test expectation.

### P2.3 Global date/time validation can generate invalid API filters

Shape checks do not validate calendar/time ranges, and the datetime expression
is not anchored at the end. Values such as invalid hours or a datetime with a
trailing suffix can reach Directus and cause a 400 response.

Relevant code: `src/utils/filter.ts`, `isDateValue()`.

### P2.4 Timestamp component filtering can disagree with rendered timezone

Timestamp date-part functions are evaluated using database/server timezone
semantics, while the display can render in the user timezone. Records near
midnight can be shown under one day and matched under another.

Required coverage: multiple user/server timezone combinations and timestamps
around UTC day boundaries.

### P2.5 Search cost grows quickly with visible relational columns

Global search creates an `_or` branch for every searchable display leaf and
also requests an aggregate count. `_icontains` and nested relation filters can
be expensive on large datasets, particularly on Directus 11 where count
updates are less aggressively throttled.

Missing controls:

- no minimum search length;
- no complexity/leaf limit;
- no explicit debounce policy owned by the extension;
- no performance budget or large-dataset benchmark.

### P2.6 Database behavior is not portable enough to claim universal search

Case-insensitive Unicode matching depends on the database and collation. SQLite
already demonstrated different Cyrillic behavior from PostgreSQL. Temporal
functions and relational query performance are only integration-tested against
PostgreSQL.

Required matrix: PostgreSQL plus every database explicitly claimed as
supported, or a clearly documented database limitation.

### P2.7 The aligned filter row depends on private DOM and CSS details

Alignment reads `thead.table-header > tr`, measures DOM cells, and copies the
resolved grid. This is effective but depends on internal `VTable` markup that is
not part of the public extension API.

Relevant code:

- `src/components/table-layout.vue`, `syncTableGrid()`;
- `src/utils/table-grid.ts`.

The fallback widths and row heights also reflect Directus 11 values, while
Directus 12 has already changed native defaults.

### P2.8 Temporal input is not a complete segmented-input implementation

Known usability gaps:

- pasting a full date into one segment does not distribute it;
- Arrow Left/Right always changes segment and cannot move within a year value;
- every click selects the whole segment;
- validation is component-based and does not validate day/month combinations.

Relevant code: `src/components/column-filter-control.vue`.

### P2.9 M2A and translations are not searchable

Dynamic paths containing `:` and virtual `$` segments are rejected. M2A is
documented as a known limitation, but it remains important for a public
relation-search extension. Translation aliases are also excluded through their
type.

Relevant code:

- `src/utils/field-path.ts`;
- `src/utils/column-plan.ts`;
- README known limitations.

## P3 — lower priority and maintenance

### P3.1 UI text is not localized

Labels, placeholders, tooltips, boolean values, context-menu actions, date-part
ARIA labels, and pagination text are hardcoded in English.

Relevant code:

- `src/components/column-filter-control.vue`;
- `src/components/table-layout.vue`;
- `src/components/table-options.vue`;
- `src/utils/filter-control.ts`.

### P3.2 Type behavior is distributed across hardcoded sets and conditionals

Adding a new Directus type currently requires coordinated changes in search
type mapping, searchable exclusions, control configuration, filter generation,
tests, and potentially display handling.

A typed handler registry would make supported operations and UI behavior
explicit without overengineering the Vue layer.

### P3.3 Compatibility constants are copied from Directus internals

Copied values include built-in display IDs, page sizes, default widths, row
heights, auxiliary-column widths, CSS selectors, and `$thumbnail` handling.
Most are not schema hardcoding, but all require parity checks when Directus is
upgraded.

### P3.4 Automated verification is incomplete

Current strengths:

- formatting, linting, strict TypeScript, unit/component tests, and build pass;
- 69 unit/component tests cover the pure filter-planning layer well;
- a PostgreSQL integration suite exists for scalar types and common relations.

Missing:

- CI workflow;
- browser/E2E tests in Data Studio;
- Directus 11/12 compatibility matrix;
- restricted `buildDisplayQuery()` API test;
- export parity tests;
- Content Versions tests;
- multiple database engines;
- coverage thresholds;
- performance regression tests.

The integration suite could not be re-run during this review because the
execution environment rejected the local `127.0.0.1:8055` socket with `EPERM`.
This is not evidence of a product failure, but the API suite is not considered
revalidated for this review.

### P3.5 Development dependencies need patch updates

`npm audit --omit=dev` reports no runtime dependency vulnerabilities in the
published artifact. The full development tree reports known issues, including
the pinned Vitest `3.2.4` and Extensions SDK `18.0.0`; patched releases are
available.

### P3.6 Marketplace presentation is minimal

The package contains the required Directus keyword, extension type, host range,
license, description, and built `dist`. Before public release it should also
have repository/bugs/homepage/author metadata, screenshots, compatibility
notes, database limitations, and an accurate rendered-value search description.

## Existing architectural patterns

- **Functional Core / Imperative Shell:** filter, path, display-query, and
  temporal logic are mostly pure; Vue and Directus stores form the shell.
- **Ports and Adapters:** `MetadataAccess` isolates planning logic from Directus
  stores and registered displays.
- **Composite:** generated Directus filters form nested `_and`/`_or` trees.
- **Type Strategy:** each value family receives different parsing and operator
  behavior, although the strategy is currently implemented with conditionals.
- **Controlled Components:** boolean and temporal controls use `modelValue`
  instead of owning authoritative query state.

The missing architectural piece is a deliberate compatibility boundary around
native Table behavior. Since Directus does not expose a public decorator hook
for the built-in Table layout, the copied behavior needs version adapters and
automated parity tests rather than informal synchronization.

## Recommended correction order

1. Make display-field expansion permission-aware and add restricted API tests.
2. Make export consume the same effective filter and restore page CSV download.
3. Add a Directus 12 compatibility adapter for versions, refresh counts,
   selection, routing, and manual sort.
4. Restore exact native row-click and selection behavior for Directus 11/12.
5. Introduce explicit filter build results: empty, valid, invalid, unsupported.
6. Fix falsy array projection, root `$thumbnail`, and strict temporal validation.
7. Add automated browser parity tests and a Directus/database compatibility
   matrix.
8. Address performance budgets, timezone behavior, localization, dependency
   patches, and Marketplace documentation.

## Release gate

Do not publish the extension as universally compatible until all P0 issues and
P1.1–P1.4 are fixed and covered by automated integration/browser tests. P1.5
must either be implemented for supported displays or documented precisely as a
limitation of rendered-value search.
