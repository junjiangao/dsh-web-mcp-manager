/**
 * Serialize async tasks per string key. Tasks with the same key run strictly
 * one after another, tasks with different keys run concurrently, and each
 * task's rejection is isolated: it never blocks later tasks with the same key.
 */
export class PerKeyQueue {
  private readonly tails = new Map<string, Promise<void>>()

  /** Run `task` after any previously queued task with the same key settles. */
  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    const run = previous.then(task)
    this.tails.set(key, run.then(() => undefined, () => undefined))
    return run
  }

  /** Wait for all queued tasks to settle; the queue remains usable afterwards. */
  async drain(): Promise<void> {
    const tails = [...this.tails.values()]
    this.tails.clear()
    await Promise.allSettled(tails)
  }
}
