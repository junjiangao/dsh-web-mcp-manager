/** Browser entry for Settings → MCP. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { McpLocaleKey } from './locales.ts';
import { McpSection } from './McpSection.tsx';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.mcpManager': McpLocaleKey;
    }
}
export declare const NS: "settings.mcpManager";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export { McpSection };
export type { McpSectionInjected, McpSectionProps } from './McpSection.tsx';
//# sourceMappingURL=index.d.ts.map