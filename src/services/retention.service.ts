import { deleteExpiredLogBatch } from '../repositories/retention.repository';

export async function deleteExpiredLogs(
    cutoff: Date,
    batchSize: number,
): Promise<number> {
    validateRetentionArguments(cutoff, batchSize);
    return deleteExpiredLogBatch(cutoff, batchSize);
}

function validateRetentionArguments(cutoff: Date, batchSize: number): void {
    if (Number.isNaN(cutoff.getTime())) {
        throw new Error('cut off must be a valid date');
    }

    if (!Number.isInteger(batchSize) || batchSize <= 0) {
        throw new Error('batchSize must be a positive integer');
    }
}
