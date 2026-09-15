// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ColumnFilterControl from '../src/components/column-filter-control.vue';

describe('ColumnFilterControl', () => {
	it('keeps the boolean selector controlled by its model value', async () => {
		const wrapper = mount(ColumnFilterControl, {
			props: {
				kind: 'boolean',
				modelValue: 'false',
			},
			global: {
				stubs: {
					'v-icon': true,
					'v-input': true,
				},
			},
		});
		const select = wrapper.get<HTMLSelectElement>('select');

		expect(select.element.value).toBe('false');

		await wrapper.setProps({ modelValue: '' });
		expect(select.element.value).toBe('');

		await select.setValue('true');
		expect(wrapper.emitted('update:modelValue')).toEqual([['true']]);
	});
});
