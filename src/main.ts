import { createApp } from 'vue'
import App from './App.vue'
import { tools } from './tools/registry'
import { routeFromPath, toolPath } from './seo/site'
import './style.css'

// Historical fragments are migrated in the browser because fragments never reach the server.
if (location.hash.startsWith('#/')) {
  const id = location.hash.slice(2) || 'home'
  const valid = id === 'home' || tools.some(tool => tool.id === id && tool.status === 'ready')
  history.replaceState(null, '', valid ? toolPath(id) : '/404.html')
} else {
  const id = routeFromPath(location.pathname)
  if (id === 'home' || tools.some(tool => tool.id === id && tool.status === 'ready')) {
    const path = toolPath(id)
    if (path !== location.pathname) history.replaceState(null, '', path + location.search + location.hash)
  }
}
// Static public content is replaced by the interactive app; no browser state is rendered at build time.
createApp(App).mount('#app')
