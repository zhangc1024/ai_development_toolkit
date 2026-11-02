import { afterEach, describe, expect, it, vi } from 'vitest'
import { electronFiles } from '../src/platform/electron'
import { webFiles } from '../src/platform/web'
import type { DesktopFilesBridge } from '../src/platform/types'
function bridge(overrides: Partial<DesktopFilesBridge> = {}) {
  const api = {
    begin: vi.fn(async () => ({ status: 'ready' as const, id: 'session' })),
    append: vi.fn(async () => ({ status: 'saved' as const })),
    finish: vi.fn(async () => ({ status: 'saved' as const })),
    cancel: vi.fn(async () => ({ status: 'cancelled' as const })),
    ...overrides,
  }
  vi.stubGlobal('window', { desktopFiles: api })
  return api
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('desktop Blob saving', () => {
  it('streams a large Blob in bounded chunks without reading the whole Blob', async () => {
    const api = bridge()
    const blob = new Blob([new Uint8Array(9 * 1024 * 1024 + 7).fill(19)])
    blob.arrayBuffer = () => { throw Error('whole Blob must not be copied') }
    expect(await electronFiles.saveBlob(blob, '图片.zip')).toEqual({ status: 'saved' })
    const chunks = api.append.mock.calls as unknown as [string, number, Uint8Array][]
    expect(chunks.map(call => call[1])).toEqual([0, 1, 2])
    expect(chunks.map(call => call[2].length)).toEqual([4 * 1024 * 1024, 4 * 1024 * 1024, 1024 * 1024 + 7])
    expect(chunks.every(call => call[2][0] === 19)).toBe(true)
    expect(api.finish).toHaveBeenCalledOnce()
    expect(api.cancel).not.toHaveBeenCalled()
  })
  it('cancellation between chunks never finishes and cleans the active session', async () => {
    const controller = new AbortController()
    const api = bridge({ append: vi.fn(async () => { controller.abort(); return { status: 'saved' } }) })
    expect(await electronFiles.saveBlob(new Blob([new Uint8Array(5 * 1024 * 1024)]), 'a.zip', { signal: controller.signal })).toEqual({ status: 'cancelled' })
    expect(api.append).toHaveBeenCalledOnce()
    expect(api.finish).not.toHaveBeenCalled()
    expect(api.cancel).toHaveBeenCalledWith('session')
  })
  it('output invalidated during dialog is never written', async () => {
    let current = true
    const api = bridge({ begin: vi.fn(async () => { current = false; return { status: 'ready', id: 'session' } }) })
    expect(await electronFiles.saveBlob(new Blob(['x']), 'a.txt', { isCurrent: () => current })).toEqual({ status: 'cancelled' })
    expect(api.append).not.toHaveBeenCalled()
    expect(api.finish).not.toHaveBeenCalled()
    expect(api.cancel).toHaveBeenCalledOnce()
  })
  it('append errors cancel temporary file and release the save lock', async () => {
    const api = bridge({ append: vi.fn(async () => ({ status: 'failed', message: 'disk full' })) })
    expect((await electronFiles.saveBlob(new Blob(['x']), 'a.txt')).status).toBe('failed')
    expect(api.cancel).toHaveBeenCalledOnce()
    const next = bridge()
    expect((await electronFiles.saveBlob(new Blob(['y']), 'b.txt')).status).toBe('saved')
    expect(next.finish).toHaveBeenCalledOnce()
  })
  it('a pending dialog prevents duplicate save dialogs', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const api = bridge({ begin: vi.fn(async () => { await gate; return { status: 'cancelled' } }) })
    const first = electronFiles.saveBlob(new Blob(['x']), 'a.txt')
    expect((await electronFiles.saveBlob(new Blob(['x']), 'a.txt')).status).toBe('cancelled')
    expect(api.begin).toHaveBeenCalledOnce()
    release(); await first
  })
})
describe('web save compatibility', () => {
  it('dispatches a download and revokes the URL; never reports a confirmed disk save', async () => {
    vi.useFakeTimers()
    const link = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: () => link })
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:fixture', revokeObjectURL })
    expect(await webFiles.saveText('中文', '中文.txt')).toEqual({ status: 'dispatched' })
    expect(link.download).toBe('中文.txt')
    expect(link.click).toHaveBeenCalledOnce()
    await vi.runAllTimersAsync()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fixture')
  })
  it('invalidated web output is not dispatched', async () => {
    const document = { createElement: vi.fn() }
    vi.stubGlobal('document', document)
    expect(await webFiles.saveBlob(new Blob(['x']), 'a.txt', { isCurrent: () => false })).toEqual({ status: 'cancelled' })
    expect(document.createElement).not.toHaveBeenCalled()
  })
})
