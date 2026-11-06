import config from '@adiwajshing/eslint-config'
import css from '@eslint/css'
import { defineConfig } from 'eslint/config'

export default defineConfig([
	{
		files: [
			'packages/**/*.ts',
			'packages/**/*.tsx',
			'**/public/scripts/*.js',
			'**/public/scripts/*.mjs',
		],
	},
	{
		ignores: [
			'**/lib',
			'**/artifacts',
			'**/cache',
			'**/ignition/deployments',
			'**/dist',
			'**/cjs',
			'**/types/pg',
			'**/queries.ts',
			'**/*.gen.ts',
			'**/*.css',
			'**/*.min.js',
			'**/vendor',
		],
	},
	{
		extends: config,
	},
	{
		rules: {
			camelcase: 'off',
			'react/no-unknown-property': 'off',
			'react/jsx-key': 'off',
		},
		settings: {
			react: {
				version: '19.2.0',
			},
		},
	},
	{
		// Hardhat scripts and tests carry long viem/chai lines; the contracts
		// package owns its own style.
		files: ['packages/contracts/**/*.ts'],
		rules: { '@stylistic/max-len': 'off' },
	},
	{
		files: ['**/*.css'],
		plugins: { css },
		language: 'css/css',
		extends: ['css/recommended'],
	},
])
