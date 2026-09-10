<script setup lang="ts">
import type { Item } from '@directus/types';
import { computed, inject, type CSSProperties, type Ref, ref, toRefs, watch } from 'vue';

import type { LayoutComponentProps, TableHeader, TableSort } from '../types';
import { getInlineFilterControlWidth, shouldExpandInlineFilterLeft } from '../utils/filter-width';
import { getValueAtPath } from '../utils/object';

defineOptions({ inheritAttrs: false });

const props = defineProps<LayoutComponentProps>();

const emit = defineEmits<{
	'update:columnFilters': [value: Record<string, string>];
	'update:fields': [value: string[]];
	'update:limit': [value: number];
	'update:selection': [value: (number | string)[]];
	'update:tableHeaders': [value: TableHeader[]];
}>();

const { collection } = toRefs(props);
const table = ref<HTMLElement>();
const mainElement = inject<Ref<Element | undefined>>('main-element');
const pageSizes = [25, 50, 100, 250, 500, 1000];
const alignments = ['left', 'center', 'right'] as const;
const auxiliaryColumnWidth = 48;
const focusedFilter = ref<string | null>(null);

const selectionWritable = computed({
	get: () => props.selection,
	set: (value: (number | string)[]) => emit('update:selection', value),
});

const tableHeadersWritable = computed({
	get: () => props.tableHeaders,
	set: (value: TableHeader[]) => emit('update:tableHeaders', value),
});

const activeFilterCount = computed(
	() => Object.values(props.columnFilters).filter((value) => value.trim().length > 0).length,
);

const hasActiveSearch = computed(() => Boolean(props.search?.trim()) || activeFilterCount.value > 0);

const inlineFilterGridStyle = computed<CSSProperties>(() => ({
	gridTemplateColumns: [
		...(props.sortAllowed ? [`${auxiliaryColumnWidth}px`] : []),
		...(props.showSelect !== 'none' ? [`${auxiliaryColumnWidth}px`] : []),
		...props.tableHeaders.map((header) => `${header.width}px`),
		`${auxiliaryColumnWidth}px`,
	].join(' '),
}));

watch(
	() => props.page,
	() => mainElement?.value?.scrollTo({ top: 0, behavior: 'smooth' }),
);

function addField(field: string): void {
	if (!field || props.fields.includes(field)) return;
	emit('update:fields', [...props.fields, field]);
}

function removeField(field: string): void {
	emit(
		'update:fields',
		props.fields.filter((entry) => entry !== field),
	);
}

function updateColumnFilter(field: string, value: unknown): void {
	const next = { ...props.columnFilters };
	const normalized =
		typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
	if (normalized.trim()) next[field] = normalized;
	else delete next[field];
	emit('update:columnFilters', next);
}

function clearColumnFilters(): void {
	emit('update:columnFilters', {});
}

function inlineFilterControlStyle(header: TableHeader, index: number): CSSProperties {
	const focused = focusedFilter.value === header.value;
	const width = getInlineFilterControlWidth(header.width, props.columnFilters[header.value] ?? '', focused);
	const alignToEnd = shouldExpandInlineFilterLeft(index, props.tableHeaders.length);

	return {
		inlineSize: `${width}px`,
		insetInlineEnd: alignToEnd ? '8px' : 'auto',
		insetInlineStart: alignToEnd ? 'auto' : '8px',
	};
}

function updateSort(value: TableSort | null): void {
	props.onSortChange(value);
}

function displayValue(item: Item, field: string): unknown {
	return getValueAtPath(item as Record<string, unknown>, field);
}
</script>

