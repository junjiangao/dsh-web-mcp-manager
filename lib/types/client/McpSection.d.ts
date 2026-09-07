/** Settings → MCP page. It intentionally owns no durable state. */
import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SecretInput } from '../types.ts';
import { type ManagerClientApi } from './api.ts';
export interface McpSectionInjected {
    readonly api: ManagerClientApi;
}
export type McpSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.mcpManager'> & InjectFace<McpSectionInjected>;
export declare function McpSection({ api, t }: McpSectionProps): ReactNode;
export type { SecretInput };
//# sourceMappingURL=McpSection.d.ts.map