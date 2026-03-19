import js from "@eslint/js";
import tseslint from "typescript-eslint";

const commonConfig = [
  {
    ignores: ["dist/**", "coverage/**", "build/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    rules: {
      "no-console": "off"
    }
  }
];

export const nodeServiceConfig = commonConfig;

export const reactConfig = [
  ...commonConfig,
  {
    files: ["**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='useMemo']",
          message:
            "Avoid useMemo by default; add it only after measuring a real performance need."
        },
        {
          selector: "CallExpression[callee.name='useCallback']",
          message:
            "Avoid useCallback by default; add it only after measuring a real performance need."
        }
      ]
    }
  }
];