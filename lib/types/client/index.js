/** Browser entry for Settings → MCP. */
import { en, zh } from "./locales.js";
import { createManagerApi } from "./api.js";
import { McpSection } from "./McpSection.js";
export const NS = 'settings.mcpManager';
export const inject = ['connection', 'slots', 'locale'];
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'web-mcp-manager: dictionaries');
    const t = ctx.locale.bind(NS);
    const api = createManagerApi(ctx);
    const injected = () => ({ api });
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'mcp',
        order: 20,
        label: () => t('nav'),
        locale: NS,
        inject: injected,
    }, McpSection));
}
export { McpSection };
//# sourceMappingURL=index.js.map