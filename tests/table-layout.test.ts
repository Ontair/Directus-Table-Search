// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import TableLayout from '../src/components/table-layout.vue';

function mountLayout(overrides: Record<string, unknown> = {}) {
	const toPage = vi.fn();
	const wrapper = mount(TableLayout, {
		props: {
			changeManualSort: vi.fn(),
			collection: 'example',
			columnFilterKinds: {},
			columnFilterMode: 'inline',
			columnFilters: {},
			fields: ['id'],
			itemCount: 1,
			itemValuePaths: {},
			items: [{ id: 1 }],
			limit: 25,
			loading: false,
			onAlignChange: vi.fn(),
			onRowClick: vi.fn(),
			onSortChange: vi.fn(),
			page: 1,
			resetPresetAndRefresh: vi.fn(),
			selectAll: vi.fn(),
			selection: [],
			showColumnFilters: false,
			showSelect: 'none',
			sortAllowed: false,
			tableHeaders: [],
			tableRowHeight: 48,
			tableSort: null,
			toPage,
			totalPages: 1,
			...overrides,
		},
		global: {
			provide: { 'main-element': undefined },
			stubs: {
				'column-filter-control': true,
				'render-display': true,
				'v-button': true,
				'v-chip': true,
				'v-divider': true,
				'v-field-list': true,
				'v-icon': true,
				'v-list': true,
				'v-list-item': true,
				'v-list-item-content': true,
				'v-list-item-icon': true,
				'v-menu': true,
				'v-pagination': { props: ['length', 'modelValue'], template: '<div class="pagination-control" />' },
				'v-skeleton-loader': { template: '<div class="pagination-loading" />' },
				'v-table': { template: '<div class="table-stub"><slot name="footer" /></div>' },
				'v-select': {
					props: ['modelValue', 'items'],
					emits: ['update:modelValue'],
					template:
						'<select class="page-size" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.text }}</option></select>',
				},
			},
			directives: { tooltip: () => undefined },
		},
	});

	return { toPage, wrapper };
}

describe('TableLayout pagination', () => {
	it('keeps the page-size selector available when the collection has fewer than 25 items', () => {
		const { wrapper } = mountLayout();

		expect(wrapper.get('.per-page').text()).toContain('Per page');
		expect(
			wrapper
				.get('select.page-size')
				.findAll('option')
				.map((option) => option.text()),
		).toEqual(['25', '50', '100', '250', '500', '1000']);
	});

	it('keeps pagination visible and emits a supported page size', async () => {
		const { toPage, wrapper } = mountLayout({
			itemCount: 121,
			items: Array.from({ length: 25 }, (_, index) => ({ id: index + 51 })),
			page: 3,
			totalPages: 5,
		});

		await wrapper.get('select.page-size').setValue('1000');

		expect(wrapper.get('.pagination-control')).toBeDefined();
		expect(wrapper.emitted('update:limit')).toEqual([[1000]]);
		expect(toPage).not.toHaveBeenCalled();
	});

	it('keeps fetched rows visible while the item count is still loading', () => {
		const { wrapper } = mountLayout({
			itemCount: null,
			items: Array.from({ length: 25 }, (_, index) => ({ id: index + 1 })),
			loadingItemCount: true,
			totalPages: 0,
		});

		expect(wrapper.get('.table-stub')).toBeDefined();
		expect(wrapper.get('.pagination-loading')).toBeDefined();
		expect(wrapper.get('.per-page')).toBeDefined();
	});
});
