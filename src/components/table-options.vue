<script setup lang="ts">
import { computed } from 'vue';

import type { TableSpacing } from '../types';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
	showColumnFilters: boolean;
	tableSpacing: TableSpacing;
}>();

const emit = defineEmits<{
	'update:showColumnFilters': [value: boolean];
	'update:tableSpacing': [value: TableSpacing];
}>();

const spacing = computed({
	get: () => props.tableSpacing,
	set: (value: TableSpacing) => emit('update:tableSpacing', value),
});

const filtersVisible = computed({
	get: () => props.showColumnFilters,
	set: (value: boolean) => emit('update:showColumnFilters', value),
});
</script>

<template>
	<div class="table-search-options">
		<div class="field">
			<div class="type-label">Spacing</div>
			<v-select
				v-model="spacing"
				:items="[
					{ text: 'Compact', value: 'compact' },
					{ text: 'Cozy', value: 'cozy' },
					{ text: 'Comfortable', value: 'comfortable' },
				]"
			/>
		</div>

		<div class="field">
			<v-checkbox v-model="filtersVisible" label="Show column filters" block />
		</div>
	</div>
</template>

<style scoped>
.table-search-options {
	display: grid;
	gap: 20px;
}
</style>
