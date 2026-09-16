import type { EncodingKind } from './core'
export const encodingConfigs: Record<EncodingKind, { title: string; description: string; defaultMode: string; options: { value: string; label: string; hint: string }[]; sample: string; rules: string[] }> = {
  url: {
    title: 'URL 编解码', description: '明确区分链接与参数，准确处理百分号、空格和加号。', defaultMode: 'component',
    options: [
      { value: 'component', label: 'URL 参数 / 组件', hint: 'encodeURIComponent / decodeURIComponent：编码 &、=、/ 等分隔符；空格为 %20，加号不作为空格解码。' },
      { value: 'uri', label: '完整 URL', hint: 'encodeURI / decodeURI：保留 : / ? # & = 等 URL 分隔符；解码时保留对应的百分号转义，例如 %2F。' },
      { value: 'form', label: '表单单个值', hint: 'application/x-www-form-urlencoded：空格编码为 +，原始 + 编码为 %2B。只处理一个值，不解析整段 Query。' },
    ],
    sample: 'https://example.com/search?q=中文 开发&tag=C++',
    rules: ['根据输入是一个参数还是完整链接选择模式；不要把表单单值模式当作整段查询串解析器。', '每次只解码一层，%2520 解码为 %20；无效 %XX 或非 UTF-8 字节会报错。', '不自动补协议、不判断 URL 是否可访问，也不会访问输入中的地址。'],
  },
  base64: {
    title: 'Base64 编解码', description: 'UTF-8 文本与 Base64 互转，支持中文、emoji 和 URL 安全格式。', defaultMode: 'standard',
    options: [
      { value: 'standard', label: '标准 Base64', hint: '使用 A–Z、a–z、0–9、+、/；编码带 = 填充。解码接受规范填充或省略填充。' },
      { value: 'url', label: 'Base64URL', hint: '使用 - 和 _ 替代 + 和 /；编码省略 =。解码不混用标准 Base64 字母表。' },
    ],
    sample: '你好，DevKit 👋\n纯前端开发工具箱',
    rules: ['输入文本按 UTF-8 编码，解码也必须得到有效 UTF-8 文本；不支持任意二进制或 Data URL。', '可选择忽略空格、Tab、CR、LF；其他字符、错误填充、非零填充位会报错。', 'Base64 是编码，不是加密。BOM、换行和首尾空白作为文本内容保留。'],
  },
  unicode: {
    title: 'Unicode 编解码', description: 'Unicode 转义与还原，支持中文、emoji、代理对和码点写法。', defaultMode: 'non-ascii',
    options: [
      { value: 'non-ascii', label: '非 ASCII + 控制字符', hint: '非 ASCII、控制字符和反斜杠转换为 \\uXXXX；可读 ASCII 保持原样。' },
      { value: 'all', label: '全部字符', hint: '所有 UTF-16 单元转换为 \\uXXXX；emoji 输出两个代理项。选项仅影响编码。' },
    ],
    sample: '你好，DevKit 😀',
    rules: ['解码支持 \\u4e2d、\\ud83d\\ude00 和 \\u{1F600}；不会去掉外层引号。', '只还原 Unicode 转义，\\n、\\t 等普通转义保持原样。连续两个反斜杠原样保留，不从第二个反斜杠重新匹配。', '每次只处理一层。拒绝残缺转义、越界码点和未配对代理项；位置按 UTF-16 单元从 1 开始计数。'],
  },
  'html-entity': {
    title: 'HTML Entity 编解码', description: 'HTML 命名实体、十进制和十六进制实体转换，始终以文本展示。', defaultMode: 'special',
    options: [
      { value: 'special', label: '仅特殊字符', hint: '编码 & < > " 和单引号；中文、emoji 保持原样。' },
      { value: 'ascii', label: '特殊字符 + 非 ASCII', hint: '特殊字符转为实体，非 ASCII 转为十六进制数字实体。选项仅影响编码。' },
    ],
    sample: '<div title="开发者">Tom & Jerry 的工具箱 😀</div>',
    rules: ['解码支持 &amp;、&copy;、&#20013;、&#x1F600; 等 HTML 实体，必须以分号结束。', '未知实体与缺少分号的内容原样保留；非法数字码点按 HTML 规则替换，不作为严格校验器。', '只解码一层：&amp;lt; → &lt;。结果不是 HTML 预览，也不是通用 XSS 清洗器。'],
  },
}
