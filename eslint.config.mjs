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
    // Worktrees y config de la herramienta, nunca código del proyecto. Los
    // patrones de arriba están anclados a la raíz, así que no alcanzaban al
    // .next ni al public/ de un worktree: eslint entraba a los minificados y
    // reportaba cientos de problemas ajenos.
    ".claude/**",
    // Generados por next-pwa en cada build (y en .gitignore).
    "public/sw.js",
    "public/workbox-*.js",
    "public/swe-worker-*.js",
  ]),
]);

export default eslintConfig;
