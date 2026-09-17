import { defineLayout, useCollection, useExtensions, useItems, useStores, useSync } from '@directus/extensions-sdk';
import { isPublishedVersionKey } from '@directus/constants';
import type { Field, Filter, Item } from '@directus/types';
import { computed, ref, toRefs, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import TableActions from './components/table-actions.vue';
import TableLayout from './components/table-layout.vue';
import TableOptions from './components/table-options.vue';
import { createDirectusMetadataAccess } from './services/directus-metadata';
import type {
	ColumnAlignment,
	ColumnFilterMode,
	ColumnFilterValues,
	LayoutOptions,
	LayoutQuery,
	TableHeader,
	TableSort,
} from './types';
import { buildColumnPlans } from './utils/column-plan';
import { buildCsvDocument, createCsvFilename, downloadCsvFile } from './utils/csv';
import { getDefaultDisplay } from './utils/default-display';
import { buildDisplayQuery } from './utils/display-query';
import { buildColumnFilterKinds } from './utils/filter-control';
import { isFieldAllowed } from './utils/field-permission';
import { buildColumnFilters, buildGlobalSearchFilter, combineFilters } from './utils/filter';
import { getValueAtPath } from './utils/object';
import { planRowInteraction } from './utils/row-interaction';

export default defineLayout<LayoutOptions, LayoutQuery>({
	id: 'table-search',
	name: 'Table Search',
	icon: 'manage_search',
	component: TableLayout,
	slots: {
		actions: TableActions,
		options: TableOptions,
		sidebar: () => null,
	},
	setup(props, { emit }) {
		const router = useRouter();
		const route = useRoute();
		const stores = useStores();
		const fieldsStore = stores.useFieldsStore();
		const relationsStore = stores.useRelationsStore();
		const permissionsStore = stores.usePermissionsStore();
		const { displays } = useExtensions();

		const selection = useSync(props, 'selection', emit);
		const layoutOptions = useSync(props, 'layoutOptions', emit);
		const layoutQuery = useSync(props, 'layoutQuery', emit);
		const { collection, filter, filterSystem, search } = toRefs(props);
		const { fields: fieldsInCollection, info, primaryKeyField, sortField } = useCollection(collection);

		const metadata = createDirectusMetadataAccess({
			displays: () => displays.value,
			fieldsStore,
			permissionsStore,
			relationsStore,
		});

		const defaultFields = computed(() =>
			fieldsInCollection.value
				.filter((field) => !field.meta?.hidden && !field.meta?.special?.includes('no-data'))
				.slice(0, 4)
				.map(({ field }) => field),
		);

		const fields = computed<string[]>({
			get: () => {
				const saved = layoutQuery.value?.fields;
				return (saved ?? defaultFields.value).filter((field) => fieldsStore.getField(collection.value, field));
			},
			set: (value) => {
				layoutQuery.value = { ...layoutQuery.value, fields: value };
			},
		});

		const defaultSort = computed(() => {
			const field = sortField.value ?? primaryKeyField.value?.field;
			return field ? [field] : [];
		});

		const sort = computed<string[]>({
			get: () => layoutQuery.value?.sort ?? defaultSort.value,
			set: (value) => {
				layoutQuery.value = { ...layoutQuery.value, sort: value };
			},
		});

		const page = computed<number>({
			get: () => layoutQuery.value?.page ?? 1,
			set: (value) => {
				layoutQuery.value = { ...layoutQuery.value, page: value };
			},
		});

		const limit = computed<number>({
			get: () => layoutQuery.value?.limit ?? 25,
			set: (value) => {
				layoutQuery.value = { ...layoutQuery.value, limit: value, page: 1 };
			},
		});

		const columnFilters = computed<ColumnFilterValues>({
			get: () => layoutQuery.value?.columnFilters ?? {},
			set: (value) => {
				layoutQuery.value = { ...layoutQuery.value, columnFilters: value };
			},
		});

		const columnFilterMode = computed({
			get: () => layoutOptions.value?.columnFilterMode ?? 'panel',
			set: (value: ColumnFilterMode) => {
				layoutOptions.value = { ...layoutOptions.value, columnFilterMode: value };
			},
		});

		const tableSpacing = computed({
			get: () => layoutOptions.value?.spacing ?? 'cozy',
			set: (value: 'compact' | 'cozy' | 'comfortable') => {
				layoutOptions.value = { ...layoutOptions.value, spacing: value };
			},
		});

		const showColumnFilters = computed({
			get: () => layoutOptions.value?.showColumnFilters ?? true,
			set: (value: boolean) => {
				layoutOptions.value = { ...layoutOptions.value, showColumnFilters: value };
			},
		});

		const columnPlans = computed(() => {
			if (!collection.value) return [];
			return buildColumnPlans(collection.value, fields.value, metadata);
		});

		const displayQuery = computed(() =>
			collection.value
				? buildDisplayQuery(collection.value, fields.value, metadata)
				: { alias: {}, fields: [], valuePaths: {} },
		);
		const queryFields = computed(() => displayQuery.value.fields);
		const queryAlias = computed(() => displayQuery.value.alias);
		const itemValuePaths = computed(() => displayQuery.value.valuePaths);
		const columnFilterKinds = computed(() => buildColumnFilterKinds(columnPlans.value));
		const globalSearchFilter = computed(() => buildGlobalSearchFilter(columnPlans.value, search.value));
		const perColumnFilter = computed(() => buildColumnFilters(columnPlans.value, columnFilters.value));
		const effectiveFilter = computed<Filter | null>(
			() =>
				combineFilters(
					filter.value as Record<string, unknown> | null,
					globalSearchFilter.value,
					perColumnFilter.value,
				) as Filter | null,
		);
		const disabledNativeSearch = ref<string | null>(null);
		const routeVersionKey = computed(() => {
			const version = route.query.version;
			return Array.isArray(version) ? (version[0] ?? null) : (version ?? null);
		});
		const versionKey = computed(() => (props.selectMode ? null : routeVersionKey.value));
		const isVersion = computed(() => Boolean(versionKey.value && !isPublishedVersionKey(versionKey.value)));

		const {
			changeManualSort,
			error,
			getItemCount,
			getItems,
			getTotalCount,
			itemCount,
			items,
			loading,
			totalCount,
			totalPages,
		} = useItems(collection, {
			alias: queryAlias,
			fields: queryFields,
			filter: effectiveFilter,
			filterSystem,
			limit,
			page,
			search: disabledNativeSearch,
			sort,
			version: versionKey,
		});
		const visibleItems = computed<Item[]>(() => {
			if (!isVersion.value) return items.value;

			return items.value.map((item) => ({
				...item,
				_versionId:
					item.$meta && typeof item.$meta === 'object'
						? ((item.$meta as Record<string, unknown>).version_id ?? null)
						: null,
			}));
		});
		const itemKey = computed(() => (isVersion.value ? '_versionId' : primaryKeyField.value?.field));

		const localWidths = ref<Record<string, number>>({});
		let widthsTimer: ReturnType<typeof setTimeout> | undefined;

		watch(
			() => layoutOptions.value,
			() => {
				localWidths.value = {};
			},
		);

		const tableHeaders = computed<TableHeader[]>({
			get: () => {
				const headers: TableHeader[] = [];

				for (const key of fields.value) {
					const field = fieldsStore.getField(collection.value, key) as Field | null;
					if (!field) continue;

					headers.push({
						align: layoutOptions.value?.align?.[key] ?? 'left',
						description: getFieldDescription(key),
						field: {
							collection: field.collection,
							display: field.meta?.display ?? getDefaultDisplay(field.type),
							displayOptions: (field.meta?.display_options as Record<string, unknown> | null) ?? null,
							field: field.field,
							interface: field.meta?.interface ?? null,
							interfaceOptions: (field.meta?.options as Record<string, unknown> | null) ?? null,
							type: field.type,
						},
						sortable: !['alias', 'json', 'presentation', 'translations'].includes(field.type),
						text: field.name,
						value: key,
						width: localWidths.value[key] ?? layoutOptions.value?.widths?.[key] ?? 180,
					});
				}

				return headers;
			},
			set: (headers) => {
				localWidths.value = Object.fromEntries(headers.map((header) => [header.value, header.width ?? 180]));
				fields.value = headers.map(({ value }) => value);

				if (widthsTimer) clearTimeout(widthsTimer);
				widthsTimer = setTimeout(() => {
					layoutOptions.value = { ...layoutOptions.value, widths: localWidths.value };
				}, 350);
			},
		});

		const activeFields = computed<Field[]>({
			get: () => fields.value.map((key) => fieldsStore.getField(collection.value, key)).filter(Boolean) as Field[],
			set: (value) => {
				fields.value = value.map(({ field }) => field);
			},
		});

		const tableSort = computed<TableSort | null>(() => {
			const current = sort.value[0];
			if (!current) return null;
			return current.startsWith('-') ? { by: current.slice(1), desc: true } : { by: current, desc: false };
		});

		const tableRowHeight = computed(() => {
			if (tableSpacing.value === 'compact') return 32;
			if (tableSpacing.value === 'comfortable') return 64;
			return 48;
		});

		const sortAllowed = computed(() => {
			if (!sortField.value || versionKey.value || !permissionsStore.hasPermission(collection.value, 'update')) {
				return false;
			}

			return isFieldAllowed(permissionsStore.getPermission(collection.value, 'update'), sortField.value);
		});

		const showingCount = computed(() => {
			if (!itemCount.value) return undefined;
			const start = (page.value - 1) * limit.value + 1;
			const end = Math.min(page.value * limit.value, itemCount.value);
			return itemCount.value === totalCount.value
				? `${start}–${end} / ${itemCount.value}`
				: `${start}–${end} / ${itemCount.value} (${totalCount.value ?? 0} total)`;
		});

		return {
			activeFields,
			changeManualSort,
			columnFilterMode,
			columnFilterKinds,
			columnFilters,
			download,
			error,
			fields,
			fieldsInCollection,
			info,
			itemCount,
			itemKey,
			itemValuePaths,
			items: visibleItems,
			limit,
			loading,
			onAlignChange,
			onRowClick,
			onSortChange,
			page,
			primaryKeyField,
			refresh,
			resetPresetAndRefresh,
			selectAll,
			showColumnFilters,
			showingCount,
			sortAllowed,
			sortField,
			tableHeaders,
			tableRowHeight,
			tableSort,
			tableSpacing,
			toPage: (value: number) => {
				page.value = value;
			},
			totalCount,
			totalPages,
		};

		function getFieldDescription(key: string): string | null {
			if (!key.includes('.')) return null;

			return key.split('.').filter(Boolean).join(' → ');
		}

		function onSortChange(next: TableSort | null): void {
			sort.value = next?.by ? [next.desc ? `-${next.by}` : next.by] : [];
		}

		function onAlignChange(field: string, align: ColumnAlignment): void {
			layoutOptions.value = {
				...layoutOptions.value,
				align: { ...layoutOptions.value?.align, [field]: align },
			};
		}

		function onRowClick({ event, item }: { event: PointerEvent; item: Item }): void {
			if (!collection.value) return;
			const interaction = planRowInteraction({
				collection: collection.value,
				item,
				primaryKeyField: primaryKeyField.value?.field,
				readonly: props.readonly,
				selection: selection.value,
				selectMode: props.selectMode,
				versionKey: versionKey.value,
			});

			if (interaction.type === 'selection') {
				selection.value = interaction.selection;
				return;
			}

			if (interaction.type !== 'navigate') return;
			if (event.ctrlKey || event.metaKey) window.open(router.resolve(interaction.route).href, '_blank', 'noopener');
			else void router.push(interaction.route);
		}

		function selectAll(): void {
			if (isVersion.value) {
				selection.value = items.value
					.map((item) =>
						item.$meta && typeof item.$meta === 'object'
							? (item.$meta as Record<string, unknown>).version_id
							: undefined,
					)
					.filter((id): id is string => typeof id === 'string' && id.length > 0);
				return;
			}

			const primaryKey = primaryKeyField.value?.field;
			if (!primaryKey) return;
			selection.value = items.value.map((item) => item[primaryKey] as number | string);
		}

		function refresh(): void {
			void getItems();
			void getItemCount(true);
			void getTotalCount(true);
		}

		function download(): void {
			if (!collection.value) return;

			const headers = tableHeaders.value;
			const rows = items.value.map((item) =>
				headers.map((header) => {
					const value = getValueAtPath(
						item as Record<string, unknown>,
						itemValuePaths.value[header.value] ?? header.value,
					);
					if (value === null || value === undefined) return value;

					const display = displays.value.find(({ id }) => id === header.field.display);
					if (!display?.handler) return value;

					try {
						return display.handler(value, header.field.displayOptions ?? {}, {
							collection: header.field.collection,
							field: fieldsStore.getField(header.field.collection, header.field.field) ?? undefined,
							interfaceOptions: header.field.interfaceOptions ?? {},
						});
					} catch {
						return value;
					}
				}),
			);

			downloadCsvFile(
				createCsvFilename(collection.value),
				buildCsvDocument(
					headers.map(({ text }) => text),
					rows,
				),
			);
		}

		async function resetPresetAndRefresh(): Promise<void> {
			await props.resetPreset?.();
			refresh();
		}
	},
});
