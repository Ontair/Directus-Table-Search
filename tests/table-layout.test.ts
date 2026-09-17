// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TableLayout from '../src/components/table-layout.vue';

afterEach(() => {
	vi.useRealTimers();
});

function header(value: string, text: string) {
	return {
		align: 'left',
		description: null,
		field: { collection: 'example', display: 'raw', field: value, type: 'string' },
		sortable: true,
		text,
		value,
		width: 180,
	};
}

function mountLayout(overrides: Record<string, unknown> = {}) {
	const toPage = vi.fn();
	const wrapper = mount(TableLayout, {
		props: {
			changeManualSort: vi.fn(),
			collection: 'example',
			columnFilterKinds: {},
			columnFilterMode: 'inline',
			columnFilters: {},
			columnFilterIssues: {},
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
			searchStatus: 'empty',
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
				'v-notice': { template: '<div class="notice"><slot /></div>' },
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

describe('TableLayout filter feedback', () => {
	it('renders typed column text immediately and applies the server filter after a pause', async () => {
		vi.useFakeTimers();
		const { wrapper } = mountLayout({
			columnFilterKinds: { title: 'text' },
			showColumnFilters: true,
			tableHeaders: [header('title', 'Title')],
		});
		const control = wrapper.findComponent({ name: 'ColumnFilterControl' });

		control.vm.$emit('update:modelValue', 'с');
		await wrapper.vm.$nextTick();
		control.vm.$emit('update:modelValue', 'си');
		await wrapper.vm.$nextTick();
		control.vm.$emit('update:modelValue', 'сигма');
		await wrapper.vm.$nextTick();

		expect(control.props('modelValue')).toBe('сигма');
		expect(wrapper.emitted('update:columnFilters')).toBeUndefined();

		vi.advanceTimersByTime(300);
		await wrapper.vm.$nextTick();

		expect(wrapper.emitted('update:columnFilters')).toEqual([[{ title: 'сигма' }]]);
	});

	it('stays silent while the generated filters are usable', () => {
		const { wrapper } = mountLayout();

		expect(wrapper.findAll('.notice')).toHaveLength(0);
	});

	it('explains a search that no visible column can express', () => {
		const { wrapper } = mountLayout({ items: [], itemCount: 0, searchStatus: 'unsupported' });
		const notices = wrapper.findAll('.notice');

		expect(notices).toHaveLength(1);
		expect(notices[0]?.text()).toContain('None of the visible columns can be searched');
	});

	it('names the column whose filter value cannot be applied', () => {
		const { wrapper } = mountLayout({
			columnFilterIssues: { views: 'invalid' },
			itemCount: 0,
			items: [],
			tableHeaders: [header('views', 'Views')],
		});

		expect(wrapper.get('.notice').text()).toContain('The filter value for Views');
	});

	it('lists every unsearchable column in one notice', () => {
		const { wrapper } = mountLayout({
			columnFilterIssues: { payload: 'unsupported', signature: 'unsupported' },
			itemCount: 0,
			items: [],
			tableHeaders: [header('payload', 'Payload'), header('signature', 'Signature')],
		});

		expect(wrapper.get('.notice').text()).toContain('Columns Payload, Signature cannot be searched');
	});

	it('reports the search and the column filters independently', () => {
		const { wrapper } = mountLayout({
			columnFilterIssues: { views: 'unsupported' },
			itemCount: 0,
			items: [],
			searchStatus: 'invalid',
			tableHeaders: [header('views', 'Views')],
		});

		expect(wrapper.findAll('.notice')).toHaveLength(2);
	});

	it('marks the control that holds the unusable value', () => {
		const { wrapper } = mountLayout({
			columnFilterIssues: { views: 'invalid' },
			columnFilterKinds: { views: 'number' },
			columnFilters: { views: 'abc' },
			showColumnFilters: true,
			tableHeaders: [header('views', 'Views')],
		});

		expect(wrapper.find('.inline-column-filter__control--invalid').exists()).toBe(true);
	});
});
