<script setup lang="ts">
import { computed } from 'vue'
import { tools, type ToolDefinition } from '../tools/registry'
import { guides } from '../seo/guides'
import { toolPath } from '../seo/site'
const props = defineProps<{ tool: ToolDefinition }>()
const instructions = computed(() => guides[props.tool.id] ?? [`使用${props.tool.name}完成${props.tool.description ?? '相应处理'}，检查结果后再使用。`])
const related = computed(() => tools.filter(item => item.status === 'ready' && item.category === props.tool.category && item.id !== props.tool.id).slice(0, 5))
</script>
<template>
  <section class="tool-guide" aria-labelledby="tool-guide-title">
    <h2 id="tool-guide-title">{{ tool.name }}使用指南</h2>
    <p>{{ tool.description }}。</p>
    <ul><li v-for="instruction in instructions" :key="instruction">{{ instruction }}</li></ul>
    <template v-if="related.length"><h2>相关工具</h2><nav aria-label="相关工具"><a v-for="item in related" :key="item.id" :href="toolPath(item.id)">{{ item.name }}</a></nav></template>
    <p><a href="/">查看全部开发工具</a></p>
  </section>
</template>
<style scoped>
.tool-guide{margin:24px 30px;padding:24px;border:1px solid #e4e7ee;border-radius:14px;background:#fff;color:#475569;line-height:1.8}
.tool-guide h2{font-size:17px;color:#1e293b;margin:0 0 12px}.tool-guide h2:not(:first-child){margin-top:22px}
.tool-guide ul{padding-left:22px}.tool-guide nav{display:flex;gap:12px 20px;flex-wrap:wrap}.tool-guide a{color:#2563eb}
@media(max-width:640px){.tool-guide{margin:16px;padding:18px}}
</style>
