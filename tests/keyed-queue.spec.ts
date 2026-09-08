import { describe, expect, it } from 'vitest'
import { PerKeyQueue } from '../src/host/keyed-queue.ts'

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

describe('PerKeyQueue', () => {
  it('runs tasks with the same key strictly in order', async () => {
    const queue = new PerKeyQueue()
    const first = deferred()
    const order: string[] = []
    const task1 = queue.enqueue('a', async () => { order.push('1-start'); await first.promise; order.push('1-end') })
    const task2 = queue.enqueue('a', async () => { order.push('2') })
    await Promise.resolve()
    expect(order).toEqual(['1-start'])
    first.resolve()
    await task1
    await task2
    expect(order).toEqual(['1-start', '1-end', '2'])
  })

  it('does not block tasks with different keys', async () => {
    const queue = new PerKeyQueue()
    const first = deferred()
    const done: string[] = []
    const taskA = queue.enqueue('a', async () => { await first.promise; done.push('a') })
    await queue.enqueue('b', async () => { done.push('b') })
    expect(done).toEqual(['b'])
    first.resolve()
    await taskA
    expect(done).toEqual(['b', 'a'])
  })

  it('isolates failures and keeps the queue usable', async () => {
    const queue = new PerKeyQueue()
    await expect(queue.enqueue('a', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(queue.enqueue('a', async () => 'ok')).resolves.toBe('ok')
  })

  it('drain waits for all queued tasks to settle', async () => {
    const queue = new PerKeyQueue()
    const first = deferred()
    const second = deferred()
    const task1 = queue.enqueue('a', async () => { await first.promise })
    const task2 = queue.enqueue('b', async () => { await second.promise })
    let drained = false
    const drain = queue.drain().then(() => { drained = true })
    await Promise.resolve()
    expect(drained).toBe(false)
    first.resolve()
    second.resolve()
    await task1
    await task2
    await drain
    expect(drained).toBe(true)
  })

  it('returns each task result and propagates rejections', async () => {
    const queue = new PerKeyQueue()
    await expect(queue.enqueue('a', async () => 42)).resolves.toBe(42)
    await expect(queue.enqueue('a', async () => { throw new Error('x') })).rejects.toThrow('x')
  })
})
