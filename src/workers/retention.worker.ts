import { RETENTION_DAYS } from '../config/retention';
import { calculateRetentionCutoff } from '../domain/retention';
import { deleteExpiredLogs } from '../services/retention.service';

const RETENTION_BATCH_SIZE = 10_000;
const RETENTION_INTERVAL_MS = 60_000;

let workerStarted = false;

async function runRetentionCycle(): Promise<void> {
    const startedAt = Date.now();
    const cutoff = calculateRetentionCutoff(new Date(), RETENTION_DAYS);

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
