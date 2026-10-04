/** Browser entry for Settings → MCP. */
import { en, zh } from "./locales.js";
import { createManagerApi } from "./api.js";
import { createEntryForm } from "./entry-form.js";
import { McpSection } from "./McpSection.js";
export const NS = 'settings.mcpManager';
/**
 * `configForms` is the settings provider's shared form service. The panel
 * writes the Loader-entry scope through it, so the page only renders once that
 * service exists.
 */
export const inject = ['connection', 'slots', 'locale', 'configForms'];
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'web-mcp-manager: dictionaries');
    const t = ctx.locale.bind(NS);
    const api = createManagerApi(ctx);
    const entry = createEntryForm(ctx);
    const injected = () => ({ api, entry });
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