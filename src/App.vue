<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Braces, Search, ChevronRight, CodeXml, LockKeyhole, PanelLeftClose, PanelLeftOpen, ArrowUpRight, Link, Binary, Languages, Code, KeyRound, Fingerprint, Clock, Database, FileKey, Regex, QrCode, ShieldCheck, Dices, GitCompareArrows, ListFilter, Globe, Hash } from '@lucide/vue'
import { tools } from './tools/registry'
const menuIcons = { uuid: Hash, random: Dices, diff: GitCompareArrows, text: ListFilter, 'http-status': Globe, regex: Regex, qrcode: QrCode, totp: ShieldCheck, url: Link, base64: Binary, unicode: Languages, 'html-entity': Code, jwt: FileKey, hash: Fingerprint, hmac: KeyRound, timestamp: Clock, sql: Database } as Record<string, typeof Braces>
const query = ref('')
const collapsed = ref(false)
const route = ref(location.hash.slice(2) || 'json')
function syncRoute() { route.value = location.hash.slice(2) || 'json' }
onMounted(() => { window.addEventListener('hashchange', syncRoute); if (!location.hash) history.replaceState(null, '', '#/json') })
onBeforeUnmount(() => window.removeEventListener('hashchange', syncRoute))
const active = computed(() => tools.find(tool => tool.id === route.value && tool.status === 'ready'))
watch(active, tool => { document.title = (tool?.name ?? '工具未找到') + ' · DevKit' }, { immediate: true })
const groups = computed(() => [...new Set(tools.map(t => t.category))].map(category => ({ category, items: tools.filter(t => t.category === category && t.name.toLowerCase().includes(query.value.toLowerCase().trim())) })).filter(g => g.items.length))
</script>
<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': collapsed }">
    <aside class="sidebar">
      <a href="#/json" class="brand"><span class="brand-icon"><CodeXml :size="23" /></span><span>DevKit<small>开发者的随手工具箱</small></span></a>
      <label class="menu-search"><Search :size="16" /><input v-model="query" placeholder="搜索工具…" aria-label="搜索工具" /></label>
      <nav aria-label="工具菜单">
        <div v-for="group in groups" :key="group.category" class="menu-group">
          <h2>{{ group.category }}</h2>
          <template v-for="tool in group.items" :key="tool.id">
            <a v-if="tool.status === 'ready'" :href="'#/' + tool.id" class="menu-item" :class="{ active: active?.id === tool.id }" :aria-current="active?.id === tool.id ? 'page' : undefined"><component :is="menuIcons[tool.id] ?? Braces" :size="17" /><span>{{ tool.name }}</span><span v-if="active?.id === tool.id" class="active-dot"></span></a>
            <div v-else class="menu-item planned" aria-disabled="true"><span class="planned-icon">◇</span><span>{{ tool.name }}</span><small>待开发</small></div>
          </template>
        </div>
        <p v-if="!groups.length" class="menu-empty">没有找到匹配的工具</p>
      </nav>
      <div class="sidebar-note"><span class="local-dot"></span> 本地运行，安心使用<p>输入内容仅在你的浏览器中处理。</p></div>
      <div class="sidebar-footer"><span>DevKit <small>v0.1.0</small></span><span>为日常开发而造 <ArrowUpRight :size="12" /></span></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button" @click="collapsed = !collapsed" :aria-label="collapsed ? '展开菜单' : '收起菜单'"><PanelLeftOpen v-if="collapsed" :size="18" /><PanelLeftClose v-else :size="18" /></button><span>工具箱</span><ChevronRight :size="14" /><strong>{{ active?.name ?? '未找到工具' }}</strong></div><span class="privacy-pill"><LockKeyhole :size="13" /> 无需上传 · 本地处理</span></header>
      <main><component v-if="active?.component" :is="active.component" :key="active.id" v-bind="active.props" /><section v-else class="not-found"><h1>这个工具还不存在</h1><p>请从菜单选择已上线的工具。</p><a href="#/json">返回 JSON 工具</a></section></main>
      <footer class="page-footer"><span>让重复的工作更简单。</span><span>纯前端 · 无账号 · 无数据上传</span></footer>
    </div>
  </div>
</template>
