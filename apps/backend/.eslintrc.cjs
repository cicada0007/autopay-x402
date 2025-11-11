module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json']
  },
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  plugins: ['@typescript-eslint', 'import', 'jest'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:jest/recommended',
    'prettier'
  ],
  rules: {
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'import/order': 'off'
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: ['./tsconfig.json']
      }
    }
  },
  ignorePatterns: ['dist', 'node_modules']
};

