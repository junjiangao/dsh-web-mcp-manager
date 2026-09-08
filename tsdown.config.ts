import { builtinModules } from 'node:module'
import { defineConfig } from 'tsdown'

const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))

/**
 * A package-local build configuration. The Host artifact is a normal ESM
 * module. The Client artifact is a small CommonJS factory, matching the
 * `window.__ModuleLoader__.load({ id, factory })` contract used by Web
 * profiles. Runtime framework packages remain module-table externals; React
 * and the wire-only shared packages are supplied by the profile.
 */
export default defineConfig([
  {
    name: '@junjiangao/dsh-web-mcp-manager',
    entry: { index: 'lib/types/index.js' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: (specifier: string) => builtins.has(specifier)
        || specifier.startsWith('@deepseek-ai/')
        || specifier === 'zod'
        || specifier.startsWith('@modelcontextprotocol/'),
    },
  },
  {
    name: '@junjiangao/dsh-web-mcp-manager/client',
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: (specifier: string) => specifier === 'react'
        || specifier === 'react/jsx-runtime'
        || specifier.startsWith('@deepseek-ai/dsh-client-')
        || specifier === '@deepseek-ai/cordis',
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "@junjiangao/dsh-web-mcp-manager", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
