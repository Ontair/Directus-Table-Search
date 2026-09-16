<script setup lang="ts">
import { computed } from 'vue';

import type { ColumnFilterControlKind } from '../types';
import { getColumnFilterControlConfig } from '../utils/filter-control';
import {
	decodeTemporalFilterValue,
	encodeTemporalFilterValue,
	type TemporalFilterParts,
	type TemporalFilterType,
} from '../utils/temporal-filter';

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
const temporalKind = computed<TemporalFilterType | null>(() => {
	if (props.kind === 'date' || props.kind === 'dateTime' || props.kind === 'time') return props.kind;
	return null;
});
const temporalParts = computed(() =>
	temporalKind.value ? decodeTemporalFilterValue(temporalKind.value, props.modelValue) : {},
);
const includesDate = computed(() => temporalKind.value === 'date' || temporalKind.value === 'dateTime');
const includesTime = computed(() => temporalKind.value === 'time' || temporalKind.value === 'dateTime');

function updateBooleanValue(value: string): void {
	emit('update:modelValue', value);
}

function updateTemporalPart(component: keyof TemporalFilterParts, maxLength: number, event: Event): void {
	const input = event.target as HTMLInputElement;
	const value = input.value.replace(/\D/g, '').slice(0, maxLength);
	input.value = value;

	const next = { ...temporalParts.value };
	if (value) next[component] = value;
	else delete next[component];
	emit('update:modelValue', encodeTemporalFilterValue(next));
}

function selectTemporalPart(event: FocusEvent): void {
	(event.target as HTMLInputElement).select();
}
</script>

<template>
	<!-- eslint-disable vue/html-self-closing -->
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
		<div
			v-else-if="temporalKind"
			class="temporal-filter-control"
			:class="{ disabled }"
			role="group"
			:aria-label="config.helpText"
		>
			<v-icon name="search" x-small class="temporal-filter__icon" />
			<div v-if="includesDate" class="temporal-filter__group">
				<input
					:value="temporalParts.day ?? ''"
					:disabled="disabled"
					aria-label="Day"
					class="temporal-filter__segment"
					inputmode="numeric"
					maxlength="2"
					placeholder="DD"
					@focus="selectTemporalPart"
					@input="updateTemporalPart('day', 2, $event)"
				/>
				<span class="temporal-filter__separator">.</span>
				<input
					:value="temporalParts.month ?? ''"
					:disabled="disabled"
					aria-label="Month"
					class="temporal-filter__segment"
					inputmode="numeric"
					maxlength="2"
					placeholder="MM"
					@focus="selectTemporalPart"
					@input="updateTemporalPart('month', 2, $event)"
				/>
				<span class="temporal-filter__separator">.</span>
				<input
					:value="temporalParts.year ?? ''"
					:disabled="disabled"
					aria-label="Year"
					class="temporal-filter__segment temporal-filter__segment--year"
					inputmode="numeric"
					maxlength="4"
					placeholder="YYYY"
					@focus="selectTemporalPart"
					@input="updateTemporalPart('year', 4, $event)"
				/>
			</div>
			<span v-if="temporalKind === 'dateTime'" class="temporal-filter__separator">,</span>
			<div v-if="includesTime" class="temporal-filter__group">
				<input
					:value="temporalParts.hour ?? ''"
					:disabled="disabled"
					aria-label="Hour"
					class="temporal-filter__segment"
					inputmode="numeric"
					maxlength="2"
					placeholder="HH"
					@focus="selectTemporalPart"
					@input="updateTemporalPart('hour', 2, $event)"
				/>
				<span class="temporal-filter__separator">:</span>
				<input
					:value="temporalParts.minute ?? ''"
					:disabled="disabled"
					aria-label="Minute"
					class="temporal-filter__segment"
					inputmode="numeric"
					maxlength="2"
					placeholder="MM"
					@focus="selectTemporalPart"
					@input="updateTemporalPart('minute', 2, $event)"
				/>
				<span class="temporal-filter__separator">:</span>
				<input
					:value="temporalParts.second ?? ''"
					:disabled="disabled"
					aria-label="Second"
					class="temporal-filter__segment"
					inputmode="numeric"
					maxlength="2"
					placeholder="SS"
					@focus="selectTemporalPart"
					@input="updateTemporalPart('second', 2, $event)"
				/>
			</div>
			<v-icon :name="temporalKind === 'time' ? 'schedule' : 'calendar_month'" x-small class="temporal-filter__icon" />
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
	<!-- eslint-enable vue/html-self-closing -->
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

.temporal-filter-control {
	display: flex;
	align-items: center;
	gap: 4px;
	inline-size: 100%;
	block-size: 36px;
	box-sizing: border-box;
	padding: 0 10px;
	overflow: hidden;
	color: var(--theme--form--field--input--foreground);
	font-size: 14px;
	background: var(--theme--form--field--input--background);
	border: var(--theme--border-width) solid var(--theme--form--field--input--border-color);
	border-radius: var(--theme--border-radius);
	box-shadow: var(--theme--form--field--input--box-shadow);
	transition:
		border-color var(--fast) var(--transition),
		box-shadow var(--fast) var(--transition);
}

.temporal-filter-control:not(.disabled):hover {
	border-color: var(--theme--form--field--input--border-color-hover);
}

.temporal-filter-control:not(.disabled):focus-within {
	border-color: var(--theme--form--field--input--border-color-focus);
	box-shadow: var(--theme--form--field--input--box-shadow-focus);
}

.temporal-filter-control.disabled {
	opacity: 0.5;
}

.temporal-filter__group {
	display: flex;
	align-items: center;
	min-inline-size: 0;
}

.temporal-filter__segment {
	inline-size: 2.25ch;
	min-inline-size: 2.25ch;
	padding: 0;
	color: inherit;
	font: inherit;
	line-height: 1;
	text-align: center;
	background: transparent;
	border: 0;
	outline: 0;
}

.temporal-filter__segment--year {
	inline-size: 4.5ch;
	min-inline-size: 4.5ch;
}

.temporal-filter__segment::placeholder,
.temporal-filter__separator,
.temporal-filter__icon {
	color: var(--theme--form--field--input--foreground-subdued);
	opacity: 1;
}

.temporal-filter__icon:last-child {
	margin-inline-start: auto;
}

.temporal-filter__icon {
	flex: 0 0 auto;
}
</style>
