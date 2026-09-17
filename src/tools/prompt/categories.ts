import { categories } from './settings'

const rules: [string, RegExp][] = [
  ['翻译', /翻译|译成|译为|\btranslat(?:e|ion)\b/i],
  ['代码解释', /(?:解释|讲解|读懂|理解).{0,15}(?:代码|函数|方法|sql)|(?:代码|函数).{0,8}(?:解释|含义)|\bexplain\b.{0,30}\b(code|function|sql)\b/i],
  ['Bug 排查', /报错|排查|异常|故障|调试|\b(bug|error|debug|exception|traceback)\b/i],
  ['图片生成提示词', /生图|文生图|画一|绘制|生成.{0,8}(?:图片|图像|插画)|图片.{0,8}提示词|\b(midjourney|stable diffusion|text.to.image)\b/i],
  ['产品需求', /产品需求|需求文档|用户故事|验收标准|\bprd\b/i],
  ['数据分析', /数据分析|统计分析|数据可视化|趋势分析|\b(data analysis|pandas)\b/i],
  ['SQL / 数据库', /数据库|索引|执行计划|\b(mysql|sql|postgresql|redis|mongodb|explain)\b/i],
  ['编程开发', /编程|开发|接口|写.{0,8}(?:代码|函数|脚本)|\b(php|vue|javascript|typescript|python|java|golang|react|api)\b/i],
  ['文本写作', /写作|文案|润色|文章|邮件|周报|总结|\b(copywriting|essay|writing)\b/i],
]
export function resolveCategory(prompt: string, category = '自动识别'): string {
  if (category !== '自动识别' && categories.includes(category)) return category
  return rules.find(([, pattern]) => pattern.test(prompt))?.[0] ?? '通用'
}

export interface CategoryTemplate { role: string; context: string; steps: string; output: string }
export const templates: Record<string, CategoryTemplate> = {
  '编程开发': { role: '资深软件开发工程师', context: '技术栈、运行环境、输入输出、现有代码与兼容要求', steps: '梳理接口与业务边界；提供最小可执行实现；说明异常处理和验证方法', output: '实现思路、代码、使用方法、测试与限制' },
  'SQL / 数据库': { role: '数据库设计与性能优化工程师', context: '数据库版本、SQL、表结构、索引、数据量及执行计划', steps: '依据实际 SQL 与执行计划检查扫描、关联和索引；给出改写与索引建议；说明验证方法与写入成本', output: '问题依据、SQL / 索引建议、验证步骤、注意事项' },
  '代码解释': { role: '擅长代码讲解的软件工程师', context: '待解释代码、相关依赖和希望了解的重点', steps: '概括用途；说明输入输出与关键执行流程；标注边界和不确定的外部依赖', output: '整体用途、分段说明、关键数据流、注意事项' },
  'Bug 排查': { role: '软件故障排查工程师', context: '错误日志、相关代码、运行环境、复现步骤与预期行为', steps: '区分已知事实与猜测；按可能性列出原因及验证步骤；给出最小修复与回归检查', output: '症状、可能原因、排查步骤、修复建议、回归验证' },
  '产品需求': { role: '产品需求分析师', context: '目标用户、业务问题、现有流程和版本边界', steps: '明确用户目标；拆解主流程与异常流程；定义范围及可验证的验收标准', output: '目标与范围、用户流程、功能要求、边界、验收标准' },
  '文本写作': { role: '文字编辑', context: '目标读者、用途、语气、长度和需要保留的信息', steps: '确认主题与读者；组织内容结构；检查事实、语气与表达一致性', output: '遵循指定体裁输出正文，必要时简要说明待补充信息' },
  '翻译': { role: '专业翻译人员', context: '目标语言、使用场景、专业术语与格式要求', steps: '保留原意、语气、数字和专有名词；处理上下文歧义；检查术语一致性，不擅自扩写', output: '优先仅输出译文；存在影响准确性的歧义时简要标注' },
  '数据分析': { role: '数据分析师', context: '数据样本、字段含义、统计口径与分析目标', steps: '检查数据质量；选择合适的分析方法；区分相关性与因果；说明结论的适用范围', output: '数据与假设、分析方法、结果、局限与建议' },
  '图片生成提示词': { role: '图像创作提示词设计师', context: '画面主体、风格、构图、光线、比例和需要避免的元素', steps: '明确主体与场景；组织构图、光线与风格描述；保留原始要求，不加入无关主体', output: '可直接使用的图像提示词；仅在用户需要时补充负面提示词' },
}
