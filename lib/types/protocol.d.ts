/** Runtime validation and redacted projections for the manager RPC. */
import type { ManagedServerView, ManagedToolView, McpScope, SecretInput, ServerPatch, ServerTemplates, SetServerEnabledRequest, ScopeTarget, SnapshotRequest, StoredServer, UpsertServerRequest } from './types.ts';
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function asRecord(value: unknown, message: string): Record<string, unknown>;
export declare function asString(value: unknown, field: string): string;
export declare function asBoolean(value: unknown, field: string): boolean;
export declare function parseSnapshotRequest(value: unknown): SnapshotRequest;
export declare function parseIdRequest(value: unknown): {
    id: string;
} & ScopeTarget;
export declare function parseSetEnabledRequest(value: unknown): SetServerEnabledRequest;
export declare function parseReloadRequest(value: unknown): {
    id: string;
};
export declare function parseUpsertRequest(value: unknown): UpsertServerRequest;
export declare function mergeSecretMap(current: Record<string, string>, patch: Readonly<Record<string, SecretInput>> | undefined): Record<string, string>;
export declare function mergeServerPatch(base: StoredServer | undefined, patch: ServerPatch): StoredServer;
export declare function cloneServer(server: StoredServer): StoredServer;
export declare function redactServer(server: StoredServer, status: ManagedServerView['status'], toolCount: number, error?: string, scope?: McpScope, shadowed?: readonly McpScope[], templates?: ServerTemplates): ManagedServerView;
export declare function serverIdFromToolName(name: string, serverIds?: Iterable<string>): string | undefined;
export declare function projectTool(schema: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
}, disabled: ReadonlySet<string>, serverIds?: Iterable<string>): ManagedToolView | undefined;
//# sourceMappingURL=protocol.d.ts.map