<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Home, ChevronRight, CodeXml, LockKeyhole, PanelLeftClose, PanelLeftOpen, ArrowUpRight } from '@lucide/vue'
import { tools, toolCategories as categories } from './tools/registry'
import { toolIcons as menuIcons } from './tools/icons'
import HomePage from './components/HomePage.vue'
import AiSettingsDialog from './components/AiSettingsDialog.vue'
import { openAiSettings } from './ai/settings'
const homePage = ref<InstanceType<typeof HomePage>>()
const categoryIcons: Record<string, string> = { 'AI 工具': 'prompt', '图片工具': 'image-compress', '数据处理': 'sql', '编码转换': 'html-entity', '安全与签名': 'jwt', '常用工具': 'timestamp', '文本处理': 'text', '参考查询': 'http-status' }
const selectedCategory = ref('')
function selectCategory(category = '') {
  selectedCategory.value = category
  homePage.value?.resetSearch()
  if (route.value !== 'home') location.hash = '#/home'
  window.scrollTo({ top: 0 })
}
const collapsed = ref(false)
const route = ref(location.hash.slice(2) || 'home')
function syncRoute() { route.value = location.hash.slice(2) || 'home' }
onMounted(() => { window.addEventListener('hashchange', syncRoute); if (!location.hash) history.replaceState(null, '', '#/home') })
onBeforeUnmount(() => window.removeEventListener('hashchange', syncRoute))
const active = computed(() => tools.find(tool => tool.id === route.value && tool.status === 'ready'))
const isHome = computed(() => route.value === 'home')
const activeCategory = computed(() => isHome.value ? selectedCategory.value : active.value?.category ?? '')
const pageTitle = computed(() => isHome.value ? selectedCategory.value || '首页' : active.value?.name ?? '工具未找到')
watch(pageTitle, title => { document.title = title + ' · DevKit' }, { immediate: true })
watch(route, () => { window.scrollTo({ top: 0 }) })
</script>
<template>
  <div class="app-shell category-shell" :class="{ 'sidebar-collapsed': collapsed }">
    <aside class="sidebar">
      <a href="#/home" class="brand" @click="selectCategory()"><span class="brand-icon"><CodeXml :size="23" /></span><span>DevKit<small>开发者的随手工具箱</small></span></a>
      <nav aria-label="工具菜单">
        <a href="#/home" class="menu-item home-link" @click="selectCategory()" :class="{ active: isHome && !selectedCategory }" :aria-current="isHome && !selectedCategory ? 'page' : undefined"><Home :size="18" /><span>首页</span></a>
        <button v-for="category in categories" :key="category" class="menu-item category-link" :class="{ active: activeCategory === category }" :aria-pressed="activeCategory === category" @click="selectCategory(category)"><component :is="menuIcons[categoryIcons[category] ?? 'json']" :size="18" /><span>{{ category }}</span></button>
      </nav>
      <div class="sidebar-note"><span class="local-dot"></span> 本地运行，安心使用<p>静态工具在浏览器处理；AI 可连接自配服务。</p></div>
      <div class="sidebar-footer"><span>DevKit <small>v0.1.0</small></span><span>为日常开发而造 <ArrowUpRight :size="12" /></span></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button" @click="collapsed = !collapsed" :aria-label="collapsed ? '展开菜单' : '收起菜单'"><PanelLeftOpen v-if="collapsed" :size="18" /><PanelLeftClose v-else :size="18" /></button><span>工具箱</span><ChevronRight :size="14" /><strong>{{ pageTitle }}</strong></div><div class="topbar-ai-actions"><button class="button" @click="openAiSettings">AI 设置</button><span class="privacy-pill"><LockKeyhole :size="13" /> 静态工具本地处理</span></div></header>
      <main><HomePage v-if="isHome" ref="homePage" :category="selectedCategory" @show-all="selectCategory()" /><component v-else-if="active?.component" :is="active.component" :key="active.id" v-bind="active.props" /><section v-else class="not-found"><h1>这个工具还不存在</h1><p>请从菜单选择已上线的工具。</p><a href="#/home" @click="selectCategory()">返回首页</a></section></main>
      <footer class="page-footer"><span>让重复的工作更简单。</span><span>纯前端 · 无账号 · AI 服务自行配置</span></footer>
    </div>
    <AiSettingsDialog />
  </div>
</template>

<style scoped>
.topbar-ai-actions{display:flex;align-items:center;gap:12px;flex-shrink:0}
</style>
