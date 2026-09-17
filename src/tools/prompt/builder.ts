import { dimensions, type OutputLanguage } from './settings'
import { resolveCategory, templates } from './categories'

import { englishSections, englishTemplates } from './english'

const sections: Record<string, string> = {
  专家角色: '角色：\n请以与原始需求相关的专业人员视角提供帮助。',
  任务目标: '任务目标：\n完成原始需求中明确提出的任务，保留其意图与范围。',
  背景上下文: '背景上下文：\n［请补充适用场景、已有资料和必要的环境信息］\n未提供的信息请明确标注，不要当作已知事实。',
  分析步骤: '处理步骤：\n1. 明确任务与已有信息，指出需要补充的内容。\n2. 给出可执行的处理方案及关键依据。\n3. 说明如何检查结果是否满足原始需求。',
  输出格式: '输出格式：\n优先遵循原始需求指定的格式；未指定时，按结果、关键依据和后续建议组织内容。',
  限制条件: '限制条件：\n不要改变原始意图，不虚构事实或数据。\n不确定的信息需明确说明，避免无关扩展。',
  示例要求: '示例要求：\n在有助于理解时提供简短示例，并明确标注示例及假设，不将其表述为用户提供的事实。',
}

export function buildStaticPrompt(prompt: string, selected: readonly string[], category = '通用', language: OutputLanguage = 'zh'): string {
  if (!prompt.trim()) throw new Error('请先输入需要优化的提示词。')
  const english = language === 'en'
  const template = (english ? englishTemplates : templates)[resolveCategory(prompt, category)]
  const base = english ? englishSections : sections
  if (english) {
    const resolved = template ? {
      ...base,
      专家角色: 'Role:\nAct as a ' + template.role + ' to help complete the original request.',
      背景上下文: 'Context:\n[Please provide as needed: ' + template.context + '.]\nIdentify missing information; do not invent facts.',
      分析步骤: 'Steps:\n' + template.steps + '.',
      输出格式: 'Output format:\nFollow the format specified in the original request. Otherwise, use: ' + template.output + '.',
    } : base
    const additions = dimensions.filter(item => selected.includes(item)).map(item => resolved[item])
    return additions.length ? ['Original request:\n' + prompt, ...additions].join('\n\n') : prompt
  }
  const resolved = template ? {
    ...sections,
    专家角色: '角色：\n请以' + template.role + '的视角帮助完成原始需求。',
    背景上下文: '背景上下文：\n［请按需补充：' + template.context + '］\n缺失信息请明确指出，不要虚构。',
    分析步骤: '处理步骤：\n' + template.steps + '。',
    输出格式: '输出格式：\n优先遵循原始需求的格式；未指定时使用：' + template.output + '。',
  } : sections
  const additions = dimensions.filter(item => selected.includes(item)).map(item => resolved[item])
  if (!additions.length) return prompt
  return ['原始需求：\n' + prompt, ...additions].join('\n\n')
}

