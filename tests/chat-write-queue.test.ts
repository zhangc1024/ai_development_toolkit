import { describe, expect, it } from 'vitest'
import { createWriteQueue } from '../src/tools/chat/write-queue'
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
describe('聊天写入队列', () => {
  it('慢存储期间合并中间快照，只保存最新正文和结束状态', async () => {
    const queue = createWriteQueue(), started = deferred(), gate = deferred(), calls: string[] = []
    const first = queue.save('a', async () => { started.resolve(); await gate.promise; calls.push('first') })
    await started.promise
    for (let i = 0; i < 100; i++) void queue.save('a', async () => { calls.push('chunk-' + i) })
    const last = queue.save('a', async () => { calls.push('complete') })
    gate.resolve(); await Promise.all([first, last]); await queue.flush()
    expect(calls).toEqual(['first', 'complete'])
  })
  it('保存不跨越删除屏障合并，不会在删除完成后恢复旧会话', async () => {
    const queue = createWriteQueue(), calls: string[] = []
    const a = queue.save('a', async () => { calls.push('old') })
    const b = queue.mutate(async () => { calls.push('clear') })
    const c = queue.save('a', async () => { calls.push('new') })
    await Promise.all([a, b, c])
    expect(calls).toEqual(['old', 'clear', 'new'])
  })
  it('一笔失败不会阻塞之后的重试和删除', async () => {
    const queue = createWriteQueue(), calls: string[] = []
    await expect(queue.save('a', async () => { throw Error('quota') })).rejects.toThrow('quota')
    await queue.save('a', async () => { calls.push('retry') })
    await queue.mutate(async () => { calls.push('delete') })
    expect(calls).toEqual(['retry', 'delete'])
  })
})
