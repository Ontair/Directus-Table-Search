// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ColumnFilterControl from '../src/components/column-filter-control.vue';

describe('ColumnFilterControl', () => {
	it('allows the year to be entered without filling day or month first', async () => {
		const wrapper = mount(ColumnFilterControl, {
			props: { kind: 'date', modelValue: '' },
			global: {
				stubs: {
					'v-icon': true,
					'v-input': true,
					'v-list': true,
					'v-list-item': true,
					'v-list-item-content': true,
					'v-menu': true,
				},
			},
		});

		await wrapper.get('input[aria-label="Year"]').setValue('2026');
		expect(wrapper.emitted('update:modelValue')).toEqual([['@t:2026,,,,,']]);
	});

	it.each([
		['dateTime', 'Hour', '7', '@t:,,,7,,'],
		['time', 'Minute', '5', '@t:,,,,5,'],
	] as const)('allows any %s segment to be entered independently', async (kind, label, value, encoded) => {
		const wrapper = mount(ColumnFilterControl, {
			props: { kind, modelValue: '' },
			global: {
				stubs: {
					'v-icon': true,
					'v-input': true,
					'v-list': true,
					'v-list-item': true,
					'v-list-item-content': true,
					'v-menu': true,
				},
			},
		});

		await wrapper.get(`input[aria-label="${label}"]`).setValue(value);
		expect(wrapper.emitted('update:modelValue')).toEqual([[encoded]]);
	});

	it('reflects external temporal model updates and reset', async () => {
		const wrapper = mount(ColumnFilterControl, {
			props: { kind: 'dateTime', modelValue: '@t:2026,,10,12,34,' },
			global: {
				stubs: {
					'v-icon': true,
					'v-input': true,
					'v-list': true,
					'v-list-item': true,
					'v-list-item-content': true,
					'v-menu': true,
				},
			},
		});

		expect(wrapper.get<HTMLInputElement>('input[aria-label="Year"]').element.value).toBe('2026');
		expect(wrapper.get<HTMLInputElement>('input[aria-label="Hour"]').element.value).toBe('12');

		await wrapper.setProps({ modelValue: '' });
		expect(wrapper.get<HTMLInputElement>('input[aria-label="Year"]').element.value).toBe('');
		expect(wrapper.get<HTMLInputElement>('input[aria-label="Hour"]').element.value).toBe('');
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
