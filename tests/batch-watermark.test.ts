import { describe, expect, it } from 'vitest'
import { relativeMarks } from '../src/tools/watermark/batch'
describe('batch watermark layout', () => {
  it('scales position by each axis and text by short edge without mutating the template', () => {
    const marks = [{ id: 1, text: 'test', x: 900, y: 400, size: 50, opacity: 30, angle: -25, color: '#000' }]
    const portrait = relativeMarks(marks, { width: 1000, height: 500 }, { width: 500, height: 1000 })
    expect(portrait[0]).toEqual({ ...marks[0], x: 450, y: 800, size: 50 })
    expect(relativeMarks(marks, { width: 1000, height: 500 }, { width: 2000, height: 1000 })[0].size).toBe(100)
    expect(marks[0].x).toBe(900)
  })
})
