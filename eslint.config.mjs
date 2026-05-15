import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      curly: "error",
      "no-nested-ternary": "error",
      "max-depth": ["error", 3],
    },
  },
);
