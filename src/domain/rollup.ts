import type { RollupEvent } from './log';

export type RollupDelta = {
    bucketStart: Date;
    service: string;
    level: string;
    count: number;
};

export function groupRollupDeltas(entries: RollupEvent[]): RollupDelta[] {
    const grouped = new Map<string, RollupDelta>();
    const bucketCache = new Map<string | Date, Date>();

    for (const entry of entries) {
        let bucketStart = bucketCache.get(entry.timestamp);

        if (bucketStart === undefined) {
            bucketStart = getMinuteBucketStart(entry.timestamp);
            bucketCache.set(entry.timestamp, bucketStart);
        }

        const key = [
            bucketStart.toISOString(),
            entry.service,
            entry.level,
        ].join('\u0000');
        const existing = grouped.get(key);

        if (existing !== undefined) {
            existing.count += 1;
        } else {
            grouped.set(key, {
                bucketStart,
                service: entry.service,
                level: entry.level,
                count: 1,
            });
        }
    }

    return [...grouped.values()];
}

function getMinuteBucketStart(timestamp: string | Date): Date {
    const milliseconds = new Date(timestamp).getTime();
    return new Date(Math.floor(milliseconds / 60_000) * 60_000);
}
