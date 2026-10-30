/** Coalesce waiting saves; destructive operations are ordered barriers. */
export function createWriteQueue() {
  let tail = Promise.resolve()
  const pending = new Map<string, { run: () => Promise<void>; promise: Promise<void> }>()
  function enqueue(run: () => Promise<void>) {
    const result = tail.then(run)
    tail = result.catch(() => {})
    return result
  }
  return {
    save(id: string, run: () => Promise<void>) {
      const previous = pending.get(id)
      if (previous) { previous.run = run; return previous.promise }
      const task = { run, promise: Promise.resolve() }
      task.promise = enqueue(async () => {
        if (pending.get(id) === task) pending.delete(id)
        await task.run()
      })
      pending.set(id, task)
      return task.promise
    },
    mutate(run: () => Promise<void>) { pending.clear(); return enqueue(run) },
    flush() { return tail },
  }
}
// Shared across component remounts so a departing page cannot race the next page.
export const chatWrites = createWriteQueue()
