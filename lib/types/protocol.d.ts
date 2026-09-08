/** Runtime validation and redacted projections for the manager RPC. */
import type { ManagedServerView, ManagedToolView, SecretInput, ServerPatch, StoredServer } from './types.ts';
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function asRecord(value: unknown, message: string): Record<string, unknown>;
export declare function asString(value: unknown, field: string): string;
export declare function asBoolean(value: unknown, field: string): boolean;
export declare function asRevision(value: unknown, field?: string): number;
export declare function asOptionalRevision(value: unknown): number | undefined;
export declare function parseSnapshotRequest(value: unknown): {
    expectedRevision?: number;
};
export declare function parseIdRequest(value: unknown): {
    id: string;
    expectedRevision?: number;
};
export declare function parseSetEnabledRequest(value: unknown): {
    id: string;
    enabled: boolean;
    expectedRevision: number;
};
export declare function parseReloadRequest(value: unknown): {
    id: string;
};
export declare function parseUpsertRequest(value: unknown): {
    server: ServerPatch;
    expectedRevision: number;
};
export declare function parseToolRequest(value: unknown): {
    serverId: string;
    name: string;
    enabled: boolean;
    expectedRevision: number;
};
export declare function mergeSecretMap(current: Record<string, string>, patch: Readonly<Record<string, SecretInput>> | undefined): Record<string, string>;
export declare function mergeServerPatch(base: StoredServer | undefined, patch: ServerPatch): StoredServer;
export declare function cloneServer(server: StoredServer): StoredServer;
export declare function redactServer(server: StoredServer, status: ManagedServerView['status'], toolCount: number, error?: string): ManagedServerView;
export declare function serverIdFromToolName(name: string, serverIds?: Iterable<string>): string | undefined;
export declare function projectTool(schema: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
}, disabled: ReadonlySet<string>, serverIds?: Iterable<string>): ManagedToolView | undefined;
//# sourceMappingURL=protocol.d.ts.map