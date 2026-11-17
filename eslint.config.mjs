// Catches names used but never defined: `herdr-app check` misses them inside handlers it does not run.
const node = { console: "readonly", process: "readonly", Buffer: "readonly", URL: "readonly", globalThis: "readonly", structuredClone: "readonly", performance: "readonly" };

export default [
  { ignores: ["node_modules/**", "openspec/**", "mods/*/material-icons.js"] },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: node },
    rules: { "no-undef": "error", "no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_" }] },
  },
  // Herdr gives every mod a localStorage (gpui-kit.d.ts).
  { files: ["mods/**/*.js", "upstream/**/*.js"], languageOptions: { globals: { localStorage: "readonly" } } },
];
