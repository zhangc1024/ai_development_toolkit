/** IANA HTTP Status Code Registry 核对日期 2026-09-16。只内置单个登记代码，不枚举未分配区间。 */
const data = `100|Continue|继续发送请求体|检查 Expect: 100-continue 交互。
101|Switching Protocols|切换协议|检查 Upgrade 与 Connection 请求头。
102|Processing|处理中（WebDAV）|服务器仍在处理请求，等待最终响应。
103|Early Hints|提前提示|用于最终响应前发送预加载提示。
104|Upload Resumption Supported|支持上传续传（临时登记）|临时登记到期日 2026-11-13，后续需核对 IANA。
200|OK|请求成功|按接口约定检查响应体。
201|Created|资源已创建|检查 Location 或返回的资源标识。
202|Accepted|已接受但尚未完成|按接口约定查询异步任务进度。
203|Non-Authoritative Information|非源站权威信息|内容可能被代理转换。
204|No Content|成功且无响应内容|不要尝试解析空的 JSON 响应体。
205|Reset Content|重置内容|客户端应重置提交视图。
206|Partial Content|部分内容|检查 Range 与 Content-Range。
207|Multi-Status|多状态（WebDAV）|逐项读取响应内的资源状态。
208|Already Reported|已报告（WebDAV）|避免重复列出绑定资源。
226|IM Used|使用实例操作|检查增量响应及 IM 请求协商。
300|Multiple Choices|多个可选资源|选择响应提供的目标。
301|Moved Permanently|永久重定向|检查 Location 和缓存；部分客户端可能将 POST 改为 GET。
302|Found|临时重定向|检查 Location；部分客户端可能将 POST 改为 GET。
303|See Other|查看其他资源|通常改用 GET 获取 Location 指向的资源。
304|Not Modified|资源未修改|使用客户端缓存，不期待新的响应体。
305|Use Proxy|使用代理（已弃用）|历史状态，不建议新系统使用。
306|(Unused)|未使用|保留状态，不用于新业务。
307|Temporary Redirect|临时重定向并保留方法|转发时保留原方法和请求体。
308|Permanent Redirect|永久重定向并保留方法|检查 Location、缓存以及原方法和请求体。
400|Bad Request|请求不合法|检查请求语法、参数与正文格式。
401|Unauthorized|缺少有效认证|检查认证凭证及 WWW-Authenticate。
402|Payment Required|需要付费（保留用途）|具体业务含义由服务方定义。
403|Forbidden|拒绝访问|检查权限和访问策略，重新认证未必能解决。
404|Not Found|资源未找到|检查路径、资源存在性；服务端也可能隐藏资源。
405|Method Not Allowed|方法不允许|检查请求方法与 Allow 响应头。
406|Not Acceptable|无可接受的表示|检查 Accept 等内容协商请求头。
407|Proxy Authentication Required|代理需要认证|检查代理凭证及 Proxy-Authenticate。
408|Request Timeout|接收请求超时|检查客户端发送速度和连接。
409|Conflict|资源状态冲突|检查并发更新、版本与业务状态。
410|Gone|资源已永久移除|检查资源迁移或删除记录。
411|Length Required|需要内容长度|检查 Content-Length。
412|Precondition Failed|前置条件失败|检查 If-Match 等条件头与资源版本。
413|Content Too Large|请求内容过大|检查上传大小及网关限制；旧称 Payload Too Large。
414|URI Too Long|URI 过长|减少查询参数，检查代理限制。
415|Unsupported Media Type|媒体类型不支持|检查 Content-Type 与实际正文编码。
416|Range Not Satisfiable|范围无法满足|检查 Range 与资源总长度。
417|Expectation Failed|期望条件失败|检查 Expect 请求头。
418|(Unused)|未使用；历史称 I'm a teapot|IANA 当前标记未使用，茶壶含义来自历史协议。
421|Misdirected Request|请求发往错误服务|检查连接复用、主机与 TLS 路由。
422|Unprocessable Content|内容无法处理|格式可读但语义不满足要求；旧称 Unprocessable Entity。
423|Locked|资源被锁定（WebDAV）|检查锁状态与锁令牌。
424|Failed Dependency|依赖操作失败|先检查关联操作的失败原因。
425|Too Early|过早发送请求|避免重放风险，按协议在握手后重试。
426|Upgrade Required|需要升级协议|检查 Upgrade 响应头。
428|Precondition Required|要求条件请求|按接口要求提供 If-Match 等条件。
429|Too Many Requests|请求过多|触发限流，降低频率并检查 Retry-After。
431|Request Header Fields Too Large|请求头过大|缩减 Cookie、令牌或其他请求头。
451|Unavailable For Legal Reasons|因法律原因不可用|查看响应解释及相关链接。
500|Internal Server Error|服务器内部错误|检查服务端日志、异常和关联请求标识。
501|Not Implemented|服务器未实现能力|确认服务端是否支持请求功能。
502|Bad Gateway|网关收到无效上游响应|检查代理与上游服务连接。
503|Service Unavailable|服务暂不可用|检查维护、负载、健康状态及 Retry-After。
504|Gateway Timeout|网关等待上游超时|检查上游耗时与代理超时设置。
505|HTTP Version Not Supported|HTTP 版本不支持|核对客户端、代理和服务器协议版本。
506|Variant Also Negotiates|内容协商循环|检查服务器内容协商配置。
507|Insufficient Storage|存储空间不足（WebDAV）|检查服务端存储与配额。
508|Loop Detected|检测到循环（WebDAV）|检查资源绑定或遍历循环。
510|Not Extended|未扩展（已废弃）|历史扩展框架状态，不建议新系统使用。
511|Network Authentication Required|网络需要认证|常见于网络接入门户，区别于站点 401。`
export const httpStatuses=data.split('\n').map(line=>{const [code,name,meaning,hint]=line.split('|');return {code:Number(code),name:name!,meaning:meaning!,hint:hint!}})
export function searchStatuses(query:string,category:string){
 const q=query.trim().toLowerCase()
 return httpStatuses.filter(r=>(!category||String(r.code).startsWith(category))&&[String(r.code),r.name,r.meaning,r.hint].some(s=>s.toLowerCase().includes(q)))
}
