// @vitest-environment jsdom

import * as React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ManagedServerView, Snapshot } from '../src/types.ts'
import { McpSection, type McpSectionProps } from '../src/client/McpSection.tsx'
import type { ManagerClientApi } from '../src/client/api.ts'
import type { EntryFormFace } from '../src/client/entry-form.ts'

function view(overrides: Partial<ManagedServerView> = {}): ManagedServerView {
  return {
    id: 'demo',
    label: 'Demo',
    enabled: true,
    transport: 'stdio',
    command: 'node',
    args: [],
    cwd: '',
    url: '',
    env: {},
    headers: {},
    toolCallTimeoutMs: 60_000,
    reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
    status: 'loaded',
    toolCount: 0,
    scope: 'profile',
    shadowed: [],
    templates: { env: [], headers: [] },
    ...overrides,
  }
}

function snapshot(servers: ManagedServerView[] = [], tools: Snapshot['tools'] = []): Snapshot {
  return { writable: true, servers, tools, readonlyEntries: [], sources: [], workspaces: [] }
}

function makeApi(): ManagerClientApi {
  return {
    snapshot: vi.fn(),
    upsertServer: vi.fn(),
    removeServer: vi.fn(),
    setServerEnabled: vi.fn(),
    reloadServer: vi.fn(),
  } as unknown as ManagerClientApi
}

let api: ManagerClientApi
let entry: EntryFormFace

const t = ((key: string) => key) as unknown as McpSectionProps['t']

/**
 * The panel's two write layers are injected separately: its own RPC and the
 * official shared settings form. The form's view object is created once so
 * `useSyncExternalStore` sees a stable reference, exactly as the real form's
 * `getSnapshot()` contract promises.
 */
function renderPanel(): { container: HTMLElement } {
  const panelEntryView = { available: true, writable: true }
  entry = {
    snapshot: () => panelEntryView,
    subscribe: () => () => {},
    upsert: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    setEnabled: vi.fn(async () => true),
    setDisabledTools: vi.fn(async () => true),
  }
  return render(<McpSection api={api} entry={entry} t={t} />)
}

