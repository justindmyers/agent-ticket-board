export default {
  '*.{ts,tsx,js,mjs,cjs}': 'eslint --fix --max-warnings 0 --no-warn-ignored',
  '*.{json,css,yml,yaml}': 'prettier --write'
};
