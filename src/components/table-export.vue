<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk';
import type { Field, Filter } from '@directus/types';
import { computed, ref, watch } from 'vue';

import { downloadFile } from '../utils/download';
import {
	buildExportQuery,
	createExportFilename,
	isLocalDownloadScope,
	toExportParams,
	type ExportFormat,
	type ExportScope,
} from '../utils/export-query';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
	collection: string | null;
	effectiveFilter: Filter | null;
	exportFields: string[];
	itemCount?: number | null;
	limit: number;
	page: number;
	primaryKeyField?: Field | null;
	selection: (number | string)[];
	sort: string[];
	versionKey?: string | null;
}>();

const api = useApi();

const formatItems = [
	{ text: 'CSV', value: 'csv' },
	{ text: 'JSON', value: 'json' },
	{ text: 'XML', value: 'xml' },
	{ text: 'YAML', value: 'yaml' },
];

const format = ref<ExportFormat>('csv');
const scope = ref<ExportScope>('all');
const exporting = ref(false);
const failed = ref(false);
const started = ref(false);
const awaitingFullExportConfirmation = ref(false);

const isLocalDownload = computed(() => isLocalDownloadScope(scope.value));

const canExportSelection = computed(
	() => props.selection.length > 0 && Boolean(props.primaryKeyField?.field) && !props.versionKey,
);

const scopeItems = computed(() => [
	...(!props.versionKey ? [{ text: 'All matching items', value: 'all' }] : []),
	{ text: 'Current page', value: 'page' },
	...(canExportSelection.value ? [{ text: `Selected items (${props.selection.length})`, value: 'selection' }] : []),
]);

const fullExportCount = computed(() =>
	typeof props.itemCount === 'number' ? props.itemCount.toLocaleString() : 'every matching',
);

watch(canExportSelection, (allowed) => {
	if (!allowed && scope.value === 'selection') scope.value = 'all';
});

watch(
	() => props.versionKey,
	(version) => {
		if (version && scope.value === 'all') scope.value = 'page';
	},
	{ immediate: true },
);

watch([scope, format, () => props.versionKey], () => {
	started.value = false;
	failed.value = false;
	awaitingFullExportConfirmation.value = false;
});

async function runExport(): Promise<void> {
	const collection = props.collection;
	if (exporting.value || !collection || props.exportFields.length === 0) return;
	if (scope.value === 'all' && !awaitingFullExportConfirmation.value) {
		awaitingFullExportConfirmation.value = true;
		return;
	}

	exporting.value = true;
	failed.value = false;
	started.value = false;

	try {
		const query = buildExportQuery({
			fields: props.exportFields,
			filter: props.effectiveFilter,
			limit: props.limit,
			page: props.page,
			primaryKeyField: props.primaryKeyField?.field ?? null,
			scope: scope.value,
			selection: props.selection,
			sort: props.sort,
			version: props.versionKey ?? null,
		});

		if (isLocalDownload.value) {
			const response = await api.get(`/items/${encodeURIComponent(collection)}`, {
				params: toExportParams(query, format.value),
				responseType: 'blob',
			});

			downloadFile(createExportFilename(collection, format.value), response.data as Blob);
			return;
		}

		await api.post(`/utils/export/${encodeURIComponent(collection)}`, { format: format.value, query });
		started.value = true;
		awaitingFullExportConfirmation.value = false;
	} catch {
		failed.value = true;
	} finally {
		exporting.value = false;
	}
}

function cancelFullExport(): void {
	awaitingFullExportConfirmation.value = false;
}
</script>

<template>
	<sidebar-detail icon="import_export" title="Export Table Search">
		<div class="table-search-export">
			<div class="field">
				<p class="type-label">Format</p>
				<v-select v-model="format" :items="formatItems" />
			</div>

			<div class="field">
				<p class="type-label">Items</p>
				<v-select v-model="scope" :items="scopeItems" />
			</div>

			<v-notice type="warning">
				Export the rows this layout shows. The built-in export panel does not receive the column filters or the
				visible-column search of this layout.
			</v-notice>

			<v-notice v-if="!isLocalDownload" type="info">
				A full export creates a new file in the Directus file library. Large result sets can consume substantial storage
				and take time to finish.
			</v-notice>

			<v-notice v-if="versionKey" type="warning">
				A content version can only be downloaded from the current page. Directus' background export route reads
				published data, so full export is unavailable while a version is open.
			</v-notice>

			<v-notice v-if="awaitingFullExportConfirmation" class="full-export-confirmation" type="warning">
				Export {{ fullExportCount }} items and save the resulting file to the Directus file library?
			</v-notice>

			<v-notice v-if="started" type="success">
				Export started. The file appears in the file library once it is done.
			</v-notice>

			<v-notice v-if="failed" type="danger">The export request failed. Check your permissions and try again.</v-notice>

			<div v-if="awaitingFullExportConfirmation" class="confirmation-actions">
				<v-button secondary small full-width :disabled="exporting" @click="cancelFullExport">Cancel</v-button>
				<v-button small full-width :loading="exporting" @click="runExport">Confirm full export</v-button>
			</div>
			<v-button v-else small full-width :loading="exporting" :disabled="exportFields.length === 0" @click="runExport">
				{{ isLocalDownload ? 'Download' : 'Review full export' }}
			</v-button>
		</div>
	</sidebar-detail>
</template>

<style scoped>
.table-search-export {
	display: grid;
	gap: 12px;
}

.confirmation-actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
}
</style>
