/**
 * Real-load-path guard for the Host entry.
 *
 * The manager rides the Connection service's own `/api` carrier. It cannot use
 * `connection.rpc.handle()`: that mounts its physical route with
 * `owner.webServer.register()` where `owner` is the *Connection* service's
 * Context — not the caller's (the Cordis traceable shadow's origin is the
 * service Context, so the fiber walk starts at the Connection fiber). In the
 * shipped Web profile `webServer` is provided by a SIBLING loader entry, that
 * walk reached the root, and the whole profile died at load time with
 * `cannot get property "webServer" without inject`. It cannot use
 * `connection.rpc.intercept('/api', …)` either: the shared channel admits one
 * interceptor and `@deepseek-ai/dsh-api-gateway` already owns it.
 *
 * The manager therefore registers one exact Fetch route per endpoint through
 * `ctx.connection.fetch.register()` (see `src/host/rpc-channel.ts`). This test
 * mounts the REAL `@deepseek-ai/dsh-client-connection` plugin plus the Host
 * entry on a real Cordis Context using the profile topology — `webServer`
 * provided by a sibling fiber, and NOT injected into the Host entry — and then
 * dispatches a real request through the Connection service's own shared fetch
 * handler, so a regression toward a caller-invisible service, or a lost route,
 * fails here instead of at `dsh web` startup.
 */

import { Context } from '@deepseek-ai/cordis'
import { apply as connectionApply, inject as connectionInject, type HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { WebRoute, WebServer, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it } from 'vitest'
import { apply as hostApply, inject as hostInject, name as hostName } from '../src/host/index.ts'
import { Config, MANAGER_NAMESPACE, defaultDocument } from '../src/settings.ts'
import { MCP_MANAGER_ENDPOINTS, mcpManagerRoutePath } from '../src/types.ts'

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

/** Minimal settings double holding the manager document in memory. */
function fakeSettings(): unknown {
  let document = defaultDocument()
  let revision = 0
  return {
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
  it('keeps the namespace shape and no longer requires webServer', () => {
    expect(hostName).toBe('@junjiangao/dsh-web-mcp-manager')
    expect(typeof hostApply).toBe('function')
    expect(hostInject).toContain('connection')
    expect(hostInject).not.toContain('webServer')
  })

  it('mounts against the real Connection plugin and answers on its shared api channel', async () => {
    const { ctx, routes } = await fixture()
    const host = ctx.plugin({ name: hostName, inject: [...hostInject], Config, apply: hostApply } as never)
    await host.await()

    // The manager owns no physical route of its own: Connection keeps `/api`.
    expect(routes.map(route => route.path).filter(path => path.startsWith('/mcp-manager'))).toEqual([])

    // Every endpoint answers through Connection's own exact-route dispatch.
    const handler = (ctx.get('connection') as HostConnectionHandle).createSharedFetchHandler('/api')
    for (const endpoint of MCP_MANAGER_ENDPOINTS) {
      const response = await handler.fetch(new Request(`http://dsh.internal${mcpManagerRoutePath(endpoint)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method: endpoint, payload: {} }),
      }))
      expect(response.status, `${endpoint} should answer through the shared channel`).toBe(200)
      const body = await response.json() as { type: string; rpcId: string }
      expect(body.type).toBe('server-response')
      expect(body.rpcId).toBe('rpc-1')
    }

    await host.dispose()
  })

  it('leaves paths and methods it does not own to the shared channel', async () => {
    const { ctx } = await fixture()
    const host = ctx.plugin({ name: hostName, inject: [...hostInject], Config, apply: hostApply } as never)
    await host.await()
    const handler = (ctx.get('connection') as HostConnectionHandle).createSharedFetchHandler('/api')

    const unknownEndpoint = await handler.fetch(new Request('http://dsh.internal/api/mcp-manager/notAnEndpoint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }))
    expect(unknownEndpoint.status).toBe(404)

    const wrongMethod = await handler.fetch(new Request(`http://dsh.internal${mcpManagerRoutePath('snapshot')}`, { method: 'GET' }))
    expect(wrongMethod.status).toBe(404)

    await host.dispose()
  })
})