<template>
	<div class="table-search-layout">
		<section
			v-if="showColumnFilters && columnFilterMode === 'panel' && tableHeaders.length > 0"
			class="column-filter-panel"
			aria-label="Column filters"
		>
			<header class="column-filter-panel__header">
				<div class="column-filter-panel__title">
					<v-icon name="filter_alt" small />
					<span>Column filters</span>
					<v-chip v-if="activeFilterCount" x-small>{{ activeFilterCount }}</v-chip>
				</div>
				<v-button v-if="activeFilterCount" x-small secondary @click="clearColumnFilters">Clear</v-button>
			</header>

			<div class="column-filter-panel__fields">
				<label v-for="header in tableHeaders" :key="header.value" class="column-filter">
					<span class="column-filter__label" :title="header.description || header.text">{{ header.text }}</span>
					<v-input
						:model-value="columnFilters[header.value] || ''"
						:disabled="!searchableFields.includes(header.value)"
						:placeholder="searchableFields.includes(header.value) ? 'Filter…' : 'Not searchable'"
						small
						@update:model-value="updateColumnFilter(header.value, $event)"
					>
						<template #prepend><v-icon name="search" x-small /></template>
					</v-input>
				</label>
			</div>
		</section>

		<section
			v-else-if="showColumnFilters && tableHeaders.length > 0"
			class="inline-column-filters"
			aria-label="Column filters"
		>
			<div class="inline-column-filters__grid" :style="inlineFilterGridStyle">
				<div v-if="sortAllowed" class="inline-column-filters__spacer" aria-hidden="true" />
				<div v-if="showSelect !== 'none'" class="inline-column-filters__spacer" aria-hidden="true" />

				<label v-for="(header, index) in tableHeaders" :key="header.value" class="inline-column-filter">
					<span class="inline-column-filter__label" :title="header.description || header.text">
						{{ header.text }}
					</span>
					<span
						class="inline-column-filter__control"
						:class="{ 'inline-column-filter__control--focused': focusedFilter === header.value }"
						:style="inlineFilterControlStyle(header, index)"
						@focusin="focusedFilter = header.value"
						@focusout="focusedFilter = null"
					>
						<v-input
							:model-value="columnFilters[header.value] || ''"
							:disabled="!searchableFields.includes(header.value)"
							:placeholder="searchableFields.includes(header.value) ? 'Filter…' : 'Not searchable'"
							small
							@update:model-value="updateColumnFilter(header.value, $event)"
						>
							<template #prepend><v-icon name="search" x-small /></template>
						</v-input>
					</span>
				</label>

				<div class="inline-column-filters__actions">
					<button
						v-if="activeFilterCount"
						class="inline-column-filters__clear"
						type="button"
						title="Clear column filters"
						aria-label="Clear column filters"
						@click="clearColumnFilters"
					>
						<v-icon name="filter_alt_off" small />
					</button>
				</div>
			</div>
		</section>

		<v-table
			v-if="loading || (itemCount && itemCount > 0 && !error)"
			ref="table"
			v-model="selectionWritable"
			v-model:headers="tableHeadersWritable"
			class="table"
			fixed-header
			:show-select="showSelect"
			show-resize
			must-sort
			:sort="tableSort"
			:items="items"
			:loading="loading"
			:row-height="tableRowHeight"
			:item-key="primaryKeyField?.field"
			:show-manual-sort="sortAllowed"
			:manual-sort-key="sortField"
			allow-header-reorder
			selection-use-keys
			@click:row="onRowClick"
			@update:sort="updateSort"
			@manual-sort="changeManualSort"
		>
			<template v-for="header in tableHeaders" :key="header.value" #[`item.${header.value}`]="{ item }">
				<render-display
					:value="displayValue(item, header.value)"
					:display="header.field.display"
					:options="header.field.displayOptions"
					:interface="header.field.interface"
					:interface-options="header.field.interfaceOptions"
					:type="header.field.type"
					:collection="header.field.collection"
					:field="header.field.field"
				/>
			</template>

			<template #header-context-menu="{ header }">
				<v-list>
					<v-list-item
						:disabled="!header.sortable"
						:active="tableSort?.by === header.value && tableSort?.desc === false"
						clickable
						@click="updateSort({ by: header.value, desc: false })"
					>
						<v-list-item-icon><v-icon class="flip" name="sort" /></v-list-item-icon>
						<v-list-item-content>Sort ascending</v-list-item-content>
					</v-list-item>
					<v-list-item
						:disabled="!header.sortable"
						:active="tableSort?.by === header.value && tableSort?.desc === true"
						clickable
						@click="updateSort({ by: header.value, desc: true })"
					>
						<v-list-item-icon><v-icon name="sort" /></v-list-item-icon>
						<v-list-item-content>Sort descending</v-list-item-content>
					</v-list-item>

					<v-divider />
					<v-list-item
						v-for="alignment in alignments"
						:key="alignment"
						:active="header.align === alignment"
						clickable
						@click="onAlignChange(header.value, alignment)"
					>
						<v-list-item-icon><v-icon :name="`format_align_${alignment}`" /></v-list-item-icon>
						<v-list-item-content>{{ alignment }} align</v-list-item-content>
					</v-list-item>

					<v-divider />
					<v-list-item clickable @click="removeField(header.value)">
						<v-list-item-icon><v-icon name="visibility_off" /></v-list-item-icon>
						<v-list-item-content>Hide field</v-list-item-content>
					</v-list-item>
				</v-list>
			</template>

			<template #header-append>
				<v-menu placement="bottom-end" show-arrow :close-on-content-click="false">
					<template #activator="{ toggle, active }">
						<v-icon
							v-tooltip="'Add field'"
							class="add-field"
							name="add"
							:class="{ active }"
							clickable
							@click="toggle"
						/>
					</template>
					<v-field-list
						:collection="collection"
						:disabled-fields="fields"
						:allow-select-all="false"
						@add="addField($event[0])"
					/>
				</v-menu>
			</template>

			<template #footer>
				<div class="footer">
					<v-pagination
						v-if="totalPages > 1"
						:length="totalPages"
						:total-visible="7"
						show-first-last
						:model-value="page"
						@update:model-value="toPage"
					/>
					<div v-if="items.length >= 25 || limit < 25" class="per-page">
						<span>Per page</span>
						<v-select
							:model-value="String(limit)"
							:items="pageSizes.map((value) => ({ text: String(value), value: String(value) }))"
							inline
							@update:model-value="emit('update:limit', Number($event))"
						/>
					</div>
				</div>
			</template>
		</v-table>

		<slot v-else-if="error" name="error" :error="error" :reset="resetPresetAndRefresh" />
		<slot v-else-if="itemCount === 0 && hasActiveSearch" name="no-results" />
		<slot v-else-if="itemCount === 0" name="no-items" />
	</div>
