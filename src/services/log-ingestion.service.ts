import { ingestionConfig } from '../config/ingestion';
import type { ValidLog } from '../domain/log';
import { cleanAttributeIndex } from '../repositories/attribute-index.repository';
import { writeLogBatch } from '../repositories/log-write.repository';
import { IngestionQueueService } from './ingestion-queue.service';

const ingestionQueue = new IngestionQueueService(
    writeLogBatch,
    maintainAttributeIndex,
    {
        coalesceMilliseconds: ingestionConfig.coalesceMilliseconds,
        maximumCoalescedLogs: ingestionConfig.maximumCoalescedLogs,
        maintenanceIdleMilliseconds:
            ingestionConfig.indexCleanupIdleMilliseconds,
    },
);

export function insertLogs(entries: ValidLog[]): Promise<void> {
    return ingestionQueue.enqueue(entries);
}

async function maintainAttributeIndex(): Promise<void> {
    try {
        await cleanAttributeIndex();
    } catch (error) {
        console.error('attribute index cleanup failed', error);
    }
}
