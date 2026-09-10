/**
 * Host HTTP transport for the manager RPC channel.
 *
 * The manager deliberately does NOT call `connection.rpc.handle()`.  That API
 * mounts its physical route with `owner.effect(() => owner.webServer.register(route))`,
 * where `owner` is `this.ctx` read inside the Connection service getter.  The
 * Cordis traceable proxy rebinds `this.ctx` to an extension of the caller, but
 * the resulting shadow's origin is the *service* Context, so `owner.webServer`
 * walks the fiber tree from the Connection fiber — not from the caller fiber.
 * In the shipped Web profile `webServer` is provided by a sibling loader entry,
 * that walk reaches the root, and the whole profile dies at load time with
 * `cannot get property "webServer" without inject`.
 *
 * Registering directly on the injected `webServer` is what the shipped Web
 * plugins do (frontend-static, open-in-app, the Gateway upgrade route).  It keeps
 * the browser-side `connection.rpc.call()` envelope untouched and applies
 * Connection's own Host/Origin + browser-auth fence through
 * `connection.requestRejection()`.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionTrustRequest, ServerResponse as ConnectionServerResponse } from '@deepseek-ai/dsh-client-connection'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { RpcResult } from '../types.ts'

/** Body cap for one manager RPC request; payloads are settings-sized, never media. */
export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024

/** Endpoint segments accepted on the manager channel (mirrors Connection's rule). */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/u

/** Host services the transport reads; both are declared in the plugin inject set. */
export interface ManagerRpcHost {
  readonly connection: {
    requestRejection(request: ConnectionTrustRequest): 401 | 403 | undefined
  }
  readonly webServer: {
    register(route: WebRoute): () => void
  }
}

/** Decoded-endpoint handler invoked after the fence accepted the request. */
export type ManagerRpcDispatch = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => Promise<RpcResult<unknown>>

/**
 * Register the manager channel as an authenticated prefix route.
 * @param ctx - Host plugin Context carrying `webServer` and `connection`.
 * @param channel - absolute channel prefix, e.g. `/mcp-manager`.
 * @param dispatch - decoded-endpoint handler.
 * @returns disposer removing the route.
 */
export function registerManagerRpcRoute(
  ctx: Context & ManagerRpcHost,
  channel: string,
  dispatch: ManagerRpcDispatch,
): () => Promise<void> {
  const route: WebRoute = {
    kind: 'prefix',
    path: channel,
    handler: (req, res) => handleRequest(ctx, channel, dispatch, req, res),
  }
  const dispose = ctx.effect(() => ctx.webServer.register(route), `web-mcp-manager: ${channel} route`)
  return async () => { await dispose() }
}

async function handleRequest(
  ctx: Context & ManagerRpcHost,
  channel: string,
  dispatch: ManagerRpcDispatch,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' })
    res.end()
    return
  }
  const rejection = ctx.connection.requestRejection(req)
  if (rejection !== undefined) {
    res.writeHead(rejection)
    res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
    return
  }
  const endpoint = endpointFrom(req.url ?? '/', channel)
  if (endpoint === undefined) {
    res.writeHead(404)
    res.end('not found')
    return
  }

  // Mirror Connection's carrier: a client disconnect aborts the handler.
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })

  let envelope: unknown
  try {
    envelope = JSON.parse((await readBody(req)).toString('utf8'))
  } catch (error) {
    respond(res, error instanceof BodyTooLargeError ? 413 : 400)
    return
  }
  const request = parseClientRequest(envelope)
  if (request === undefined) {
    respond(res, 400)
    return
  }

  let result: RpcResult<unknown>
  try {
    result = await dispatch(endpoint, request.payload, abort.signal)
  } catch (error) {
    result = {
      ok: false,
      error: { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} },
    }
  }

  const response: ConnectionServerResponse = {
    type: 'server-response',
    rpcId: request.rpcId as ConnectionServerResponse['rpcId'],
    result: result.ok ? result : { ok: false, error: { ...result.error, details: result.error.details ?? {} } },
  }
  const body = Buffer.from(JSON.stringify(response))
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': String(body.byteLength) })
  res.end(body)
}

class BodyTooLargeError extends Error {}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    received += buffer.byteLength
    if (received > MAX_REQUEST_BODY_BYTES) throw new BodyTooLargeError('request body too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

/** Decode `<channel>/<endpoint...>` and reject anything outside the manager's endpoint grammar. */
function endpointFrom(rawUrl: string, channel: string): string | undefined {
  let pathname: string
  try {
    pathname = new URL(rawUrl, 'http://dsh.internal').pathname
  } catch { return undefined }
  if (!pathname.startsWith(`${channel}/`)) return undefined
  const endpoint = pathname.slice(channel.length + 1)
  const segments = endpoint.split('/')
  if (segments.some(segment => !ENDPOINT_SEGMENT_PATTERN.test(segment))) return undefined
  return endpoint
}

/** Validate the browser envelope `{ type, rpcId, method, payload }` before dispatch. */
function parseClientRequest(value: unknown): { rpcId: string; payload: unknown } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.type !== 'client-request' || typeof record.rpcId !== 'string' || record.rpcId.length === 0) return undefined
  if (record.rpcId.length > 256) return undefined
  return { rpcId: record.rpcId, payload: record.payload }
}

function respond(res: ServerResponse, status: number): void {
  res.writeHead(status)
  res.end()
}
