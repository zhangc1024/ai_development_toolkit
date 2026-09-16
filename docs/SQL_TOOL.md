# SQL 格式化（#/sql）

## 1. 当前支持

仅 MySQL 方言，在本地整理 SQL 文本。支持常见 SELECT/JOIN/子查询、INSERT/UPDATE/DELETE、多语句、注释、字符串、带引号标识符和常见占位符。

使用 sql-formatter；它是格式化器，不是 SQL 执行引擎或数据库语法验证器。

## 2. 选项

| 选项 | 行为 |
| --- | --- |
| 方言 | 固定为 MySQL，不提供未验证的其他数据库选项 |
| 缩进 | 2 空格（默认）、4 空格、Tab |
| 关键字 | 大写（默认）、小写、保留原样 |
| 自动换行 | 编辑器显示选项，不修改 SQL |
| 语法高亮 | 输入输出使用 CodeMirror MySQL 高亮 |

改变选项会清除旧结果，需重新执行。关键字大小写不应该更改字符串字面量内容。

## 3. 操作

- “格式化 SQL”：校验非空和大小限制后，交给本地 Worker 格式化。
- Ctrl/⌘+Enter：同上。
- “加载示例”：填入带 JOIN、分组与排序的查询并运行。
- 导入：UTF-8 .sql/.txt/.json 文本，最多 1 MiB；不上传。
- 复制：复制完整结果。
- 下载：formatted.sql，UTF-8 text/plain。
- 搜索：两侧独立搜索，Ctrl/⌘+F。
- 清空：清除输入、结果、提示并终止任务。

多语句之间设置空行以方便阅读，不删除注释，也不替换 ? 等占位符。不进行语义级重写、SQL 优化、参数绑定或条件修复。

## 4. 错误和范围

空输入、超出 1 MiB、未闭合字面量或格式化器不支持的语法会提示错误，旧结果不会保留。

并非所有无效 SQL 都会报错；格式化成功不证明能在数据库执行。存储过程、DELIMITER、版本专属语法等不保证支持。

不提供压缩 SQL：简单删除空白/注释可能改变字符串、注释或语句语义。

## 5. 运行与隐私

Worker 中处理，超过 5 秒终止。动态模块加载也在计时内。修改输入/选项或离开页面会终止旧任务。

不连接数据库、不执行输入、不收集连接信息或上传 SQL。输入中的 URL、文件路径、函数名不会被主动调用。刷新和工具切换清空数据。

## 6. 实现与验收

- src/tools/sql/core.ts：MySQL 格式化和选项约束。
- src/tools/workbench/：共享界面与按需加载 Worker。
- src/components/CodeEditor.vue：SQL 语言模式，原有 JSON/文本模式不变。
- tests/workbench.test.ts：字面量、注释、标识符、占位符、多语句、缩进、大小写及错误边界。

发布时必须上传 dist/assets 全部文件；SQL 格式化器是 Worker 动态加载的模块，不能只上传 Worker 入口文件。

参考：[sql-formatter](https://github.com/sql-formatter-org/sql-formatter)。
