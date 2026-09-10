/** Host entry for the Web MCP manager plugin. */
import type { Context } from '@deepseek-ai/cordis';
import { McpManagerController } from './controller.ts';
export declare const name = "@junjiangao/dsh-web-mcp-manager";
/**
 * `webServer` is a hard dependency: the manager registers its own authenticated
 * RPC route on it (see `./rpc-route.ts`).  `connection.rpc.handle()` cannot be
 * used here because it resolves `owner.webServer` from the *Connection* fiber
 * rather than the caller fiber, which fails at load time in the shipped Web
 * profile with `cannot get property "webServer" without inject`.
 */
export declare const inject: string[];
/** Start the controller on the Host Cordis fiber. */
export declare function apply(ctx: Context): Promise<void>;
export { McpManagerController };
//# sourceMappingURL=index.d.ts.map