import eslint from '@eslint/js';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	...vue.configs['flat/recommended'],
	{
		files: ['**/*.{ts,vue}'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser,
				projectService: true,
				extraFileExtensions: ['.vue'],
			},
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'vue/html-indent': 'off',
			'vue/max-attributes-per-line': 'off',
			'vue/multi-word-component-names': 'off',
			'vue/singleline-html-element-content-newline': 'off',
		},
	},
	{
		files: ['**/*.{js,cjs,mjs}'],
		...tseslint.configs.disableTypeChecked,
		languageOptions: {
			...tseslint.configs.disableTypeChecked.languageOptions,
			globals: globals.node,
		},
		rules: {
			...tseslint.configs.disableTypeChecked.rules,
			'@typescript-eslint/no-require-imports': 'off',
		},
	},
);
