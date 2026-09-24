/**
 * Plugins-page display metadata guard.
 *
 * The Web Plugins page shows a plugin's title and description from the Host's
 * `readPluginMeta()`, which reads `<entry name>/locale/en.json` first and then
 * every other `*.json` beside it, each resolved through the package specifier
 * before it is read. When that anchor is absent — or present but not exported —
 * the page falls back to the untranslated `package.json` name, which is the raw
 * `@junjiangao/dsh-web-mcp-manager` this plugin used to show.
 *
 * These tests mirror the Host rules the way `@junjiangao/dsh-web-search-tavily`
 * does, so a locale file the Host would reject fails here instead: a filename
 * that is not a language id, an empty `meta` field, a key the anchor does not
 * carry, or a file missing from `exports`/`files`.
 *
 * Resolution note: the Host resolves through the Node **ESM** loader, while
 * Vitest's SSR transform replaces `import.meta` and leaves that resolver
 * unreachable in-process. `createRequire` applies the same `exports` gate, and
 * this package's mapping is an unconditional string (no `require`/`import`
 * condition), so both resolvers accept and reject exactly the same specifiers.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string
  exports: Record<string, unknown>
  files?: string[]
}

/** Language-id filenames the Host admits, mirrored from app-boot's LANGUAGE_ID. */
const LANGUAGE_ID = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

/** The locale directory the Host enumerates beside the English anchor. */
const localeDirectory = join(root, 'locale')

/** Resolves subpaths through this package's own `exports` map. */
const resolve = createRequire(import.meta.url).resolve

/** One display dictionary as the Host parses it. */
interface Dictionary {
  meta: Record<string, string>
}

/**
 * Read one display dictionary the way the Host does: resolve the file through
 * the complete package specifier first, so a file that exists but is not
 * exported fails here exactly as it would on the Plugins page.
 * @param language - the dictionary's language id, i.e. its filename stem.
 * @returns the parsed dictionary.
 */
function readDictionary(language: string): Dictionary {
  const file = resolve(`${manifest.name}/locale/${language}.json`)
  return JSON.parse(readFileSync(file, 'utf8')) as Dictionary
}

/** Every dictionary filename the Host would enumerate, as language ids. */
function languages(): string[] {
  return readdirSync(localeDirectory)
    .filter(entry => entry.endsWith('.json'))
    .map(entry => entry.slice(0, -'.json'.length))
}

describe('plugin display metadata', () => {
  it('ships the English anchor the Host reads first', () => {
    const { meta } = readDictionary('en')
    expect(meta['title']?.trim()).not.toBe('')
    expect(meta['description']?.trim()).not.toBe('')
  })

  it('resolves every dictionary through the package specifier', () => {
    // `readPluginMeta()` skips a specifier it cannot read as a package, and the
    // locale resource itself is resolved before it is read. The export map is
    // what makes `<name>/locale/en.json` a legal specifier at all.
    expect(manifest.exports['./locale/*.json']).toBe('./locale/*.json')
    expect(readDictionary('en').meta['title']).toBeTypeOf('string')
  })

  it('translates every language the directory carries, keyed by a language id', () => {
    // The Host reads *every* `*.json` beside the anchor and throws when a
    // filename is not a language id, so a stray file here would break the
    // plugin's metadata outright rather than being ignored.
    const anchor = Object.keys(readDictionary('en').meta).sort()
    const found = languages()
    expect(found).toContain('en')
    for (const language of found) {
      expect(language).toMatch(LANGUAGE_ID)
      const { meta } = readDictionary(language)
      expect(Object.keys(meta).sort()).toEqual(anchor)
      for (const value of Object.values(meta)) expect(value.trim()).not.toBe('')
    }
    // A language whose title repeats the anchor translates nothing: that is
    // what an absent file already does through the English fallback.
    expect(readDictionary('zh').meta['title']).not.toBe(readDictionary('en').meta['title'])
  })

  it('declares the locale directory in files, so the GitHub tarball carries it', () => {
    // GitHub installation packs the repository through the `files` list, so a
    // locale file left out of it is metadata the profile never receives.
    expect(manifest.files).toContain('locale/*.json')
  })

  it('mounts under the package name the locale resolver is addressed with', () => {
    // The Host resolves `<Loader entry name>/locale/en.json`, so an entry name
    // that drifts from the manifest name would silently fall back to the
    // untranslated package name.
    const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain(`name: '${manifest.name}'`)
  })
})
