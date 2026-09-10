import vue from '@vitejs/plugin-vue';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [vue()],
	test: {
		exclude: [...configDefaults.exclude, 'tests/integration/**'],
		environment: 'node',
		coverage: {
			reporter: ['text', 'html'],
		},
	},
});
