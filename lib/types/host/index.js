/** Host entry for the Web MCP manager plugin. */
import { McpManagerController } from "./controller.js";
export const name = '@junjiangao/dsh-web-mcp-manager';
export const inject = ['settings', 'connection', 'tools'];
/** Start the controller on the Host Cordis fiber. */
export async function apply(ctx) {
    const controller = new McpManagerController(ctx);
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