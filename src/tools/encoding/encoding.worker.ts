import { processEncoding } from './core'
self.onmessage = event => {
  const { kind, text, direction, options } = event.data
  self.postMessage(processEncoding(kind, text, direction, options))
}
