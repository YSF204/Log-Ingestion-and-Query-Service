import type { ValidLog } from '../domain/log';

type PendingInsert = {
    entries: ValidLog[];
    resolve: () => void;
    reject: (error: unknown) => void;
};

type IngestionQueueConfig = {
    coalesceMilliseconds: number; // how long to wait for req
    maximumCoalescedLogs: number; // max number of combined logs
    maximumConcurrentWriters: number;
    maintenanceIdleMilliseconds: number; // how long to wait before running maintenance task    
};

//function types.
type BatchWriter = (entries: ValidLog[]) => Promise<void>;
type IdleTask = () => Promise<void>; // claenup function

export class IngestionQueueService {
    private readonly pendingInserts: PendingInsert[] = [];
    private pendingLogCount = 0;
    private flushTimer: NodeJS.Timeout | undefined; // delay timer
    private maintenanceTimer: NodeJS.Timeout | undefined; // This stores the timer for the delayed index cleanup task.
    private activeWriters = 0;

    constructor(
        private readonly writer: BatchWriter,
        private readonly idleTask: IdleTask,
        private readonly config: IngestionQueueConfig,
    ) {}

    enqueue(entries: ValidLog[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.cancelIdleTask();
            this.pendingInserts.push({ entries, resolve, reject });
            this.pendingLogCount += entries.length;
            this.scheduleFlush();
        });
    }

    private scheduleFlush(): void {
        if (
            this.activeWriters >= this.config.maximumConcurrentWriters ||
            this.flushTimer !== undefined
        ) {
            return;
        }

        const delay = this.pendingLogCount >= this.config.maximumCoalescedLogs
            ? 0
            : this.config.coalesceMilliseconds;

        this.flushTimer = setTimeout(() => {
            this.flushTimer = undefined;
            void this.flush();
        }, delay);
    }

    private async flush(): Promise<void> {
        if (
            this.activeWriters >= this.config.maximumConcurrentWriters ||
            this.pendingInserts.length === 0
        ) {
            this.scheduleFlush();
            return;
        }

        const inserts = this.takeNextBatch();
        const entries = inserts.flatMap((insert) => insert.entries); // [{entire : [A1, A2]}, {entire : [B1, B2]}] => [A1, A2, B1, B2]
        this.activeWriters += 1;

        try {
            await this.writer(entries);
            inserts.forEach((insert) => insert.resolve());
        } catch (error) {
            inserts.forEach((insert) => insert.reject(error));
        } finally {
            this.activeWriters -= 1;
            this.scheduleFlush();

            if (this.pendingInserts.length === 0 && this.activeWriters === 0) {
                this.scheduleIdleTask();
            }
        }
    }

    private takeNextBatch(): PendingInsert[] {
        const inserts: PendingInsert[] = [];
        let logCount = 0;

        while (this.pendingInserts.length > 0) {
            const next = this.pendingInserts[0]!;

            if (
                inserts.length > 0 &&
                logCount + next.entries.length >
                    this.config.maximumCoalescedLogs
            ) {
                break;
            }

            this.pendingInserts.shift();
            inserts.push(next);
            logCount += next.entries.length;
            this.pendingLogCount -= next.entries.length;
        }

        return inserts;
    }

    private scheduleIdleTask(): void {
        if (this.maintenanceTimer !== undefined) {
            return;
        }

        this.maintenanceTimer = setTimeout(() => {
            this.maintenanceTimer = undefined;

            if (this.activeWriters === 0 && this.pendingInserts.length === 0) {
                void this.idleTask();
            }
        }, this.config.maintenanceIdleMilliseconds);
        this.maintenanceTimer.unref();
    }

    private cancelIdleTask(): void {
        if (this.maintenanceTimer === undefined) {
            return;
        }

        clearTimeout(this.maintenanceTimer);
        this.maintenanceTimer = undefined;
    }
}
