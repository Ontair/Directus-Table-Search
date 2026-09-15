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

function updateBooleanValue(value: string): void {
	emit('update:modelValue', value);
}
</script>

<template>
	<div class="column-filter-control" :title="config.helpText">
		<v-menu v-if="kind === 'boolean'" placement="bottom-start" show-arrow>
			<template #activator="{ toggle, active }">
				<div
					class="boolean-filter-activator"
					role="button"
					:tabindex="disabled ? -1 : 0"
					:aria-disabled="disabled || undefined"
					:aria-expanded="active"
					@click.capture.stop.prevent="disabled || toggle()"
					@keydown.enter.capture.stop.prevent="disabled || toggle()"
					@keydown.space.capture.stop.prevent="disabled || toggle()"
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
			<v-list class="boolean-filter-options">
				<v-list-item
					v-for="item in booleanItems"
					:key="item.value"
					:active="item.value === modelValue"
					clickable
					@click="updateBooleanValue(item.value)"
				>
					<v-list-item-content>{{ item.text }}</v-list-item-content>
				</v-list-item>
			</v-list>
		</v-menu>
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

.boolean-filter-activator {
	cursor: pointer;
}

.boolean-filter-activator[aria-disabled='true'] {
	cursor: not-allowed;
}

.boolean-filter-options {
	min-inline-size: 160px;
}
</style>
