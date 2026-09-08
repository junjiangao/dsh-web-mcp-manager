/**
 * Adapter between the manager's `StoredServer` shape and the
 * `@deepseek-ai/dsh-mcp-client` plugin Config, plus schema-backed validation.
 */
import { type Config as McpServerConfig } from '@deepseek-ai/dsh-mcp-client';
import type { StoredServer } from '../types.ts';
/** Project one stored server into the mcp-client plugin Config. */
export declare function toMcpConfig(server: StoredServer): McpServerConfig;
/** 用 mcp-client 的 Config schema 校验并归一化单服务配置;失败抛带 code 的 Error。 */
export declare function validateMcpConfig(server: StoredServer): StoredServer;
//# sourceMappingURL=mcp-config.d.ts.map