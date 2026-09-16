// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ColumnFilterControl from '../src/components/column-filter-control.vue';

describe('ColumnFilterControl', () => {
	it.each(['date', 'dateTime', 'time'] as const)('emits every typed character for %s filters', async (kind) => {
		const wrapper = mount(ColumnFilterControl, {
			props: { kind, modelValue: '' },
			global: {
				stubs: {
					'v-icon': true,
					'v-input': {
						emits: ['update:modelValue'],
						props: ['modelValue'],
						template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
					},
					'v-list': true,
					'v-list-item': true,
					'v-list-item-content': true,
					'v-menu': true,
				},
			},
		});

		await wrapper.get('input').setValue('1');
		expect(wrapper.emitted('update:modelValue')).toEqual([['1']]);
	});

	it('keeps the boolean selector controlled by its model value', async () => {
		const wrapper = mount(ColumnFilterControl, {
			props: {
				kind: 'boolean',
				modelValue: 'false',
			},
			global: {
				stubs: {
					'v-icon': true,
					'v-input': {
						props: ['modelValue'],
						template: '<div class="input-preview">{{ modelValue }}</div>',
					},
					'v-list': { template: '<div><slot /></div>' },
					'v-list-item': {
						emits: ['click'],
						template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
					},
					'v-list-item-content': { template: '<span><slot /></span>' },
					'v-menu': {
						methods: { toggle() {} },
						template: '<div><slot name="activator" :toggle="toggle" :active="false" /><slot /></div>',
					},
				},
			},
		});

		expect(wrapper.get('.input-preview').text()).toBe('False');

		await wrapper.setProps({ modelValue: '' });
		expect(wrapper.get('.input-preview').text()).toBe('Any');

		await wrapper.findAll('button')[1]!.trigger('click');
		expect(wrapper.emitted('update:modelValue')).toEqual([['true']]);
	});
});
