import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // The React-Compiler-era react-hooks rule flags many idiomatic effects where
  // the setState is intentional and correct — mount-time data loads (setState
  // lands after an await), hydration-safe init (deliberately set after mount to
  // avoid an SSR mismatch), and polling. Surface those as warnings rather than
  // failing the build; the genuinely bug-catching siblings (react-hooks/refs and
  // react-hooks/immutability) stay errors.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
