import type { WorkbenchKind } from './types'
export const workbenchConfig: Record<WorkbenchKind, { title: string; category: string; description: string; action: string; sample: string; rules: string[] }> = {
  jwt: { title: 'JWT 解析', category: '安全与签名', description: '查看 Header、Payload、签名段与时间声明。解析结果始终未验签。', action: '解析 JWT', sample: '',
    rules: ['支持三段 JWT/JWS，可粘贴带 Bearer 前缀的 Token；不支持五段 JWE 和 b64=false。', 'Header/Payload 必须为 JSON 对象；拒绝重复顶层字段。大整数保持原文，输出不会重新生成 Token。', 'iat、nbf、exp 按 NumericDate 秒解释。时间提示基于点击解析时的设备时间，不验证签名、签发者、受众或权限。'] },
  hash: { title: 'MD5 / SHA 哈希', category: '安全与签名', description: '按明确的输入字节计算摘要，支持 UTF-8、Hex 和 Base64。', action: '计算哈希', sample: 'abc',
    rules: ['提供 MD5、SHA-1、SHA-256、SHA-512；支持小写 Hex、大写 Hex 和 Base64 输出。', '首尾空格、换行、BOM 都参与摘要。Hex 不接受 0x 或空格；Base64 不接受空白和 URL 字母表。空消息允许计算。', 'MD5 / SHA-1 用于旧系统兼容与非安全校验，不适合作为抗碰撞安全方案。哈希不是加密，也不是密码存储方案。'] },
  hmac: { title: 'HMAC 签名', category: '安全与签名', description: '使用消息与密钥计算 HMAC，便于联调接口签名。', action: '计算签名', sample: 'The quick brown fox jumps over the lazy dog',
    rules: ['消息和密钥分别选择 UTF-8、Hex 或 Base64；默认 HMAC-SHA-256。输出支持 Hex 与 Base64。', '默认不接受空密钥；仅测试时可明确开启。密钥不写入 URL、历史记录或导出文件。清空与离开页面会清除页面中的密钥。', '这是原始 HMAC 计算，不自动排序参数、拼接请求或实现支付平台签名协议；旧算法仅供兼容。'] },
  sql: { title: 'SQL 格式化', category: '数据处理', description: '整理 MySQL 语句的缩进与关键字，让查询更容易阅读。', action: '格式化 SQL',
    sample: "select u.id,u.name,count(o.id) as order_count from users u left join orders o on o.user_id=u.id where u.status=1 and o.created_at>='2026-01-01' group by u.id,u.name order by order_count desc limit 20;",
    rules: ['当前支持 MySQL，提供 2 / 4 空格和 Tab 缩进，关键字可大写、小写或保留原样。', '支持常见查询、多语句、注释与占位符；不替换参数，不删除注释，不提供 SQL 执行或数据库连接。', '格式化成功不代表 SQL 语法或业务语义正确。存储过程、DELIMITER 和部分方言扩展不保证支持。'] },
}
