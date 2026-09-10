/** Host entry for the Web MCP manager plugin. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import { McpManagerController } from './controller.ts'

export const name = '@junjiangao/dsh-web-mcp-manager'
/**
 * `webServer` is a hard dependency: the manager registers its own authenticated
 * RPC route on it (see `./rpc-route.ts`).  `connection.rpc.handle()` cannot be
 * used here because it resolves `owner.webServer` from the *Connection* fiber
 * rather than the caller fiber, which fails at load time in the shipped Web
 * profile with `cannot get property "webServer" without inject`.
 */
export const inject = ['webServer', 'settings', 'connection', 'tools']

/** Start the controller on the Host Cordis fiber. */
export async function apply(ctx: Context): Promise<void> {
  const controller = new McpManagerController(ctx as ConstructorParameters<typeof McpManagerController>[0])
  try {
    await controller.start()
  } catch (error) {
    // `start()` registers an RPC route before the initial reconciliation.  If
    // startup fails, make that route and any partially mounted MCP fibers
    // disappear before letting Cordis roll back the plugin fiber.
    await controller.dispose()
    throw error
  }
  ctx.effect(() => async () => { await controller.dispose() }, 'web-mcp-manager: dispose')
}

export { McpManagerController }
