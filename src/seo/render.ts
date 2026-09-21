import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import App from '../App.vue'
import { tools } from '../tools/registry'
import { pageMeta, toolPath, siteOrigin } from './site'

export const pages = [
  { id: 'home', path: '/', ...pageMeta(undefined, true) },
  ...tools.filter(tool => tool.status === 'ready').map(tool => ({ id: tool.id, path: toolPath(tool.id), ...pageMeta(tool) })),
]
export { siteOrigin }
export async function render(id: string) {
  return renderToString(createSSRApp(App, { initialRoute: id }))
}
