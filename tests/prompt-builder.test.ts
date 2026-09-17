import { describe, expect, it } from 'vitest'
import { buildStaticPrompt } from '../src/tools/prompt/builder'
import { dimensions } from '../src/tools/prompt/settings'

describe('通用静态提示词', () => {
  const original = '  请解释 <script>alert(1)</script>\r\n保留 emoji 😀 和 SQL SELECT * FROM t;\n '
  it('保留原文空白、换行、代码和特殊字符', () => {
    expect(buildStaticPrompt(original, dimensions)).toContain('原始需求：\n' + original + '\n\n')
  })
  it('未选择维度时原样返回，不增加标题', () => {
    expect(buildStaticPrompt(original, [])).toBe(original)
  })
  it.each(['', ' \r\n\t '])('拒绝空白输入 %j', value => {
    expect(() => buildStaticPrompt(value, [])).toThrow('请先输入')
  })
  it('仅增加选中的维度，并去重及忽略未知选项', () => {
    const output = buildStaticPrompt('写说明', ['限制条件', '限制条件', '不存在'])
    expect(output).toContain('限制条件：')
    expect(output.match(/限制条件：/g)).toHaveLength(1)
    expect(output).not.toContain('角色：')
    expect(output).not.toContain('处理步骤：')
    expect(output).not.toContain('背景上下文：')
  })
  it('选择顺序不影响结果；缺失背景使用占位符', () => {
    expect(buildStaticPrompt('分析需求', [...dimensions].reverse())).toBe(buildStaticPrompt('分析需求', dimensions))
    expect(buildStaticPrompt('分析需求', ['背景上下文'])).toContain('［请补充')
  })
  it('取消限制维度不会删除原文中的约束', () => {
    expect(buildStaticPrompt('不要联网，只输出 JSON', ['任务目标'])).toContain('不要联网，只输出 JSON')
  })
})
