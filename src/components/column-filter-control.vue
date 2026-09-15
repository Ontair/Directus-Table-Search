<script setup lang="ts">
import { computed } from 'vue';

import type { ColumnFilterControlKind } from '../types';
import { getColumnFilterControlConfig } from '../utils/filter-control';

const props = defineProps<{
	disabled?: boolean;
	kind: ColumnFilterControlKind;
	modelValue: string;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: unknown];
}>();

const booleanItems = [
	{ text: 'Any', value: '' },
	{ text: 'True', value: 'true' },
	{ text: 'False', value: 'false' },
];

const config = computed(() => getColumnFilterControlConfig(props.kind));
const booleanDisplayValue = computed(
	() => booleanItems.find(({ value }) => value === props.modelValue)?.text ?? config.value.placeholder,
);

function updateBooleanValue(event: Event): void {
	emit('update:modelValue', (event.target as HTMLSelectElement).value);
}
</script>

<template>
	<div class="column-filter-control" :title="config.helpText">
		<div v-if="kind === 'boolean'" class="boolean-filter">
			<v-input
				:model-value="booleanDisplayValue"
				:disabled="disabled"
				:placeholder="config.placeholder"
				readonly
				clickable
				full-width
				small
			>
				<template #prepend><v-icon name="rule" x-small /></template>
				<template #append><v-icon name="expand_more" /></template>
			</v-input>
			<select
				class="boolean-filter__native-select"
				:value="modelValue"
				:disabled="disabled"
				aria-label="Boolean filter"
				@change="updateBooleanValue"
			>
				<option v-for="item in booleanItems" :key="item.value" :value="item.value">{{ item.text }}</option>
			</select>
		</div>
		<v-input
			v-else
			:model-value="modelValue"
			:type="config.inputType"
			:disabled="disabled"
			:placeholder="config.placeholder"
			small
			@update:model-value="emit('update:modelValue', $event)"
		>
			<template #prepend><v-icon name="search" x-small /></template>
		</v-input>
	</div>
</template>

<style scoped>
.column-filter-control,
.boolean-filter,
.column-filter-control :deep(.v-input),
.column-filter-control :deep(.v-select) {
	inline-size: 100%;
}

.boolean-filter {
	position: relative;
}

.boolean-filter__native-select {
	position: absolute;
	inset: 0;
	inline-size: 100%;
	block-size: 100%;
	cursor: pointer;
	opacity: 0;
}

.boolean-filter__native-select:disabled {
	cursor: not-allowed;
}

.boolean-filter:focus-within :deep(.v-input) {
	--v-input-color: var(--theme--primary);
}
</style>
