/**
 * Serialize async tasks per string key. Tasks with the same key run strictly
 * one after another, tasks with different keys run concurrently, and each
 * task's rejection is isolated: it never blocks later tasks with the same key.
 */
export class PerKeyQueue {
    tails = new Map();
    /** Run `task` after any previously queued task with the same key settles. */
    enqueue(key, task) {
        const previous = this.tails.get(key) ?? Promise.resolve();
        const run = previous.then(task);
        this.tails.set(key, run.then(() => undefined, () => undefined));
        return run;
    }
    /** Wait for all queued tasks to settle; the queue remains usable afterwards. */
    async drain() {
        const tails = [...this.tails.values()];
        this.tails.clear();
        await Promise.allSettled(tails);
    }
}
//# sourceMappingURL=keyed-queue.js.map