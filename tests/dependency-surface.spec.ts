/**
 * Dependency-surface guard for the runtime resolution router.
 *
 * `dsh` installs a `ResolutionRouter` over Node's ESM/CJS resolvers: modules
 * inside a profile tree have their bare specifiers routed to the running
 * runtime's own package table, and the router only builds a routing layer for
 * packages the importing package declares. A *value* import that is not
 * declared therefore resolves natively and fails inside a profile, where
 * `autoInstallPeers: false` means peers are never installed. Type-only imports
 * are erased before that point, so they only need the build-time
 * `devDependencies` copy.
 *
 * Over-declaration costs profile installs and hides which packages the plugin
 * really couples to, so every declared peer must also be referenced somewhere.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  dsh?: { client?: { inject?: string[] } }
}

/** Every `@deepseek-ai/<name>` mention, split by whether it survives the build. */
interface Surface {
  readonly value: Set<string>
  readonly typeOnly: Set<string>
}

/** Normalize a specifier or subpath to its package name. */
function packageNameOf(specifier: string): string {
  const segments = specifier.split('/')
  return specifier.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0] as string
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/u.test(entry) ? [path] : []
  })
}

/**
 * Collect the plugin's own import surface from its sources.
 *
 * `import type … from 'x'` and `import type {} from 'x'` erase at build time;
 * a plain `import`/`export … from`, a dynamic `import()`, and `require()` do
 * not. Bare `node:` builtins and React are outside the router's package table.
 */
function collectSurface(): Surface {
  const value = new Set<string>()
  const typeOnly = new Set<string>()
  const staticImport = /(^|\n)\s*(?:import|export)\s+(type\s+)?[^;'"]*?from\s+['"]([^'"]+)['"]/gu
  const dynamicImport = /(?:^|[^.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)/gu
  const requireCall = /(?:^|[^.\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/gu

  for (const file of sourceFiles(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8')
    const record = (specifier: string, type: boolean): void => {
      if (!specifier.startsWith('@')) return
      const name = packageNameOf(specifier)
      if (!name.startsWith('@deepseek-ai/')) return
      ;(type ? typeOnly : value).add(name)
    }
    for (const match of text.matchAll(staticImport)) record(match[3] as string, match[2] !== undefined)
    for (const match of text.matchAll(dynamicImport)) record(match[1] as string, false)
    for (const match of text.matchAll(requireCall)) record(match[1] as string, false)
  }

  // A package imported both ways is a value import: that is the stricter rule.
  for (const name of value) typeOnly.delete(name)
  return { value, typeOnly }
}

const surface = collectSurface()
const peers = Object.keys(manifest.peerDependencies ?? {})
const devDeps = Object.keys(manifest.devDependencies ?? {})
const clientInject = (manifest.dsh?.client?.inject ?? []).map(packageNameOf)

describe('runtime dependency surface', () => {
  it('declares every value import as a peer dependency', () => {
    // The resolution router only routes declared packages; an undeclared value
    // import fails inside a profile because peers are never installed there.
    const undeclared = [...surface.value].filter(name => !peers.includes(name)).sort()
    expect(undeclared).toEqual([])
  })

  it('declares every browser module-table injection as a peer dependency', () => {
    // `dsh.client.inject` is the client loader's load-order contract, and the
    // peer list is what dsh's own compatibility gate inspects.
    const undeclared = clientInject.filter(name => !peers.includes(name)).sort()
    expect(undeclared).toEqual([])
  })

  it('keeps every referenced package installable at build time', () => {
    const missing = [...surface.value, ...surface.typeOnly]
      .filter(name => !peers.includes(name) && !devDeps.includes(name))
      .sort()
    expect(missing).toEqual([])
  })

  it('does not declare a peer the plugin never references', () => {
    // Every peer is checked against the running dsh version at profile start,
    // so an unreferenced one only adds install weight and false constraints.
    const referenced = new Set([...surface.value, ...surface.typeOnly, ...clientInject])
    const unreferenced = peers.filter(name => !referenced.has(name)).sort()
    expect(unreferenced).toEqual([])
  })
})
