/** 桌面端可替换这里的系统能力，不需要改 JSON 处理逻辑。 */
export async function copyText(text: string) {
  if (!navigator.clipboard?.writeText) throw new Error('当前环境不能直接复制，请选中结果后按 Ctrl+C')
  await navigator.clipboard.writeText(text)
}
export function downloadText(text: string, filename: string, mimeType = 'application/json;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
