// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, apiPost, downloadFile } = vi.hoisted(() => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	downloadFile: vi.fn(),
}));

vi.mock('@directus/extensions-sdk', () => ({
	useApi: () => ({ get: apiGet, post: apiPost }),
}));

vi.mock('../src/utils/download', () => ({ downloadFile }));

import TableExport from '../src/components/table-export.vue';

function mountExport(overrides: Record<string, unknown> = {}) {
	return mount(TableExport, {
		props: {
			collection: 'articles',
			effectiveFilter: { title: { _icontains: 'guide' } },
			exportFields: ['id', 'title'],
			itemCount: 100_000,
			limit: 25,
			page: 2,
			primaryKeyField: null,
			selection: [],
			sort: ['title'],
			versionKey: null,
			...overrides,
		},
		global: {
			stubs: {
				'sidebar-detail': { template: '<section><slot /></section>' },
				'v-notice': { template: '<div class="notice"><slot /></div>' },
				'v-select': {
					props: ['modelValue', 'items'],
					template: '<select><option v-for="item in items" :key="item.value">{{ item.text }}</option></select>',
				},
				'v-button': {
					props: ['disabled', 'loading'],
					emits: ['click'],
					template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
				},
			},
		},
	});
}

beforeEach(() => {
	apiGet.mockReset();
	apiPost.mockReset();
	downloadFile.mockReset();
	apiGet.mockResolvedValue({ data: new Blob(['id,title']) });
	apiPost.mockResolvedValue({ data: {} });
});

describe('TableExport', () => {
	it('requires explicit confirmation before a large full export is started', async () => {
		const wrapper = mountExport();

		await wrapper.get('button').trigger('click');

		expect(apiPost).not.toHaveBeenCalled();
		expect(wrapper.get('.full-export-confirmation').text()).toContain('100,000 items');
		expect(wrapper.text()).toContain('Directus file library');

		const confirm = wrapper.findAll('button').find((button) => button.text().includes('Confirm full export'));
		await confirm?.trigger('click');

		expect(apiPost).toHaveBeenCalledTimes(1);
		expect(apiPost).toHaveBeenCalledWith('/utils/export/articles', {
			format: 'csv',
			query: expect.objectContaining({ limit: -1 }),
		});
	});

	it('keeps content-version export bounded and passes the version to Directus', async () => {
		const wrapper = mountExport({ itemCount: 3, versionKey: 'draft' });

		expect(wrapper.text()).not.toContain('All matching items');
		expect(wrapper.text()).toContain('background export route reads published data');

		await wrapper.get('button').trigger('click');

		expect(apiPost).not.toHaveBeenCalled();
		expect(apiGet).toHaveBeenCalledWith('/items/articles', {
			params: expect.objectContaining({ limit: 25, offset: 25, version: 'draft' }),
			responseType: 'blob',
		});
		expect(downloadFile).toHaveBeenCalledTimes(1);
	});
});
