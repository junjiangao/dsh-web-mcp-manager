/** Host entry for the Web MCP manager plugin. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import { McpManagerController } from './controller.ts'
import type { ManagerSettings } from '../settings.ts'

export const name = '@junjiangao/dsh-web-mcp-manager'

/**
 * The Loader entry's config schema. dsh 0.2 renders this on the settings page
 * and hands the resolved refs to {@link apply}; the manager writes back through
 * `ctx.settings.replace()` against the same entry id.
 */
export { Config } from '../settings.ts'
/**
 * `connection` is a hard dependency: the manager registers one exact Fetch
 * route per endpoint through `ctx.connection.fetch.register()`, which rides the
 * Connection service's own authenticated `/api` route (see `./rpc-channel.ts`).
 * The physical carrier applies the Host/Origin fence and browser
 * authentication, so this plugin needs no `webServer` injection and owns no
 * HTTP route — `connection.rpc.handle()` remains unusable because it resolves
 * `owner.webServer` from the Connection service's fiber rather than the
 * caller's, and `connection.rpc.intercept('/api', …)` is owned by
 * `@deepseek-ai/dsh-api-gateway`.
 */
export const inject = ['settings', 'connection', 'tools']

/**
 * Start the controller on the Host Cordis fiber.
 * @param ctx - the Host plugin context.
 * @param config - the entry's resolved volatile refs.
 */
export async function apply(ctx: Context, config: ManagerSettings): Promise<void> {
  const controller = new McpManagerController(ctx as ConstructorParameters<typeof McpManagerController>[0], config)
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
