#!/usr/bin/env node
/**
 * Reject a peer declaration the running DSH runtime would call incompatible.
 *
 * `dsh` gates every profile plugin before the Loader imports it: a plugin whose
 * `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer requirement the running
 * runtime does not satisfy is loaded **disabled**, with a
 * `dsh plugin allow-version` remedy. That check is
 * `evaluatePluginCompatibility` in `@deepseek-ai/dsh-app-boot`
 * (`lib/index.js`), whose whole verdict reduces to:
 *
 * ```js
 * if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
 * if (requirement.trim() === '' ||
 *     !semver.satisfies(runtimeVersion, requirement, { includePrerelease: true }))
 *   peers[name] = range
 * ```
 *
 * This script reproduces that predicate so the failure shows up in CI instead
 * of on a user's next `dsh` upgrade. It deliberately does not depend on
 * `dsh-app-boot` (which pulls a native addon and its own peer tree); the
 * predicate above is the entire contract and `includePrerelease: true` is the
 * load-bearing detail — without it `^0.2.0-rc.1` would reject
 * `0.2.1-alpha.1`.
 *
 * Usage:
 *   node scripts/check-dsh-compat.mjs                 # installed dsh version
 *   node scripts/check-dsh-compat.mjs 0.2.1-alpha.1   # explicit runtime
 *   node scripts/check-dsh-compat.mjs 0.3.0           # expect a failure
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/**
 * The running DSH version. Every `@deepseek-ai/dsh-*` package ships the same
 * version, so any installed one answers for the runtime.
 * @returns {string} a semantic version.
 */
function installedRuntimeVersion() {
  const require = createRequire(import.meta.url)
  const probe = '@deepseek-ai/dsh-mcp-client/package.json'
  try {
    return JSON.parse(readFileSync(require.resolve(probe), 'utf8')).version
  } catch (error) {
    console.error(`check:compat cannot determine the installed dsh version: ${error.message}`)
    console.error('Pass the runtime version explicitly: node scripts/check-dsh-compat.mjs <version>')
    process.exit(2)
  }
}

/** @param {string} name @returns {boolean} whether the runtime gates this peer. */
function isGatedPeer(name) {
  return name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
}

const runtimeVersion = process.argv[2] ?? installedRuntimeVersion()
if (semver.valid(runtimeVersion) === null) {
  console.error(`check:compat received an invalid runtime version: ${JSON.stringify(runtimeVersion)}`)
  process.exit(2)
}

/** @type {Record<string, string>} */
const incompatiblePeers = {}
for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
  if (!isGatedPeer(name) || typeof range !== 'string') continue
  if (!semver.satisfies(runtimeVersion, range, { includePrerelease: true })) incompatiblePeers[name] = range
}

const enginesDsh = manifest.engines?.dsh
const enginesSatisfied = typeof enginesDsh !== 'string'
  || semver.satisfies(runtimeVersion, enginesDsh, { includePrerelease: true })

if (Object.keys(incompatiblePeers).length === 0 && enginesSatisfied) {
  const engineNote = typeof enginesDsh === 'string' ? `, engines.dsh ${enginesDsh}` : ''
  console.log(`check:compat ok — ${manifest.name}@${manifest.version} accepts dsh ${runtimeVersion}${engineNote}`)
  process.exit(0)
}

console.error(
  `Plugin ${manifest.name}@${manifest.version} is incompatible with dsh ${runtimeVersion}:`
  + ` peerDependencies ${JSON.stringify(incompatiblePeers)}`
  + (enginesSatisfied ? '' : `, engines.dsh ${JSON.stringify(enginesDsh)}`),
)
console.error(
  'Running it may cause crashes or data loss. Update the plugin, or widen the requirement'
  + ' deliberately — an incompatible peer leaves the Loader row disabled on the next dsh start.',
)
process.exit(1)
