import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Test-only Vite configuration.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` publishes one flat ESM bundle that
 * imports its own CSS modules plus `shiki`, `katex`, `mdast-*`, `micromark-*`,
 * `diff`, `anser`, and `simple-icons` without declaring any of them: the Web
 * shell's bundler tree-shakes it and serves the result to every plugin through
 * the shared module table. Nothing outside that bundler can import it, so the
 * bare specifier resolves to `tests/stubs/ui-primitives.tsx`, a double that
 * mirrors the published markup. The panel's props are still type-checked
 * against the real package, which stays a dev dependency.
 *
 * Nothing here affects the shipped artifacts: the plugin build keeps every
 * `@deepseek-ai/dsh-client-*` specifier external (see `tsdown.config.ts`).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(new URL('./tests/stubs/ui-primitives.tsx', import.meta.url)),
    },
  },
})