</template>

<style lang="scss" scoped>
.table-search-layout {
	display: contents;
	margin: var(--content-padding);
	margin-block-end: var(--content-padding-bottom);
}

.column-filter-panel {
	position: relative;
	inline-size: calc(100% - (2 * var(--content-padding)));
	margin: 0 var(--content-padding) 16px;
	padding: 12px;
	background: var(--theme--background-normal);
	border: var(--theme--border-width) solid var(--theme--border-color-subdued);
	border-radius: var(--theme--border-radius);
}

.column-filter-panel__header,
.column-filter-panel__title {
	display: flex;
	align-items: center;
}

.column-filter-panel__header {
	justify-content: space-between;
	margin-block-end: 10px;
}

.column-filter-panel__title {
	gap: 6px;
	font-weight: 600;
}

.column-filter-panel__fields {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 10px;
}

.column-filter {
	display: grid;
	gap: 4px;
	min-inline-size: 0;
}

.column-filter__label {
	overflow: hidden;
	color: var(--theme--foreground-subdued);
	font-size: 12px;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.inline-column-filters {
	position: relative;
	z-index: 3;
	inline-size: max-content;
	min-inline-size: calc(100% - (2 * var(--content-padding)));
	margin-inline: var(--content-padding);
	background: var(--theme--background-normal);
	border-block: var(--theme--border-width) solid var(--theme--border-color-subdued);
}

.inline-column-filters__grid {
	display: grid;
	align-items: stretch;
	inline-size: max-content;
	min-inline-size: 100%;
}

.inline-column-filters__spacer,
.inline-column-filters__actions,
.inline-column-filter {
	block-size: 68px;
	border-inline-end: var(--theme--border-width) solid var(--theme--border-color-subdued);
}

.inline-column-filter {
	position: relative;
	display: block;
	min-inline-size: 0;
	padding: 7px 8px 8px;
}

.inline-column-filter__label {
	display: block;
	overflow: hidden;
	color: var(--theme--foreground-subdued);
	font-size: 11px;
	line-height: 16px;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.inline-column-filter__control {
	position: absolute;
	inset-block-end: 8px;
	z-index: 1;
	display: block;
	max-inline-size: none;
	transition: inline-size var(--fast) var(--transition);
}

.inline-column-filter__control--focused {
	z-index: 4;
	filter: drop-shadow(0 4px 10px rgb(0 0 0 / 18%));
}

.inline-column-filter__control :deep(.v-input) {
	inline-size: 100%;
}

.inline-column-filters__actions {
	display: grid;
	place-items: center;
	border-inline-end: 0;
}

.inline-column-filters__clear {
	display: grid;
	inline-size: 32px;
	block-size: 32px;
	padding: 0;
	color: var(--theme--foreground-subdued);
	cursor: pointer;
	background: transparent;
	border: 0;
	border-radius: var(--theme--border-radius);
	place-items: center;
}

.inline-column-filters__clear:hover,
.inline-column-filters__clear:focus-visible {
	color: var(--theme--primary);
	background: var(--theme--primary-background);
	outline: none;
}

.v-table {
	--v-table-sticky-offset-top: var(--layout-offset-top);

	display: contents;

	& > :deep(table) {
		min-inline-size: calc(100% - var(--content-padding)) !important;
		margin-inline-start: var(--content-padding);

		tr {
			margin-inline-end: var(--content-padding);
		}
	}
}

.footer {
	position: sticky;
	inset-inline-start: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	inline-size: 100%;
	padding: 32px var(--content-padding);
}

.per-page {
	display: flex;
	align-items: center;
	gap: 4px;
	color: var(--theme--foreground-subdued);
}

.add-field.active {
	--v-icon-color: var(--theme--foreground);
}

.flip {
	transform: scaleY(-1);
}
</style>
