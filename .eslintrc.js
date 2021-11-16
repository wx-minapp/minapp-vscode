module.exports = {
  root: true,
  env: {
      node: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
      'no-empty': 0,
      'no-prototype-builtins': 0,

      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/no-namespace': 0,
      '@typescript-eslint/no-empty-function': 0,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-unused-vars': 0,
      '@typescript-eslint/no-var-requires': 0
  }
};
