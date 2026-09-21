# SEO 与静态部署

正式站点：https://tools.zhangc.net 。域名统一维护在 `src/seo/site.ts`。

## 日常开发与构建

仍然执行 `npm run dev` 开发、`npm run build` 构建。构建自动运行类型检查、Vite 打包、Vue 静态渲染。无需常驻 Node 服务，也无需安装浏览器或额外构建依赖。

首页为 `/`，工具页为 `/tools/{id}/`。旧 `/#/{id}` 由浏览器替换为新网址；片段不会传到服务器，因此不能通过服务器 301 迁移片段。站内导航支持前进、后退和打开新标签。

产物包括首页、每个 ready 工具的目录 index.html、404.html、robots.txt、sitemap.xml，以及唯一一份共用 assets。页面拥有各自的标题、description、canonical。404 页面不进入站点地图，带 noindex。

## 静态内容与交互边界

构建通过同一 Vue 外壳渲染首页工具列表、工具名称、用途、使用指南及相关链接。指南在正常交互页面也可见，不为爬虫单独提供隐藏内容。

编辑器、图片处理、Worker、聊天等浏览器专用工作区不在 Node 构建期间运行。页面加载后由 Vue 挂载交互应用，替换静态外壳；这不是完整工具工作区的服务端 hydration。没有 JavaScript 时仍可阅读工具说明和通过真实链接浏览其他工具，不能执行转换。不会渲染用户输入、localStorage、IndexedDB 或调用 Ollama。

新增工具仍在 `src/tools/registry.ts` 注册；建议在 `src/seo/guides.ts` 增加准确的使用说明。生成器自动发现 ready 条目。测试会提醒补齐指南。

## Nginx / 静态托管

站点部署在域名根目录，`base: '/'`；不支持直接搬到子目录。上传 **整个 dist**，不能只上传根 index.html 和 assets。

下面配置放入已有 HTTPS server 块，root 替换为真实发布目录；证书由现有服务器管理：

```nginx
server_name tools.zhangc.net;
root /实际发布目录/dist;
index index.html;

location / {
    try_files $uri $uri/ =404;
}
location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
location ~ \.html$ {
    try_files $uri =404;
    add_header Cache-Control "no-cache";
}
error_page 404 /404.html;
```

- 不要把所有未知路径回退到首页，否则不存在的网址可能返回 200（soft 404）。
- 确保 HTML/JS/CSS/WASM 返回正确 MIME，服务器启用标准 mime.types。
- HTML 短缓存或重新验证；带哈希资源长缓存。发布时先上传新资源，再替换 HTML，并保留旧哈希资源一段时间。
- HTTP 跳转 HTTPS；其他域名统一跳转正式域名。部署后检查裸工具路径能正确跳转到带斜杠目录。
- Vite 开发/preview 的 SPA 回退不能代替生产服务器 404 验收。生产规则应实测，不根据本地开发响应判断。
- 没有新增 Service Worker、埋点或数据上传。AI 工具仍受实际服务的 HTTPS、跨域和浏览器安全策略约束。

## 上线验收

1. 直接访问首页及几个工具网址，并刷新；标题与工具应对应，JS、CSS、Worker、WASM 不出现 404。
2. 查看源代码（不是仅看运行后的 DOM）：能读到工具名称、说明、canonical。
3. `/sitemap.xml` 包含所有已上线页面，域名为 tools.zhangc.net；`/robots.txt` 声明该站点地图。
4. 请求任意不存在的路径，HTTP 状态应为 404；静态资源缺失也必须为 404。
5. 在 Google Search Console 和百度搜索资源平台验证域名，提交站点地图或工具 URL，检查实际抓取结果。提交不保证收录或排名。

## 本次验证（2026-09-20）

- 类型检查、生产打包和静态生成通过；22 个测试文件、526 项测试通过。
- 29 个可索引页面 + 404 页，总 HTML 311.2 KiB；本次静态生成约 0.69 秒（随机器及内容变化）。
- dist 磁盘占用由改造前 3692 KiB 增至 4200 KiB；大资源共用，没有按工具复制 assets。
- 不执行 JavaScript 检查全部 29 个页面：HTTP 200、单个 H1、对应 canonical、description、真实链接和资源文件均通过。
- Windows 浏览器通过 WSL 静态预览逐一访问 28 个工具：标题、canonical、图标路径和加载检查通过，无页面脚本异常。
- 旧 /#/json 自动迁移、返回首页后浏览器后退通过；JSON 示例格式化及 Worker 输出通过。
- 未逐一执行所有工具的所有操作；图片编解码依赖等由既有核心测试覆盖，未声称完成全部浏览器端回归。
- 尚未发布到公网；线上 HTTPS、服务器 404 配置、缓存及搜索引擎实际抓取需上线后验证。
