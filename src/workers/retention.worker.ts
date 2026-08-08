import { RETENTION_DAYS } from '../config/retention';
import { deleteExpiredLogs } from '../services/retention.service';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const RETENTION_BATCH_SIZE = 10_000;
const RETENTION_INTERVAL_MS = 60_000;

let workerStarted = false;

export function calculateRetentionCutoff(
    now: Date,
    retentionDays: number = RETENTION_DAYS,
): Date {
    const retentionTime = retentionDays * MILLISECONDS_PER_DAY;

    return new Date(now.getTime() - retentionTime);
}

async function runRetentionCycle(): Promise<void> {
    const startedAt = Date.now();
    const cutoff = calculateRetentionCutoff(new Date());

    try {
        const deletedCount = await deleteExpiredLogs(
            cutoff,
            RETENTION_BATCH_SIZE,
        );

        if (deletedCount > 0) {
            const durationMs = Date.now() - startedAt;
            console.log(
                `Retention cleanup deleted ${deletedCount} logs ` +
                `older than ${cutoff.toISOString()} ` +
                `in ${durationMs}ms`,
            );
        }
    } catch (error) {
        console.error('Error during retention cleanup:', error);
    } finally {
        setTimeout(() => {
            void runRetentionCycle();
        }, RETENTION_INTERVAL_MS);
    }
}

export function startRetentionWorker(): void {
    if (workerStarted) {
        return;
    }
    workerStarted = true;
    void runRetentionCycle();
}
