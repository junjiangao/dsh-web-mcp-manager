/** Host entry for the Web MCP manager plugin. */
import type { Context } from '@deepseek-ai/cordis';
import { McpManagerController } from './controller.ts';
import type { ManagerSettings } from '../settings.ts';
export declare const name = "@junjiangao/dsh-web-mcp-manager";
/**
 * The Loader entry's config schema. dsh 0.2 renders this on the settings page
 * and hands the resolved refs to {@link apply}; the manager writes back through
 * `ctx.settings.replace()` against the same entry id.
 */
export { Config } from '../settings.ts';
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
export declare const inject: string[];
/**
 * Start the controller on the Host Cordis fiber.
 * @param ctx - the Host plugin context.
 * @param config - the entry's resolved volatile refs.
 */
export declare function apply(ctx: Context, config: ManagerSettings): Promise<void>;
export { McpManagerController };
//# sourceMappingURL=index.d.ts.map