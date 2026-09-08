/**
 * Serialize async tasks per string key. Tasks with the same key run strictly
 * one after another, tasks with different keys run concurrently, and each
 * task's rejection is isolated: it never blocks later tasks with the same key.
 */
export declare class PerKeyQueue {
    private readonly tails;
    /** Run `task` after any previously queued task with the same key settles. */
    enqueue<T>(key: string, task: () => Promise<T>): Promise<T>;
    /** Wait for all queued tasks to settle; the queue remains usable afterwards. */
    drain(): Promise<void>;
}
//# sourceMappingURL=keyed-queue.d.ts.map