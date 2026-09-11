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
</script>

<template>
	<div class="column-filter-control" :title="config.helpText">
		<v-select
			v-if="kind === 'boolean'"
			:model-value="modelValue"
			:items="booleanItems"
			:disabled="disabled"
			:placeholder="config.placeholder"
			@update:model-value="emit('update:modelValue', $event)"
		>
			<template #preview="{ toggle, active }">
				<!-- Prevent the enclosing column label from forwarding the click twice and immediately closing the menu. -->
				<div
					class="boolean-filter-activator"
					@click.capture.stop.prevent="toggle"
					@keydown.enter.capture.stop.prevent="toggle"
					@keydown.space.capture.stop.prevent="toggle"
				>
					<v-input
						:model-value="booleanDisplayValue"
						:disabled="disabled"
						:active="active"
						:placeholder="config.placeholder"
						readonly
						clickable
						full-width
						small
					>
						<template #prepend><v-icon name="rule" x-small /></template>
						<template #append><v-icon name="expand_more" :class="{ active }" /></template>
					</v-input>
				</div>
			</template>
		</v-select>
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
.boolean-filter-activator,
.column-filter-control :deep(.v-input),
.column-filter-control :deep(.v-select) {
	inline-size: 100%;
}
</style>
