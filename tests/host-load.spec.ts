/**
 * Real-load-path guard for the Host entry.
 *
 * The manager used to call `connection.rpc.handle()`, which mounts its physical
 * route with `owner.webServer.register()` where `owner` is the *Connection*
 * service's Context — not the caller's (the Cordis traceable shadow's origin is
 * the service Context, so the fiber walk starts at the Connection fiber).  In
 * the shipped Web profile `webServer` is provided by a SIBLING loader entry,
 * that walk reached the root, and the whole profile died at load time with
 * `cannot get property "webServer" without inject`.
 *
 * The manager now registers its own authenticated route on the injected
 * `webServer` (see `src/host/rpc-route.ts`).  This test mounts the REAL
 * `@deepseek-ai/dsh-client-connection` plugin plus the Host entry on a real
 * Cordis Context using the profile topology — `webServer` provided by a sibling
 * fiber — so a regression toward a caller-invisible service fails here instead
 * of at `dsh web` startup.
 */

import { Context } from '@deepseek-ai/cordis'
import { apply as connectionApply, inject as connectionInject } from '@deepseek-ai/dsh-client-connection'
import type { WebRoute, WebServer, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it } from 'vitest'
import { apply as hostApply, inject as hostInject, name as hostName } from '../src/host/index.ts'
import { MANAGER_NAMESPACE, defaultDocument } from '../src/settings.ts'
import { MCP_MANAGER_CHANNEL } from '../src/types.ts'

/** Mutable credential-record double: BrowserAuth.create() only needs these three. */
class RecordCredentials {
  private record: unknown
  readRecord(): Promise<unknown> {
    return Promise.resolve(this.record)
  }

  async modifyRecord(
    _key: unknown,
    mutate: (current: unknown) => Promise<unknown>,
  ): Promise<unknown> {
    const next = await mutate(this.record)
    if (next !== undefined) this.record = next
    return this.record
  }

  deleteRecord(): Promise<void> {
    this.record = undefined
    return Promise.resolve()
  }
}

/** Structural webServer double recording the routes the caller fiber claims. */
function fakeWebServer(routes: WebRoute[], upgrades: WebUpgradeRoute[]): WebServer {
  return {
    register(route: WebRoute) {
      if (routes.some(candidate => candidate.path === route.path)) {
        throw new Error(`duplicate route ${route.path}`)
      }
      routes.push(route)
      return () => {
        routes.splice(routes.indexOf(route), 1)
      }
    },
    registerUpgrade(route: WebUpgradeRoute) {
      upgrades.push(route)
      return () => {
        upgrades.splice(upgrades.indexOf(route), 1)
      }
    },
    tapIndex: () => () => {},
    port: 0,
  } as unknown as WebServer
}

/** Minimal SettingsProvider double holding the manager document in memory. */
function fakeSettings(): unknown {
  let document = defaultDocument()
  let revision = 0
  return {
    register: () => ({
      get: () => document,
      watch: () => () => {},
    }),
    describe: () => [{ ns: MANAGER_NAMESPACE, revision }],
    replace: async (_ns: string, next: typeof document) => {
      document = next
      revision += 1
    },
    writable: true,
  }
}

/** Minimal ToolRuntime double: no tools, no guards beyond a disposable no-op. */
function fakeTools(): unknown {
  return {
    guard: () => () => {},
    schemas: () => [],
    restrict: () => () => {},
    get: () => undefined,
  }
}

interface Fixture {
  readonly ctx: Context
  readonly routes: WebRoute[]
  readonly upgrades: WebUpgradeRoute[]
}

/**
 * Build the profile topology: `webServer` is provided by a SIBLING plugin
 * fiber (the profile's webserver entry), never by the root.  Direct property
 * reads resolve through an ancestor-only fiber walk, so a caller without the
 * `webServer` injection cannot see a sibling's service — while injection
 * resolution uses the global isolate store and can.
 */
async function fixture(): Promise<Fixture> {
  const ctx = new Context()
  const routes: WebRoute[] = []
  const upgrades: WebUpgradeRoute[] = []
  ctx.provide('credentials', new RecordCredentials() as never)
  ctx.provide('settings', fakeSettings() as never)
  ctx.provide('tools', fakeTools() as never)
  const webserver = ctx.plugin({
    name: 'fake-webserver-entry',
    apply: (webCtx: Context) => {
      webCtx.provide('webServer', fakeWebServer(routes, upgrades))
    },
  } as never)
  await webserver.await()
  const connection = ctx.plugin({ inject: [...connectionInject], apply: connectionApply } as never)
  await connection.await()
  return { ctx, routes, upgrades }
}

describe('Host entry load path', () => {
  it('keeps the namespace shape and declares webServer', () => {
    expect(hostName).toBe('@junjiangao/dsh-web-mcp-manager')
    expect(typeof hostApply).toBe('function')
    expect(hostInject).toContain('webServer')
    expect(hostInject).toContain('connection')
  })

  it('mounts against the real Connection plugin and claims the manager channel', async () => {
    const { ctx, routes } = await fixture()
    const host = ctx.plugin({ name: hostName, inject: [...hostInject], apply: hostApply } as never)
    await host.await()
    expect(routes.map(route => route.path)).toContain(MCP_MANAGER_CHANNEL)
  })

  it('stays inactive (and claims nothing) without the webServer injection', async () => {
    const { ctx, routes } = await fixture()
    const host = ctx.plugin({
      name: hostName,
      inject: ['settings', 'connection', 'tools'],
      apply: hostApply,
    } as never)
    await Promise.resolve()
    expect(routes.map(route => route.path)).not.toContain(MCP_MANAGER_CHANNEL)
    await host.dispose()
  })
})
