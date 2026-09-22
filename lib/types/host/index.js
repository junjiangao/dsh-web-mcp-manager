/** Host entry for the Web MCP manager plugin. */
import { McpManagerController } from "./controller.js";
export const name = '@junjiangao/dsh-web-mcp-manager';
/**
 * The Loader entry's config schema. dsh 0.1.7 renders this on the settings
 * page and hands the resolved refs to {@link apply}; the manager writes back
 * through `ctx.settings.replace()` against the same entry id.
 */
export { Config } from "../settings.js";
/**
 * `webServer` is a hard dependency: the manager registers its own authenticated
 * RPC route on it (see `./rpc-route.ts`).  `connection.rpc.handle()` cannot be
 * used here because it resolves `owner.webServer` from the *Connection* fiber
 * rather than the caller fiber, which fails at load time in the shipped Web
 * profile with `cannot get property "webServer" without inject`.
 */
export const inject = ['webServer', 'settings', 'connection', 'tools'];
/**
 * Start the controller on the Host Cordis fiber.
 * @param ctx - the Host plugin context.
 * @param config - the entry's resolved volatile refs.
 */
export async function apply(ctx, config) {
    const controller = new McpManagerController(ctx, config);
    try {
        await controller.start();
    }
    catch (error) {
        // `start()` registers an RPC route before the initial reconciliation.  If
        // startup fails, make that route and any partially mounted MCP fibers
        // disappear before letting Cordis roll back the plugin fiber.
        await controller.dispose();
        throw error;
    }
    ctx.effect(() => async () => { await controller.dispose(); }, 'web-mcp-manager: dispose');
}
export { McpManagerController };
//# sourceMappingURL=index.js.map