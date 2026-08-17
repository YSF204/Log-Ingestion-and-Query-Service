function readPositiveInteger(
    value: string | undefined,
    fallback: number,
): number {
    if (value === undefined) {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const ingestionConfig = {
    coalesceMilliseconds: readPositiveInteger(
        process.env.INGEST_COALESCE_MS,
        50,
    ),
    maximumCoalescedLogs: readPositiveInteger(
        process.env.INGEST_MAX_COALESCED_LOGS,
        10_000,
    ),
    maximumConcurrentWriters: readPositiveInteger(
        process.env.INGEST_MAX_CONCURRENT_WRITERS,
        3,
    ),
    indexCleanupIdleMilliseconds: readPositiveInteger(
        process.env.GIN_CLEANUP_IDLE_MS,
        60_000,
    ),
};
