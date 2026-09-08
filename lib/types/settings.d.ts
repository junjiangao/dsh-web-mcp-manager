/** Host settings schema and defaults for the MCP manager namespace. */
import z from '@deepseek-ai/schemastery';
import type { SettingsNamespace as DshSettingsNamespace } from '@deepseek-ai/dsh-settings';
import type { ReconnectPolicy, ServerTransport, SettingsDocument, StoredReconnectPolicy, StoredServer } from './types.ts';
export declare const MANAGER_NAMESPACE: DshSettingsNamespace;
export declare const DEFAULT_RECONNECT: StoredReconnectPolicy;
export declare const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60000;
export declare const ManagerSettingsSchema: z<SettingsDocument>;
export declare function defaultServer(id: string): StoredServer;
export declare function defaultDocument(): SettingsDocument;
export declare function validateStoredDocument(value: SettingsDocument): void;
export declare function validateServerId(id: string): void;
export declare function validateServerConfig(server: StoredServer): void;
export declare function validateReconnect(value: ReconnectPolicy): void;
export declare function transportOf(value: string): ServerTransport;
//# sourceMappingURL=settings.d.ts.map