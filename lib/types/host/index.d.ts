/** Host entry for the Web MCP manager plugin. */
import type { Context } from '@deepseek-ai/cordis';
import { McpManagerController } from './controller.ts';
export declare const name = "@junjiangao/dsh-web-mcp-manager";
export declare const inject: string[];
/** Start the controller on the Host Cordis fiber. */
export declare function apply(ctx: Context): Promise<void>;
export { McpManagerController };
//# sourceMappingURL=index.d.ts.map