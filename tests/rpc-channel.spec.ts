/**
 * Wire behaviour of the manager's Connection Fetch-route transport.
 *
 * The browser calls `connection.rpc.call('/api', 'mcp-manager/<endpoint>', …)`,
 * which POSTs `{ type: 'client-request', rpcId, method, payload }` to
 * `/api/mcp-manager/<endpoint>` and expects
 * `{ type: 'server-response', rpcId, result }` back. The Host/Origin fence and
 * browser authentication belong to the physical `/api` route the Connection
 * plugin mounts (see `tests/host-load.spec.ts` for that integration), so this
 * suite drives `registerManagerRpcRoute` on a real Cordis Context with a
 * structural `connection.fetch` double and covers what the module itself owns:
 * route registration, the body ceiling, envelope validation, and the answer
 * shapes.
 */

import { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { describe, expect, it, vi } from 'vitest'
import { MAX_REQUEST_BODY_BYTES, registerManagerRpcRoute, type ManagerRpcDispatch } from '../src/host/rpc-channel.ts'
import { MCP_MANAGER_ENDPOINTS, mcpManagerRoutePath } from '../src/types.ts'

interface Mounted {
  readonly routes: Map<string, ConnectionFetchRoute>
  readonly dispatch: ReturnType<typeof vi.fn>
  readonly dispose: () => Promise<void>
}

async function mount(implementation?: ManagerRpcDispatch): Promise<Mounted> {
  const ctx = new Context()
  const routes = new Map<string, ConnectionFetchRoute>()
  const dispatch = vi.fn(implementation ?? (async () => ({ ok: true as const, value: { pong: true } })))
  ctx.provide('connection', {
    fetch: {
      register(route: ConnectionFetchRoute) {
        if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
        routes.set(route.path, route)
        return () => {
          routes.delete(route.path)
        }
      },
    },
  } as never)
  const fiber = ctx.plugin({
    name: 'manager-rpc-probe',
    inject: ['connection'],
    apply: (c: Context) => {
      const dispose = registerManagerRpcRoute(c as never, dispatch)
      c.effect(() => dispose, 'probe: manager routes')
    },
  } as never)
  await fiber.await()
  return { routes, dispatch, dispose: async () => { await fiber.dispose() } }
}

/** Send one envelope the way the browser connection client does. */
function request(
  endpoint: string,
  payload: unknown,
  override: { body?: string; contentType?: string | null; headers?: Record<string, string> } = {},
): Request {
  const headers: Record<string, string> = { ...override.headers }
  const contentType = override.contentType === undefined ? 'application/json' : override.contentType
  if (contentType !== null) headers['content-type'] = contentType
  return new Request(`http://dsh.internal${mcpManagerRoutePath(endpoint as never)}`, {
    method: 'POST',
    headers,
    body: override.body ?? JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method: endpoint, payload }),
  })
}

describe('manager RPC channel', () => {
  it('registers one exact POST route per endpoint on the shared api channel', async () => {
    const { routes, dispose } = await mount()
    expect([...routes.keys()].sort()).toEqual(
      MCP_MANAGER_ENDPOINTS.map(endpoint => mcpManagerRoutePath(endpoint)).sort(),
    )
    for (const route of routes.values()) {
      expect(route.path.startsWith('/api/mcp-manager/')).toBe(true)
      expect(route.methods).toEqual(['POST'])
      expect(route.requestBody).toBe('buffered')
    }
    // Routes are owned by the plugin fiber, so unloading releases every one.
    await dispose()
    expect(routes.size).toBe(0)
  })

  it('dispatches a POST and echoes the browser envelope', async () => {
    const { routes, dispatch } = await mount()
    const response = await routes.get(mcpManagerRoutePath('snapshot'))!.fetch(request('snapshot', {}))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(dispatch).toHaveBeenCalledWith('snapshot', {}, expect.any(AbortSignal))
    expect(await response.json()).toEqual({
      type: 'server-response',
      rpcId: 'rpc-1',
      result: { ok: true, value: { pong: true } },
    })
  })

  it('normalises a failure result into the browser failure shape', async () => {
    const { routes } = await mount(async endpoint => ({
      ok: false as const,
      error: { code: 'not-found', message: String(endpoint), details: undefined as never },
    }))
    const response = await routes.get(mcpManagerRoutePath('removeServer'))!.fetch(
      new Request(`http://dsh.internal${mcpManagerRoutePath('removeServer')}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method: 'removeServer', payload: { id: 'x' } }),
      }),
    )
    expect(response.status).toBe(200)
    expect((await response.json() as { result: unknown }).result).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'removeServer', details: {} },
    })
  })

  it('turns a throwing dispatch into an internal failure result', async () => {
    const { routes } = await mount(async () => { throw new Error('boom') })
    const response = await routes.get(mcpManagerRoutePath('snapshot'))!.fetch(request('snapshot', {}))
    expect(response.status).toBe(200)
    expect((await response.json() as { result: unknown }).result).toEqual({
      ok: false,
      error: { code: 'internal', message: 'boom', details: {} },
    })
  })

  it('rejects a non-JSON content type before reading the body', async () => {
    const { routes, dispatch } = await mount()
    const response = await routes.get(mcpManagerRoutePath('snapshot'))!.fetch(
      request('snapshot', {}, { contentType: 'text/plain' }),
    )
    expect(response.status).toBe(415)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON and malformed envelopes', async () => {
    const { routes, dispatch } = await mount()
    const route = routes.get(mcpManagerRoutePath('snapshot'))!
    for (const body of [
      '{not json',
      JSON.stringify({ type: 'server-response', rpcId: 'x' }),
      JSON.stringify({ type: 'client-request' }),
      JSON.stringify({ type: 'client-request', rpcId: '' }),
      JSON.stringify(['not', 'an', 'envelope']),
    ]) {
      const response = await route.fetch(request('snapshot', {}, { body }))
      expect(response.status).toBe(400)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('enforces its own body ceiling on both the declared and the decoded length', async () => {
    const { routes, dispatch } = await mount()
    const route = routes.get(mcpManagerRoutePath('snapshot'))!

    const declared = await route.fetch(request('snapshot', {}, { headers: { 'content-length': String(MAX_REQUEST_BODY_BYTES + 1) } }))
    expect(declared.status).toBe(413)

    const oversized = 'x'.repeat(MAX_REQUEST_BODY_BYTES + 1)
    const decoded = await route.fetch(request('snapshot', {}, {
      body: JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method: 'snapshot', payload: oversized }),
    }))
    expect(decoded.status).toBe(413)

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('passes the request abort signal through to the dispatch', async () => {
    const controller = new AbortController()
    let seen: AbortSignal | undefined
    const { routes } = await mount(async (_endpoint, _payload, signal) => {
      seen = signal
      return { ok: true as const, value: null }
    })
    await routes.get(mcpManagerRoutePath('snapshot'))!.fetch(
      new Request(`http://dsh.internal${mcpManagerRoutePath('snapshot')}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method: 'snapshot', payload: {} }),
        signal: controller.signal,
      }),
    )
    expect(seen).toBeInstanceOf(AbortSignal)
  })
})