async function openEditor(server = view()): Promise<{ container: HTMLElement }> {
  api.snapshot.mockResolvedValue(snapshot([server]))
  const rendered = renderPanel()
  await waitFor(() => expect(screen.getByText('edit')).toBeTruthy())
  fireEvent.click(screen.getByText('edit'))
  await waitFor(() => expect(rendered.container.querySelector('form')).not.toBeNull())
  return rendered
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('McpSection conflict-safe editing', () => {
  it('writes an mcp.json scope through the manager RPC', async () => {
    api = makeApi()
    await openEditor()
    fireEvent.change(screen.getByLabelText('label'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(api.upsertServer).toHaveBeenCalled())
    const request = (api.upsertServer as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(request.server.label).toBe('Renamed')
    // The entry layer is not this channel's business any more.
    expect(entry.upsert).not.toHaveBeenCalled()
  })

  it('writes an entry-scope definition through the official settings form', async () => {
    api = makeApi()
    api.snapshot.mockResolvedValue(snapshot([view({ scope: 'entry' })]))
    const { container } = renderPanel()
    await waitFor(() => expect(screen.getByText('edit')).toBeTruthy())
    fireEvent.click(screen.getByText('edit'))
    await waitFor(() => expect(container.querySelector('form')).not.toBeNull())
    expect((container.querySelector('[data-mcp-scope-select]') as HTMLSelectElement).value).toBe('entry')
    fireEvent.change(screen.getByLabelText('label'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(entry.upsert).toHaveBeenCalled())
    const patch = (entry.upsert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(patch.label).toBe('Renamed')
    expect(api.upsertServer).not.toHaveBeenCalled()
  })

  it('reports a refused official-form write and keeps the draft for rebase', async () => {
    api = makeApi()
    api.snapshot.mockResolvedValue(snapshot([view({ scope: 'entry' })]))
    const { container } = renderPanel()
    const refused = entry.upsert as ReturnType<typeof vi.fn>
    await waitFor(() => expect(screen.getByText('edit')).toBeTruthy())
    fireEvent.click(screen.getByText('edit'))
    await waitFor(() => expect(container.querySelector('form')).not.toBeNull())
    // A refusal means the Host did not accept the staged revision; the form has
    // already reloaded its own state, and the draft stays for the user to rebase.
    refused.mockResolvedValue(false)
    fireEvent.change(screen.getByLabelText('label'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(screen.getByText('conflict')).toBeTruthy())
    expect(screen.getByText('rebase')).toBeTruthy()
    expect(container.querySelector('form')).not.toBeNull()
    // 下一次轮询成功不应清除操作消息
    const poll = setInterval(() => {}, 50)
    clearInterval(poll)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(screen.getByText('conflict')).toBeTruthy()
  })

  it('emits { clear: true } for env rows removed from the draft', async () => {
    api = makeApi()
    api.snapshot.mockResolvedValue(snapshot([view({ env: { TOKEN: { set: true, sensitive: false } } })]))
    ;(api.upsertServer as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot([]))
    const { container } = await openEditor(view({ env: { TOKEN: { set: true, sensitive: false } } }))
    const form = container.querySelector('form') as HTMLElement
    fireEvent.click(within(form).getAllByText('remove')[0] as Element)
    fireEvent.click(within(form).getByText('save'))
    await waitFor(() => expect(api.upsertServer).toHaveBeenCalled())
    const request = (api.upsertServer as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(request.server.env.TOKEN).toEqual({ clear: true })
  })

  it('keeps the key input mounted and focused while typing (stable row identity)', async () => {
    api = makeApi()
    await openEditor(view({ env: { TOKEN: { set: true, sensitive: false } } }))
    const keyInput = screen.getByDisplayValue('TOKEN') as HTMLInputElement
    keyInput.focus()
    expect(document.activeElement).toBe(keyInput)
    fireEvent.change(keyInput, { target: { value: 'TOKENX' } })
    expect(keyInput.value).toBe('TOKENX')
    // 稳定行 ID:键名变化不重挂载,焦点不丢
    expect(document.activeElement).toBe(keyInput)
  })

  it('discards a stale poll response that arrives after a newer snapshot', async () => {
    api = makeApi()
    let resolvePoll!: (value: Snapshot) => void
    const pollPromise = new Promise<Snapshot>(resolve => { resolvePoll = resolve })
    ;(api.snapshot as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(snapshot([view({ label: 'OLD' })]))
      .mockImplementationOnce(() => pollPromise)
      .mockResolvedValueOnce(snapshot([view({ label: 'NEW' })]))
    renderPanel()
    await waitFor(() => expect(screen.getByText('OLD')).toBeTruthy())
    // 第二次轮询(挂起)
    await new Promise(resolve => setTimeout(resolve, 2_100))
    // 手动刷新 → 更新快照
    fireEvent.click(screen.getByText('refresh'))
    await waitFor(() => expect(screen.getByText('NEW')).toBeTruthy())
    // 迟到的旧轮询响应到达,应被丢弃
    await act(async () => { resolvePoll(snapshot([view({ label: 'OLD' })])) })
    expect(screen.queryByText('OLD')).toBeNull()
    expect(screen.getByText('NEW')).toBeTruthy()
  })

  it('labels the lifecycle button with the action instead of the current state', async () => {
    api = makeApi()
    api.snapshot.mockResolvedValue(snapshot([view({ enabled: true, status: 'loaded' })]))
    const running = renderPanel()
    await waitFor(() => expect(screen.getByText('disable')).toBeTruthy())
    // 状态由徽章表达,按钮只表达动作,避免“已加载 + 已停用”这类自相矛盾的文案
    expect(screen.getByText('loaded')).toBeTruthy()
    expect(screen.queryByText('enabled')).toBeNull()
    running.container.remove()

    api.snapshot.mockResolvedValue(snapshot([view({ enabled: false, status: 'disabled' })]))
    renderPanel()
    await waitFor(() => expect(screen.getByText('enable')).toBeTruthy())
    expect(screen.getByText('disabled')).toBeTruthy()
  })
})

describe('McpSection write routing', () => {
  it('flips an entry-scope server through the settings form, not the RPC', async () => {
    api = makeApi()
    api.snapshot.mockResolvedValue(snapshot([view({ scope: 'entry', enabled: true })]))
    renderPanel()
    await waitFor(() => expect(screen.getByText('disable')).toBeTruthy())
    fireEvent.click(screen.getByText('disable'))
    await waitFor(() => expect(entry.setEnabled).toHaveBeenCalledWith('demo', false))
    expect(api.setServerEnabled).not.toHaveBeenCalled()
  })

  it('flips a file-scope server through the RPC', async () => {
    api = makeApi()
    api.snapshot.mockResolvedValue(snapshot([view({ scope: 'profile', enabled: true })]))
    renderPanel()
    await waitFor(() => expect(screen.getByText('disable')).toBeTruthy())
    fireEvent.click(screen.getByText('disable'))
    await waitFor(() => expect(api.setServerEnabled).toHaveBeenCalled())
    expect(entry.setEnabled).not.toHaveBeenCalled()
  })

  it('routes the per-tool policy through the settings form for every scope', async () => {
    api = makeApi()
    api.snapshot.mockResolvedValue(snapshot(
      [view({ scope: 'profile' })],
      [
        { name: 'mcp__demo__one', serverId: 'demo', description: '', parameters: {}, enabled: true },
        { name: 'mcp__demo__two', serverId: 'demo', description: '', parameters: {}, enabled: false },
      ],
    ))
    renderPanel()
    await waitFor(() => expect(screen.getByText('tools (2)')).toBeTruthy())
    fireEvent.click(screen.getByText('tools (2)'))
    // `disabledTools` lives in the entry document whatever scope the definition
    // came from, so the toggle is an official-form write either way.
    fireEvent.click(screen.getByLabelText(/mcp__demo__one/u))
    await waitFor(() => expect(entry.setDisabledTools).toHaveBeenCalledWith('demo', ['mcp__demo__one', 'mcp__demo__two']))
  })

  it('clears the per-tool policy row after deleting a file-scope definition', async () => {
    api = makeApi()
    api.snapshot.mockResolvedValue(snapshot([view({ scope: 'profile' })]))
    ;(api.removeServer as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot([]))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPanel()
    await waitFor(() => expect(screen.getByText('remove')).toBeTruthy())
    fireEvent.click(screen.getByText('remove'))
    await waitFor(() => expect(api.removeServer).toHaveBeenCalled())
    await waitFor(() => expect(entry.setDisabledTools).toHaveBeenCalledWith('demo', undefined))
  })
})

describe('McpSection multi-scope surfaces', () => {
  it('badges the winning scope, marks shadowed definitions, and offers a migration', async () => {
    api = makeApi()
    api.snapshot.mockResolvedValue({
      ...snapshot([view({ scope: 'entry', shadowed: ['user'] })]),
      sources: [
        { scope: 'profile', path: '/home/profiles/web/mcp.json', writable: true, compat: false, exists: true, serverCount: 0 },
        { scope: 'entry', path: 'cordis.patch.yml · web-mcp-manager', writable: true, compat: false, exists: true, serverCount: 1 },
      ],
    })
    const { container } = renderPanel()
    await waitFor(() => expect(screen.getByText('edit')).toBeTruthy())
    expect(container.querySelector('[data-mcp-scope="entry"]')).not.toBeNull()
    expect(container.querySelector('[data-mcp-shadowed="user"]')).not.toBeNull()
    // The source rows carry path, state, and per-entry problems.
    expect(container.querySelector('[data-mcp-source="profile"]')).not.toBeNull()
    expect(screen.getByText('/home/profiles/web/mcp.json')).toBeTruthy()
    fireEvent.click(screen.getByText('migrate'))
    await waitFor(() => expect(api.upsertServer).toHaveBeenCalled())
    const request = (api.upsertServer as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(request.scope).toBe('profile')
  })

  it('roots the project scope at the selected workspace and sends it with every request', async () => {
    api = makeApi()
    api.snapshot.mockResolvedValue({
      ...snapshot([]),
      workspaces: [{ id: 'w1', path: '/repo/one', title: 'one' }],
    })
    const { container } = renderPanel()
    await waitFor(() => expect(container.querySelector('[data-mcp-project]')).not.toBeNull())
    fireEvent.change(container.querySelector('[data-mcp-project]') as HTMLSelectElement, { target: { value: '/repo/one' } })
    await waitFor(() => {
      const calls = (api.snapshot as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some(call => (call[0] as { projectPath?: string }).projectPath === '/repo/one')).toBe(true)
    })
    // A new server defaults to the project scope once a workspace is selected.
    fireEvent.click(screen.getByText('add'))
    await waitFor(() => expect(container.querySelector('[data-mcp-scope-select]')).not.toBeNull())
    expect((container.querySelector('[data-mcp-scope-select]') as HTMLSelectElement).value).toBe('project')
  })

  it('keeps a templated secret row read-only instead of rewriting it', async () => {
    api = makeApi()
    const server = view({
      env: { TOKEN: { set: true, sensitive: false } },
      templates: { env: ['TOKEN'], headers: [] },
    })
    api.snapshot.mockResolvedValue(snapshot([server]))
    const { container } = renderPanel()
    await waitFor(() => expect(screen.getByText('edit')).toBeTruthy())
    fireEvent.click(screen.getByText('edit'))
    await waitFor(() => expect(container.querySelector('form')).not.toBeNull())
    expect(container.querySelector('[data-mcp-template="TOKEN"]')).not.toBeNull()
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(api.upsertServer).toHaveBeenCalled())
    const request = (api.upsertServer as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { server: { env: Record<string, unknown> } }
    // No clear, no value: the template in the file stays untouched.
    expect(request.server.env.TOKEN).toBeUndefined()
  })
})
