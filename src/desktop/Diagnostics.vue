<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue"
import { probe, decodeSample } from "./probe"
import { MAX_PHOTO_BYTES } from "../tools/images/photo-formats"
const output = ref(""), busy = ref(false), allowEmbeddedRawPreview = ref(false)
let revision = 0
onBeforeUnmount(() => { revision++ })
async function inspect(file?: File) {
  if (busy.value) return
  const version = ++revision
  busy.value = true
  try {
    if (file && (!file.size || file.size > MAX_PHOTO_BYTES)) throw Error('图片必须非空且不超过 100 MiB')
    const result = file ? await decodeSample(await file.arrayBuffer(), file.name, allowEmbeddedRawPreview.value) : await probe()
    if (version === revision) output.value = JSON.stringify(result, null, 2)
  } catch (error) { if (version === revision) output.value = JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }
  finally { if (version === revision) busy.value = false }
}
function select(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (file) inspect(file) }
</script>
<template><details><summary>兼容性诊断</summary><p>检查 Worker、WASM、跨源隔离及本地素材。真实图片仅在内存处理。</p>
          <button class="button" :disabled="busy" @click="inspect()">运行资源诊断</button>
          <label><input v-model="allowEmbeddedRawPreview" type="checkbox" aria-label="允许内嵌 JPEG 兼容预览" />允许 Nikon HE/HE★ 使用内嵌 JPEG 兼容预览</label>
          <label class="button">验证 HEIC / RAW 样本<input type="file" aria-label="验证解码样本" :disabled="busy" @change="select" /></label>
          <span v-if="busy" role="status">检查中…</span><pre data-testid="desktop-probe">{{ output }}</pre>
        </details></template>
<style scoped>details { margin-top: 28px; } summary { cursor:pointer; } pre { white-space:pre-wrap; overflow-wrap:anywhere; }</style>
