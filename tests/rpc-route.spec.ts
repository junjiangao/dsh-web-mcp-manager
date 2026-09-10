/**
 * Wire behaviour of the manager's self-owned RPC route.
 *
 * The browser calls `connection.rpc.call(channel, endpoint, payload, signal)`,
 * which POSTs `{ type: 'client-request', rpcId, method, payload }` to
 * `<channel>/<endpoint>` and expects
 * `{ type: 'server-response', rpcId, result }` back.  This test drives the real
 * `registerManagerRpcRoute` on a real Cordis Context with a fake webServer,
 * covering the fence, the envelope validation, and the failure shapes.
 */

import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it, vi } from 'vitest'
import { registerManagerRpcRoute, type ManagerRpcDispatch } from '../src/host/rpc-route.ts'
import { MCP_MANAGER_CHANNEL } from '../src/types.ts'

/** Bodyless or JSON-bodied node:http request double. */
function fakeRequest(method: string, url: string, body?: string): IncomingMessage {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(body)]) as unknown as IncomingMessage
  Object.assign(request, { method, url, headers: { 'content-type': 'application/json' } })
  return request
}

/** Response recorder covering the bridge's writeHead/end lifecycle. */
function fakeResponse(): {
  response: ServerResponse
  state: { status?: number; headers?: Record<string, unknown>; body?: string }
} {
  const state: { status?: number; headers?: Record<string, unknown>; body?: string } = {}
  const response = Object.assign(new EventEmitter(), {
    writableEnded: false,
    writeHead(value: number, headers?: Record<string, unknown>) {
      state.status = value
      state.headers = headers
      return this
    },
    end(this: { writableEnded: boolean }, value?: unknown) {
      if (typeof value === 'string' || value instanceof Uint8Array) state.body = Buffer.from(value).toString()
      this.writableEnded = true
      return this
    },
  }) as unknown as ServerResponse
  return { response, state }
}

interface Mounted {
  readonly route: WebRoute
  readonly dispatch: ReturnType<typeof vi.fn>
  readonly rejection: ReturnType<typeof vi.fn>
  readonly requestRejection: (request: unknown) => 401 | 403 | undefined
}

async function mount(
  rejection: 401 | 403 | undefined = undefined,
  implementation?: ManagerRpcDispatch,
): Promise<Mounted> {
  const ctx = new Context()
  const routes: WebRoute[] = []
  const dispatch = vi.fn(implementation ?? (async () => ({ ok: true as const, value: { pong: true } })))
  const requestRejection = vi.fn(() => rejection)
  ctx.provide('webServer', {
    register(route: WebRoute) {
      routes.push(route)
      return () => {
        routes.splice(routes.indexOf(route), 1)
      }
    },
  } as never)
  ctx.provide('connection', { requestRejection } as never)
  const fiber = ctx.plugin({
    name: 'manager-rpc-probe',
    inject: ['webServer', 'connection'],
    apply: (c: Context) => {
      registerManagerRpcRoute(c as never, MCP_MANAGER_CHANNEL, dispatch)
    },
  } as never)
  await fiber.await()
  const route = routes[0]
  if (route === undefined) throw new Error('manager RPC route was not registered')
  return { route, dispatch, rejection: requestRejection, requestRejection: requestRejection as never }
}

/** Send one envelope the way the browser connection client does. */
function envelope(endpoint: string, payload: unknown, rpcId = 'rpc-1'): string {
  return JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload })
}

describe('manager RPC route', () => {
  it('dispatches a POST and echoes the browser envelope', async () => {
    const { route, dispatch } = await mount()
    const { response, state } = fakeResponse()
    await route.handler(fakeRequest('POST', `${MCP_MANAGER_CHANNEL}/snapshot`, envelope('snapshot', {})), response)
    expect(state.status).toBe(200)
    expect(dispatch).toHaveBeenCalledWith('snapshot', {}, expect.any(AbortSignal))
    expect(JSON.parse(state.body as string)).toEqual({
      type: 'server-response',
      rpcId: 'rpc-1',
      result: { ok: true, value: { pong: true } },
    })
  })

  it('passes payload and signal through and normalises failure results', async () => {
    const { route } = await mount(undefined, async (endpoint, payload) => ({
      ok: false as const,
      error: { code: 'not-found', message: String(endpoint), details: undefined as never },
    }))
    const { response, state } = fakeResponse()
    await route.handler(fakeRequest('POST', `${MCP_MANAGER_CHANNEL}/removeServer`, envelope('removeServer', { id: 'x' })), response)
    expect(JSON.parse(state.body as string).result).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'removeServer', details: {} },
    })
  })

  it('rejects non-POST methods before dispatch', async () => {
    const { route, dispatch } = await mount()
    const { response, state } = fakeResponse()
    await route.handler(fakeRequest('GET', `${MCP_MANAGER_CHANNEL}/snapshot`), response)
    expect(state.status).toBe(405)
    expect(state.headers).toMatchObject({ allow: 'POST' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated requests before dispatch', async () => {
    const { route, dispatch } = await mount(401)
    const { response, state } = fakeResponse()
    await route.handler(fakeRequest('POST', `${MCP_MANAGER_CHANNEL}/snapshot`, envelope('snapshot', {})), response)
    expect(state.status).toBe(401)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('rejects malformed bodies and envelopes', async () => {
    const { route, dispatch } = await mount()
    for (const body of ['{not json', JSON.stringify({ type: 'server-response', rpcId: 'x' }), JSON.stringify({ type: 'client-request' })]) {
      const { response, state } = fakeResponse()
      await route.handler(fakeRequest('POST', `${MCP_MANAGER_CHANNEL}/snapshot`, body), response)
      expect(state.status).toBe(400)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('rejects paths outside the channel endpoint grammar', async () => {
    const { route, dispatch } = await mount()
    for (const url of [`${MCP_MANAGER_CHANNEL}/`, `${MCP_MANAGER_CHANNEL}/a//b`, `${MCP_MANAGER_CHANNEL}x/snapshot`]) {
      const { response, state } = fakeResponse()
      await route.handler(fakeRequest('POST', url, envelope('snapshot', {})), response)
      expect(state.status).toBe(404)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('turns a throwing dispatch into an internal failure result', async () => {
    const { route } = await mount(undefined, async () => { throw new Error('boom') })
    const { response, state } = fakeResponse()
    await route.handler(fakeRequest('POST', `${MCP_MANAGER_CHANNEL}/snapshot`, envelope('snapshot', {})), response)
    expect(state.status).toBe(200)
    expect(JSON.parse(state.body as string).result).toEqual({
      ok: false,
      error: { code: 'internal', message: 'boom', details: {} },
    })
  })
})
