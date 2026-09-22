<script setup lang="ts">
import { computed, ref } from 'vue'

const query = ref('')
const category = ref('all')
const controls = [
  ['NUL', '空字符'], ['SOH', '标题开始'], ['STX', '正文开始'], ['ETX', '正文结束'],
  ['EOT', '传输结束'], ['ENQ', '询问'], ['ACK', '确认'], ['BEL', '响铃'],
  ['BS', '退格'], ['HT', '水平制表符'], ['LF', '换行'], ['VT', '垂直制表符'],
  ['FF', '换页'], ['CR', '回车'], ['SO', '移出'], ['SI', '移入'],
  ['DLE', '数据链路转义'], ['DC1', '设备控制 1'], ['DC2', '设备控制 2'], ['DC3', '设备控制 3'],
  ['DC4', '设备控制 4'], ['NAK', '否定确认'], ['SYN', '同步空闲'], ['ETB', '传输块结束'],
  ['CAN', '取消'], ['EM', '介质结束'], ['SUB', '替代'], ['ESC', '转义'],
  ['FS', '文件分隔符'], ['GS', '组分隔符'], ['RS', '记录分隔符'], ['US', '单元分隔符'],
]
const rows = Array.from({ length: 128 }, (_, decimal) => {
  const control = decimal < 32 || decimal === 127
  const character = decimal < 32 ? controls[decimal]![0]! : decimal === 127 ? 'DEL' : decimal === 32 ? 'SP' : String.fromCharCode(decimal)
  const description = decimal < 32 ? controls[decimal]![1]! : decimal === 127 ? '删除' : decimal === 32 ? '空格' : decimal >= 48 && decimal <= 57 ? '数字' : decimal >= 65 && decimal <= 90 ? '大写字母' : decimal >= 97 && decimal <= 122 ? '小写字母' : '标点 / 符号'
  return { decimal, hex: decimal.toString(16).toUpperCase().padStart(2, '0'), octal: decimal.toString(8).padStart(3, '0'), binary: decimal.toString(2).padStart(8, '0'), character, description, control }
})
const filteredRows = computed(() => {
  const raw = query.value
  const keyword = raw.trim().toLowerCase()
  return rows.filter(row => {
    if (category.value === 'control' && !row.control) return false
    if (category.value === 'printable' && row.control) return false
    if (!raw) return true
    // 单个字符按原样匹配，区分大小写；纯数字按十进制查询。
    if (raw.length === 1 && !/[0-9]/.test(raw)) return row.decimal === raw.charCodeAt(0)
    if (!keyword) return true
    if (/^[0-9]+$/.test(keyword)) return row.decimal === Number(keyword)
    if (/^0x[0-9a-f]+$/.test(keyword)) return row.decimal === parseInt(keyword.slice(2), 16)
    if (/^0o[0-7]+$/.test(keyword)) return row.decimal === parseInt(keyword.slice(2), 8)
    if (/^0b[01]+$/.test(keyword)) return row.decimal === parseInt(keyword.slice(2), 2)
    return row.character.toLowerCase().includes(keyword) || row.description.includes(keyword)
  })
})
</script>

<template>
  <div class="tool-page ascii-page">
    <div class="tool-heading"><div>
      <div class="eyebrow">开发工具 <span>/</span> LOCAL WORKSPACE</div>
      <h1>ASCII 对照表</h1>
      <p>查询 0–127 的标准 ASCII 字符与编码，所有查询均在浏览器本地完成。</p>
    </div></div>
    <section class="time-form">
      <label class="time-input-label">搜索字符或编码
        <input v-model="query" type="search" aria-label="搜索 ASCII 字符或编码" placeholder="例如 A、65、0x41、0o101、0b01000001、LF、换行" maxlength="100" spellcheck="false" />
      </label>
      <div class="ascii-filters">
        <label class="indent-label">字符分类
          <select v-model="category" aria-label="ASCII 字符分类">
            <option value="all">全部字符</option>
            <option value="printable">可打印字符（32–126）</option>
            <option value="control">控制字符（0–31、127）</option>
          </select>
        </label>
        <button class="button" @click="query = ''; category = 'all'">重置</button>
        <span role="status">共 {{ filteredRows.length }} 条</span>
      </div>
      <p class="ascii-hint">单个字符区分大小写；纯数字按十进制查询。其他进制请加 0x、0o 或 0b 前缀。</p>
    </section>
    <section class="time-results" aria-label="ASCII 查询结果">
      <div class="ascii-table-wrap" tabindex="0" role="region" aria-label="ASCII 对照表，可横向滚动">
        <table>
          <caption>标准 ASCII 对照表（0–127）</caption>
          <thead><tr><th scope="col">十进制</th><th scope="col">十六进制</th><th scope="col">八进制</th><th scope="col">二进制</th><th scope="col">字符 / 缩写</th><th scope="col">说明</th></tr></thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.decimal">
              <td>{{ row.decimal }}</td><td>0x{{ row.hex }}</td><td>0o{{ row.octal }}</td><td>{{ row.binary }}</td>
              <td><code :class="{ 'ascii-control': row.control }">{{ row.character }}</code></td><td>{{ row.description }}</td>
            </tr>
            <tr v-if="!filteredRows.length"><td colspan="6" class="ascii-empty">没有匹配的字符，请调整关键词或分类。</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="encoding-rules">
      <h2>使用说明</h2>
      <ul>
        <li>标准 ASCII 使用 7 位编码，共 128 个字符。本表二进制补齐为 8 位，最高位为 0。</li>
        <li>0–31 和 127 为控制字符，以缩写显示；32 为空格（SP），33–126 为可见字符。</li>
        <li>常用控制字符：HT（9）制表、LF（10）换行、CR（13）回车。Windows 常用 CRLF 换行，Unix / Linux 常用 LF。</li>
        <li>数字字符 0–9 的十进制编码为 48–57。例如查询字符 0 时，请输入 48 或 0x30。</li>
        <li>128–255 不属于标准 ASCII，不同扩展编码的字符定义不同，因此未收录。</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.ascii-page .time-input-label{margin-top:0}
.ascii-filters{display:flex;align-items:center;flex-wrap:wrap;gap:16px}
.ascii-filters span,.ascii-hint{font-size:12px;color:#748099}
.ascii-hint{margin:16px 0 0;line-height:1.8}
.ascii-table-wrap{overflow-x:auto}
.ascii-page table{width:100%;min-width:650px;border-collapse:collapse;text-align:left;font-size:13px}
.ascii-page caption{text-align:left;font-weight:600;color:#39455b;padding-bottom:16px}
.ascii-page th{background:#f5f7fb;color:#59657b;font-weight:600;white-space:nowrap}
.ascii-page th,.ascii-page td{padding:12px 16px;border-bottom:1px solid #e7e9f0}
.ascii-page td{color:#39455b}
.ascii-page td:not(:last-child){font-family:Consolas,monospace}
.ascii-page tbody tr:hover{background:#f8faff}
.ascii-page code{font:600 14px Consolas,monospace}
.ascii-page .ascii-control{color:#758095;font-size:12px}
.ascii-page .ascii-empty{text-align:center;padding:32px 16px;font-family:inherit}
</style>
