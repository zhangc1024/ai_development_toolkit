import { webFiles } from './web'
import { electronFiles } from './electron'
import type { PlatformFiles } from './types'
export type { SaveResult, SaveOptions } from './types'
export const files: PlatformFiles = {
  saveBlob: (...args) => (window.desktopFiles ? electronFiles : webFiles).saveBlob(...args),
  saveText: (...args) => (window.desktopFiles ? electronFiles : webFiles).saveText(...args),
}
