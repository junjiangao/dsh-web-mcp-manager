/** Browser entry for Settings → MCP. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { McpLocaleKey } from './locales.ts'
import { en, zh } from './locales.ts'
import { createManagerApi } from './api.ts'
import { McpSection, type McpSectionInjected } from './McpSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.mcpManager': McpLocaleKey
  }
}

export const NS = 'settings.mcpManager' as const
export const inject = ['connection', 'slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'web-mcp-manager: dictionaries')
  const t = ctx.locale.bind(NS)
  const api = createManagerApi(ctx)
  const injected = (): McpSectionInjected => ({ api })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'mcp',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, McpSection))
}

export { McpSection }
export type { McpSectionInjected, McpSectionProps } from './McpSection.tsx'
