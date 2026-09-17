# RSA 加密 / 解密

入口：安全与签名 → RSA 加密 / 解密，地址 `#/rsa`。

## 功能

- 生成 2048 / 3072 / 4096 位 RSA 密钥，默认 3072 位，公钥指数 65537。
- 公钥生成格式为 SPKI PEM；私钥可选 PKCS#8（默认）或 PKCS#1，均不带密码。
- 加密导入 SPKI / PKCS#1 公钥；解密导入 PKCS#8 / PKCS#1 未加密私钥。
- UTF-8 明文、公钥加密、私钥解密；密文选择 Base64 或 Hex。
- 默认 OAEP SHA-256，同时支持 OAEP SHA-1 和 RSAES-PKCS1-v1_5 以兼容已有系统。
- OAEP 的 MGF1 哈希与消息哈希相同，Label 为空。PKCS#1 v1.5 可对应 PHP 的 OPENSSL_PKCS1_PADDING；OAEP 对接时必须确认双方的哈希参数。
- 复制、下载公钥 / 私钥 / 结果，结果作为输入，清空全部。

## 限制与行为

不支持加密私钥、证书、OpenSSH、二进制明文、签名验签或分段密文。生成私钥格式与加密填充是独立设置。

单块明文上限为密钥字节数减 11（v1.5），或减 2 × 哈希字节数 + 2（OAEP）。2048 位分别为 245 / 214 / 190 字节（v1.5 / OAEP SHA-1 / OAEP SHA-256）。中文按 UTF-8 字节计算，超限拒绝，不自动切块。

解密忽略密文中的空白，严格检查 Base64 / Hex 编码与密文字节长度。解密失败统一提示检查参数，不返回部分明文。空字符串可加密、解密。随机填充使同一明文每次产生不同密文。

密钥输入上限 64 KiB，消息输入上限 16 KiB。支持的导入密钥长度同生成选项。操作在独立 Worker 中执行，生成超时 60 秒，加解密超时 10 秒；输入 / 选项变更、清空及离开页面均终止任务并清除旧结果。

## 实现与隐私

- 生成使用浏览器 Web Crypto，要求 HTTPS 或 localhost。
- node-forge 打包进入本地 Worker，负责 PEM 兼容和 RSA 加解密，无 CDN、API 或服务器处理。
- 页面使用现有 CodeEditor、复制和下载平台接口。
- 密钥、消息和结果不持久化、不记录日志；仅用户主动点击时复制或下载。下载私钥是未加密 PEM。
- JavaScript 内存清空不等同于物理擦除。此处是本地开发工具，不将 PKCS#1 v1.5 解密封装成对外服务。

算法接口参考：[node-forge](https://github.com/digitalbazaar/forge#rsa)、[Web Crypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey)。

## 验证

`tests/rsa.test.ts` 覆盖 Node/OpenSSL 交叉互通、三种填充、两种密文编码、PEM 格式、三种生成位数、UTF-8、最大字节边界、错误参数 / 密钥 / 密文与二进制拒绝。

上线前在目标浏览器核对剪贴板与下载权限，以及部署环境 Worker 的 MIME、CSP 和 HTTPS 配置。
