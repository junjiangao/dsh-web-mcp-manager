/** Settings → MCP page. It intentionally owns no durable state. */
import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SecretInput } from '../types.ts';
import type { ManagerClientApi } from './api.ts';
import type { EntryFormFace } from './entry-form.ts';
import type { ManagerStore } from './manager-store.ts';
export interface McpSectionInjected {
    /** The manager's own RPC: the `mcp.json` scopes and runtime status. */
    readonly api: ManagerClientApi;
    /** The official shared settings form: the legacy Loader-entry scope. */
    readonly entry: EntryFormFace;
    /** The Host view and the read loop, in the official client store. */
    readonly store: ManagerStore;
}
export type McpSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.mcpManager'> & InjectFace<McpSectionInjected>;
export declare function McpSection({ api, entry, store, t }: McpSectionProps): ReactNode;
export type { SecretInput };
//# sourceMappingURL=McpSection.d.ts.map