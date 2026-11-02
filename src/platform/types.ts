export type SaveResult = { status: 'saved' | 'dispatched' | 'cancelled' } | { status: 'failed'; message: string }
export interface SaveOptions { signal?: AbortSignal; isCurrent?: () => boolean }
export interface PlatformFiles {
  saveBlob(blob: Blob, suggestedName: string, options?: SaveOptions): Promise<SaveResult>
  saveText(text: string, suggestedName: string, mime?: string, options?: SaveOptions): Promise<SaveResult>
}
export interface DesktopFilesBridge {
  begin(name: string, size: number): Promise<{ status: 'ready'; id: string } | SaveResult>
  append(id: string, sequence: number, bytes: Uint8Array): Promise<SaveResult>
  finish(id: string): Promise<SaveResult>
  cancel(id: string): Promise<SaveResult>
}
declare global {
  interface Window {
    desktopRuntime?: Readonly<{ electron: string; chrome: string; platform: string; version: string }>
    desktopFiles?: Readonly<DesktopFilesBridge>
    desktopClipboard?: Readonly<{ writeText(text: string): Promise<void> }>
  }
}
