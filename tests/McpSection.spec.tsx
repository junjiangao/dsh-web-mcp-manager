// @vitest-environment jsdom

import * as React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ManagedServerView, Snapshot } from '../src/types.ts'
import { McpSection, type McpSectionProps } from '../src/client/McpSection.tsx'
import { McpManagerRpcError, type ManagerClientApi } from '../src/client/api.ts'

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
    ...overrides,
  }
}

function snapshot(revision: number, servers: ManagedServerView[] = []): Snapshot {
  return { revision, writable: true, servers, tools: [], readonlyEntries: [] }
}

let api: ManagerClientApi

const t = ((key: string) => key) as unknown as McpSectionProps['t']

function renderPanel(): { container: HTMLElement } {
  return render(<McpSection api={api} t={t} />)
}

async function openEditor(server = view()): Promise<{ container: HTMLElement }> {
  api.snapshot.mockResolvedValue(snapshot(5, [server]))
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
  it('saves with the revision captured when the editor was opened', async () => {
    api = {
      snapshot: vi.fn(),
      upsertServer: vi.fn(),
      removeServer: vi.fn(),
      setServerEnabled: vi.fn(),
      reloadServer: vi.fn(),
      setToolEnabled: vi.fn(),
    } as unknown as ManagerClientApi
    await openEditor()
    fireEvent.change(screen.getByLabelText('label'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(api.upsertServer).toHaveBeenCalled())
    const request = (api.upsertServer as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(request.expectedRevision).toBe(5)
  })

  it('keeps the draft and the conflict message after a conflict, and polling does not clear it', async () => {
    api = {
      snapshot: vi.fn(),
      upsertServer: vi.fn(),
      removeServer: vi.fn(),
      setServerEnabled: vi.fn(),
      reloadServer: vi.fn(),
      setToolEnabled: vi.fn(),
    } as unknown as ManagerClientApi
    api.snapshot.mockResolvedValue(snapshot(5, [view()]))
    ;(api.upsertServer as ReturnType<typeof vi.fn>).mockRejectedValue(
      new McpManagerRpcError({ code: 'conflict', message: 'conflict' }),
    )
    const { container } = renderPanel()
    await waitFor(() => expect(screen.getByText('edit')).toBeTruthy())
    fireEvent.click(screen.getByText('edit'))
    await waitFor(() => expect(container.querySelector('form')).not.toBeNull())
    fireEvent.change(screen.getByLabelText('label'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => expect(screen.getByText('conflict')).toBeTruthy())
    // 草稿保留,提供 rebase 动作
    expect(screen.getByText('rebase')).toBeTruthy()
    expect(container.querySelector('form')).not.toBeNull()
    // 下一次轮询成功不应清除操作消息
    await new Promise(resolve => setTimeout(resolve, 2_100))
    expect(screen.getByText('conflict')).toBeTruthy()
  })

  it('emits { clear: true } for env rows removed from the draft', async () => {
    api = {
      snapshot: vi.fn(),
      upsertServer: vi.fn(),
      removeServer: vi.fn(),
      setServerEnabled: vi.fn(),
      reloadServer: vi.fn(),
      setToolEnabled: vi.fn(),
    } as unknown as ManagerClientApi
    api.snapshot.mockResolvedValue(snapshot(5, [view({ env: { TOKEN: { set: true, sensitive: false } } })]))
    ;(api.upsertServer as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot(6, []))
    const { container } = await openEditor(view({ env: { TOKEN: { set: true, sensitive: false } } }))
    const form = container.querySelector('form') as HTMLElement
    fireEvent.click(within(form).getAllByText('remove')[0] as Element)
    fireEvent.click(within(form).getByText('save'))
    await waitFor(() => expect(api.upsertServer).toHaveBeenCalled())
    const request = (api.upsertServer as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(request.server.env.TOKEN).toEqual({ clear: true })
  })

  it('keeps the key input mounted and focused while typing (stable row identity)', async () => {
    api = {
      snapshot: vi.fn(),
      upsertServer: vi.fn(),
      removeServer: vi.fn(),
      setServerEnabled: vi.fn(),
      reloadServer: vi.fn(),
      setToolEnabled: vi.fn(),
    } as unknown as ManagerClientApi
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
    api = {
      snapshot: vi.fn(),
      upsertServer: vi.fn(),
      removeServer: vi.fn(),
      setServerEnabled: vi.fn(),
      reloadServer: vi.fn(),
      setToolEnabled: vi.fn(),
    } as unknown as ManagerClientApi
    let resolvePoll!: (value: Snapshot) => void
    const pollPromise = new Promise<Snapshot>(resolve => { resolvePoll = resolve })
    ;(api.snapshot as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(snapshot(1, [view({ label: 'OLD' })]))
      .mockImplementationOnce(() => pollPromise)
      .mockResolvedValueOnce(snapshot(2, [view({ label: 'NEW' })]))
    renderPanel()
    await waitFor(() => expect(screen.getByText('OLD')).toBeTruthy())
    // 第二次轮询(挂起)
    await new Promise(resolve => setTimeout(resolve, 2_100))
    // 手动刷新 → 更新快照
    fireEvent.click(screen.getByText('refresh'))
    await waitFor(() => expect(screen.getByText('NEW')).toBeTruthy())
    // 迟到的旧轮询响应到达,应被丢弃
    await act(async () => { resolvePoll(snapshot(1, [view({ label: 'OLD' })])) })
    expect(screen.queryByText('OLD')).toBeNull()
    expect(screen.getByText('NEW')).toBeTruthy()
  })
})
