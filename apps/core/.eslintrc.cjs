module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended', // disables conflicting rules
  ],
  rules: {
    'prettier/prettier': 'error',
    // "@typescript-eslint/no-explicit-any": "error"
  },
};
