<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Home, ChevronRight, CodeXml, LockKeyhole, PanelLeftClose, PanelLeftOpen, ArrowUpRight } from '@lucide/vue'
import { tools, toolCategories as categories } from './tools/registry'
import { toolIcons as menuIcons } from './tools/icons'
import HomePage from './components/HomePage.vue'
import AiSettingsDialog from './components/AiSettingsDialog.vue'
import { openAiSettings } from './ai/settings'
import ToolGuide from './components/ToolGuide.vue'
import { routeFromPath, toolPath, pageMeta } from './seo/site'
const props = defineProps<{ initialRoute?: string }>()
const interactive = typeof window !== 'undefined'
const homePage = ref<InstanceType<typeof HomePage>>()
const categoryIcons: Record<string, string> = { 'AI 工具': 'prompt', '图片工具': 'image-compress', '数据处理': 'sql', '编码转换': 'html-entity', '安全与签名': 'jwt', '常用工具': 'timestamp', '文本处理': 'text', '参考查询': 'http-status' }
const selectedCategory = ref('')
function selectCategory(category = '') {
  selectedCategory.value = category
  homePage.value?.resetSearch()
  if (route.value !== 'home') navigate('home')
  window.scrollTo({ top: 0 })
}
const collapsed = ref(false)
const route = ref(props.initialRoute ?? (interactive ? routeFromPath(location.pathname) : 'home'))
function navigate(id: string) {
  history.pushState(null, '', toolPath(id))
  route.value = id
}
function migrateHash() {
  if (!location.hash.startsWith('#/')) return
  const id = location.hash.slice(2) || 'home'
  const valid = id === 'home' || tools.some(tool => tool.id === id && tool.status === 'ready')
  history.replaceState(null, '', valid ? toolPath(id) : '/404.html')
}
function syncRoute() { migrateHash(); route.value = routeFromPath(location.pathname) }
function followLink(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  const link = (event.target as Element).closest('a')
  if (!link || link.target || link.hasAttribute('download')) return
  const url = new URL(link.href, location.href)
  if (url.origin !== location.origin || url.hash || url.search) return
  const id = routeFromPath(url.pathname)
  if (id !== 'home' && !tools.some(tool => tool.id === id && tool.status === 'ready')) return
  event.preventDefault()
  if (id === 'home') { selectedCategory.value = ''; homePage.value?.resetSearch() }
  if (route.value !== id) navigate(id)
}
onMounted(() => {
  syncRoute()
  window.addEventListener('popstate', syncRoute)
  window.addEventListener('hashchange', syncRoute)
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', syncRoute)
  window.removeEventListener('hashchange', syncRoute)
})
const active = computed(() => tools.find(tool => tool.id === route.value && tool.status === 'ready'))
const isHome = computed(() => route.value === 'home')
const activeCategory = computed(() => isHome.value ? selectedCategory.value : active.value?.category ?? '')
const pageTitle = computed(() => isHome.value ? selectedCategory.value || '首页' : active.value?.name ?? '工具未找到')
if (interactive) watch([route, active], () => {
  const meta = pageMeta(active.value, isHome.value)
  document.title = meta.title
  document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description)
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (meta.canonical) {
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical) }
    canonical.href = meta.canonical
    document.querySelector('meta[name="robots"]')?.remove()
  } else {
    canonical?.remove()
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots) }
    robots.content = 'noindex'
  }
}, { immediate: true })
watch(route, () => { window.scrollTo({ top: 0 }) })
</script>
<template>
  <div @click="followLink" class="app-shell category-shell" :class="{ 'sidebar-collapsed': collapsed }">
    <aside class="sidebar">
      <a href="/" class="brand"><span class="brand-icon"><CodeXml :size="23" /></span><span>DevKit<small>开发者的随手工具箱</small></span></a>
      <nav aria-label="工具菜单">
        <a href="/" class="menu-item home-link" :class="{ active: isHome && !selectedCategory }" :aria-current="isHome && !selectedCategory ? 'page' : undefined"><Home :size="18" /><span>首页</span></a>
        <button v-for="category in categories" :key="category" class="menu-item category-link" :class="{ active: activeCategory === category }" :aria-pressed="activeCategory === category" @click="selectCategory(category)"><component :is="menuIcons[categoryIcons[category] ?? 'json']" :size="18" /><span>{{ category }}</span></button>
      </nav>
      <div class="sidebar-note"><span class="local-dot"></span> 本地运行，安心使用<p>静态工具在浏览器处理；AI 可连接自配服务。</p></div>
      <div class="sidebar-footer"><span>DevKit <small>v0.1.0</small></span><span>为日常开发而造 <ArrowUpRight :size="12" /></span></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button" @click="collapsed = !collapsed" :aria-label="collapsed ? '展开菜单' : '收起菜单'"><PanelLeftOpen v-if="collapsed" :size="18" /><PanelLeftClose v-else :size="18" /></button><span>工具箱</span><ChevronRight :size="14" /><strong>{{ pageTitle }}</strong></div><div class="topbar-ai-actions"><button class="button" @click="openAiSettings">AI 设置</button><span class="privacy-pill"><LockKeyhole :size="13" /> 静态工具本地处理</span></div></header>
      <main><HomePage v-if="isHome" ref="homePage" :category="selectedCategory" @show-all="selectCategory()" /><template v-else-if="active?.component"><component v-if="interactive" :is="active.component" :key="active.id" v-bind="active.props" /><section v-else class="static-tool-intro"><h1>{{ active.name }}</h1><p>{{ active.description }}</p><p>启用 JavaScript 后即可使用交互工具。</p></section><ToolGuide :tool="active" /></template><section v-else class="not-found"><h1>这个工具还不存在</h1><p>请从菜单选择已上线的工具。</p><a href="/">返回首页</a></section></main>
      <footer class="page-footer"><span>让重复的工作更简单。</span><span>纯前端 · 无账号 · AI 服务自行配置</span></footer>
    </div>
    <AiSettingsDialog v-if="interactive" />
  </div>
</template>

<style scoped>
.static-tool-intro{padding:32px 30px 0}.static-tool-intro h1{font-size:26px}
.topbar-ai-actions{display:flex;align-items:center;gap:12px;flex-shrink:0}
</style>
