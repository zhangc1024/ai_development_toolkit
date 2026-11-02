<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { imageTools } from '../tools/images/definitions'
import Diagnostics from './Diagnostics.vue'
const route = ref(location.pathname)
const current = computed(() => imageTools.find(tool => route.value.replace(/\/$/, '') === '/tools/' + tool.id))
const runtime = window.desktopRuntime
function changed() { route.value = location.pathname; window.scrollTo(0, 0) }
function navigate(path: string) { if (path !== location.pathname) history.pushState(null, '', path); changed() }
window.addEventListener('popstate', changed)
onBeforeUnmount(() => window.removeEventListener('popstate', changed))
</script>
<template>
  <div class="desktop-app">
    <header class="desktop-bar"><a href="/" @click.prevent="navigate('/')">DevKit 图片工具</a><span>本地处理 · 不上传图片</span><small>v{{ runtime?.version ?? '0.1.0' }} · 内测版</small></header>
    <nav aria-label="图片工具导航"><a href="/" :aria-current="route === '/' ? 'page' : undefined" @click.prevent="navigate('/')">首页</a><a v-for="tool in imageTools" :key="tool.id" :href="'/tools/' + tool.id + '/'" :aria-current="current?.id === tool.id ? 'page' : undefined" @click.prevent="navigate('/tools/' + tool.id + '/')">{{ tool.name }}</a></nav>
    <main>
      <section v-if="route === '/'" class="desktop-home"><h1>图片工具</h1><p>选择工具，开始处理本地图片。</p><div class="tool-cards"><button v-for="tool in imageTools" :key="tool.id" class="tool-card" :aria-label="'打开' + tool.name" @click="navigate('/tools/' + tool.id + '/')"><strong>{{ tool.name }}</strong><span>{{ tool.description }}</span></button></div><Diagnostics /></section>
      <component v-else-if="current" :is="current.component" :key="current.id" v-bind="current.props" />
      <section v-else class="time-form"><h1>页面未找到</h1><p>请选择一个图片工具。</p><button class="button" @click="navigate('/')">返回首页</button></section>
    </main><footer>关闭窗口会结束正在进行的处理；取消或中断保存不会提交未写完的文件。</footer>
  </div>
</template>
<style scoped>
.desktop-app { max-width: 1440px; margin: auto; padding: 24px; }
.desktop-bar { display: flex; align-items: center; gap: 24px; margin-bottom: 20px; }.desktop-bar>a { font-weight: 700; font-size: 18px; }.desktop-bar span { margin-right: auto; color: #64748b; }
nav { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 20px; }nav a { padding: 8px 12px; border-radius: 8px; }nav a[aria-current=page] { color: #fff; background: #2563eb; }
main { min-width: 0; }footer { margin-top: 28px; font-size: 12px; color: #64748b; }.tool-cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 16px; margin: 28px 0; }.tool-card { text-align: left; background: #fff; border: 1px solid #dce3ee; border-radius: 12px; padding: 24px; cursor: pointer; display: flex; flex-direction: column; gap: 12px; }.tool-card:hover { border-color: #2563eb; }.tool-card span { color: #64748b; line-height: 1.6; }a:focus-visible,button:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
</style>
