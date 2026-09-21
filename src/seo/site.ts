export const siteOrigin = 'https://tools.zhangc.net'
export const homeTitle = 'DevKit 开发工具箱 - JSON、编码转换与图片处理'
export const homeDescription = '免费开发工具箱，提供 JSON 格式化、编码转换、时间戳、文本对比与图片处理。静态工具在浏览器本地运行，AI 工具可连接自配 Ollama 服务。'

export function toolPath(id: string): string {
  return id === 'home' ? '/' : `/tools/${encodeURIComponent(id)}/`
}
export function routeFromPath(path: string): string {
  if (path === '/' || path === '/index.html') return 'home'
  const match = /^\/tools\/([a-z0-9-]+)\/(?:index\.html)?$/.exec(path)
    ?? /^\/tools\/([a-z0-9-]+)$/.exec(path)
  return match?.[1] ?? 'not-found'
}
export function pageMeta(tool?: { id: string; name: string; description?: string }, home = false) {
  return {
    title: home ? homeTitle : tool ? `${tool.name} - DevKit 开发工具箱` : '页面未找到 - DevKit',
    description: home ? homeDescription : tool ? `${tool.name}：${tool.description ?? tool.name}。${['ai-chat', 'prompt'].includes(tool.id) ? 'AI 服务由用户自行配置，连接 Ollama 时内容会发送到该服务。' : '在浏览器本地处理，无需上传输入内容。'}` : '请求的页面不存在，请返回首页选择已上线工具。',
    canonical: home ? siteOrigin + '/' : tool ? siteOrigin + toolPath(tool.id) : '',
  }
}
