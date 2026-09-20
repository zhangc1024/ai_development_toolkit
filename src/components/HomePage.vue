<script setup lang="ts">
import { computed, ref } from 'vue'
import { Braces, Search, X } from '@lucide/vue'
import { tools, toolCategories as categories } from '../tools/registry'
import { toolIcons } from '../tools/icons'

const props = defineProps<{ category: string }>()
const emit = defineEmits<{ 'show-all': [] }>()
const query = ref('')
const groups = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return categories.filter(category => !props.category || category === props.category).map(category => ({
    category,
    items: tools.filter(tool => tool.status === 'ready' && tool.category === category &&
      [tool.name, tool.description ?? '', tool.category].some(value => value.toLowerCase().includes(needle))),
  })).filter(group => group.items.length)
})
const count = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0))
const tones: Record<string, string> = {
  json: 'green', 'json-diff': 'purple', 'php-array': 'blue', sql: 'orange', regex: 'purple',
  watermark: 'blue', 'image-compress': 'green', 'moments-grid': 'purple', 'image-base64': 'pink', 'qr-reader': 'orange',
  url: 'blue', base64: 'purple', unicode: 'green', 'html-entity': 'orange',
  jwt: 'purple', hash: 'blue', rsa: 'green', hmac: 'orange', totp: 'pink',
  timestamp: 'blue', qrcode: 'green', uuid: 'purple', random: 'orange', diff: 'purple', text: 'blue', prompt: 'pink', 'http-status': 'blue',
}
function categoryId(category: string) { return 'home-category-' + categories.indexOf(category) }
function resetSearch() { query.value = '' }
defineExpose({ resetSearch })
</script>

<template>
  <section class="home-page" aria-labelledby="home-title">
    <header class="home-heading">
      <div><h1 id="home-title">{{ category || '首页' }}</h1><p>{{ category ? '浏览该分类下的工具，快速找到所需功能。' : '让重复的工作更简单。' }}</p></div>
      <label class="home-search">
        <Search :size="20" aria-hidden="true" />
        <input v-model="query" type="search" placeholder="搜索工具名称或用途…" aria-label="搜索首页工具" />
        <button v-if="query" class="icon-button" aria-label="清空首页搜索" @click="query = ''"><X :size="17" /></button>
      </label>
    </header>
    <p v-if="query.trim()" class="home-search-summary" role="status">找到 {{ count }} 个工具</p>
    <section v-for="group in groups" :key="group.category" class="home-category" :aria-labelledby="categoryId(group.category)">
      <h2 :id="categoryId(group.category)" tabindex="-1">{{ group.category }} <span>({{ group.items.length }})</span></h2>
      <div class="home-grid">
        <a v-for="tool in group.items" :key="tool.id" class="tool-card" :href="'#/' + tool.id">
          <span class="tool-card-icon" :class="'tone-' + (tones[tool.id] ?? 'purple')"><component :is="toolIcons[tool.id] ?? Braces" :size="27" :stroke-width="1.8" aria-hidden="true" /></span>
          <div class="tool-card-copy"><h3>{{ tool.name }}</h3><p>{{ tool.description || '打开并使用' + tool.name }}</p></div>
        </a>
      </div>
    </section>
    <div v-if="!groups.length" class="home-empty">
      <Search :size="32" aria-hidden="true" /><h2>没有找到匹配的工具</h2><p>试试工具名称、分类，或“压缩”“二维码”等用途关键词。</p>
      <button class="button" @click="resetSearch(); emit('show-all')">显示全部工具</button>
    </div>
  </section>
</template>

<style scoped>
.home-page{padding:32px 30px 40px}
.home-heading{display:flex;align-items:center;justify-content:space-between;gap:28px;margin-bottom:32px}
.home-heading h1{font-size:30px;letter-spacing:-.6px;margin:0 0 10px;font-weight:700}
.home-heading p{margin:0;font-size:15px;color:#79859b}
.home-search{display:flex;align-items:center;gap:12px;flex:0 1 460px;padding:14px 17px;background:#fff;border:1px solid #e1e4ee;border-radius:11px;color:#8063eb}
.home-search:focus-within{border-color:#a594ea;box-shadow:0 0 0 3px #7160df12}
.home-search input{width:100%;min-width:0;border:0;outline:none;background:transparent;color:#283248;font-size:14px}
.home-search input::placeholder{color:#929bad}
.home-search input::-webkit-search-cancel-button{display:none}
.home-category{margin-bottom:30px}
.home-category:last-child{margin-bottom:0}
.home-category h2{font-size:19px;font-weight:650;margin:0 0 15px;scroll-margin-top:24px}
.home-category h2 span{font-size:14px;font-weight:400;color:#79859b;margin-left:9px}
.home-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.tool-card{display:flex;align-items:center;gap:16px;min-width:0;min-height:105px;padding:18px;background:#fff;border:1px solid #eef0f5;border-radius:11px;box-shadow:0 3px 12px #28324805;transition:border-color .15s,box-shadow .15s}
.tool-card:hover{border-color:#c9bdf1;box-shadow:0 5px 18px #7160df12}
.tool-card-icon{display:grid;place-items:center;flex-shrink:0;width:52px;height:52px;border-radius:13px}
.tone-green{background:#e9faef;color:#14af63}.tone-purple{background:#f1ebff;color:#8051ed}.tone-blue{background:#e9f3ff;color:#2785f5}.tone-orange{background:#fff2e4;color:#f18b29}.tone-pink{background:#ffedf3;color:#ef548e}
.tool-card-copy{min-width:0}
.tool-card h3{font-size:16px;line-height:1.6;font-weight:650;margin:0 0 7px;overflow-wrap:anywhere}
.tool-card p{font-size:14px;line-height:1.8;color:#7c879b;margin:0;overflow-wrap:anywhere}
.home-search-summary{color:#79859b;font-size:13px;margin:-12px 0 24px}
.home-empty{padding:70px 20px;text-align:center;color:#79859b}
.home-empty h2{font-size:18px;color:#46516a}.home-empty p{line-height:1.8}.home-empty .button{margin:15px auto 0}
@media(max-width:1150px){.home-page{padding:28px 22px}.home-heading{gap:20px}.home-search{flex-basis:350px}}
@media(min-width:1001px) and (max-width:1150px){.home-page{padding:20px}.home-heading{margin-bottom:14px}.home-heading h1{font-size:27px;line-height:1.2;margin-bottom:8px}.home-heading p{font-size:14px;line-height:1.5}.home-category{margin-bottom:18px}.home-category h2{font-size:17px;line-height:22px;margin-bottom:10px}.home-grid{gap:12px}.tool-card{min-height:76px;padding:10px;gap:12px}.tool-card-icon{width:44px;height:44px}.tool-card h3{font-size:14px;margin-bottom:5px}.tool-card p{font-size:12px}}
@media(max-width:1000px){.home-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:820px){.home-page{padding:26px 20px}.home-heading{align-items:stretch;flex-direction:column;gap:22px}.home-search{flex-basis:auto}.home-heading h1{font-size:27px}.home-category{margin-bottom:26px}.tool-card{padding:16px;gap:13px}}
@media(max-width:560px){.home-grid{grid-template-columns:minmax(0,1fr);gap:12px}.tool-card{min-height:94px}.home-category h2{font-size:16px}.home-page{padding:24px 16px}.home-empty{padding:40px 8px}}
@media(prefers-reduced-motion:reduce){.tool-card{transition:none}}
</style>
