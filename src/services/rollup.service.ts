import type { PoolClient } from 'pg';

export type RollupEvent = {
    timestamp: string | Date;
    service: string;
    level: string;
};

export type RollupDelta = {
    bucketStart: Date;
    service: string;
    level: string;
    count: number;
};

type SqlValues = {
    placeholders: string;
    parameters: Array<Date | string | number>;
};

const ROLLUP_SHARDS = 16;
let nextRollupShard = 0;

export function groupRollupDeltas(entries: RollupEvent[]): RollupDelta[] {
    const grouped = new Map<string, RollupDelta>();

    for (const entry of entries) {
        const bucketStart = getMinuteBucketStart(entry.timestamp);
        const key = [
            bucketStart.toISOString(),
            entry.service,
            entry.level,
        ].join('\u0000');
        const existing = grouped.get(key);

        if (existing) {
            existing.count += 1;
            continue;
        }

        grouped.set(key, {
            bucketStart,
            service: entry.service,
            level: entry.level,
            count: 1,
        });
    }

    return [...grouped.values()];
}

export async function incrementRollups(
    client: PoolClient,
    deltas: RollupDelta[],
): Promise<void> {
    await insertRollupDeltas(client, deltas);
}

export async function decrementRollups(
    client: PoolClient,
    deltas: RollupDelta[],
): Promise<void> {
    await insertRollupDeltas(
        client,
        deltas.map((delta) => ({
            ...delta,
            count: -delta.count,
        })),
    );
}

async function insertRollupDeltas(
    client: PoolClient,
    deltas: RollupDelta[],
): Promise<void> {
    if (deltas.length === 0) {
        return;
    }

    const values = buildSqlValues(deltas);
    const shard = nextRollupShard;
    nextRollupShard = (nextRollupShard + 1) % ROLLUP_SHARDS;

    await client.query(
        `
            INSERT INTO log_rollups (
                bucket_start, service, level, shard, count
            )
            VALUES ${values.placeholders}
            ON CONFLICT (bucket_start, service, level, shard)
            DO UPDATE SET count = log_rollups.count + EXCLUDED.count
        `,
        [shard, ...values.parameters],
    );
}

function getMinuteBucketStart(timestamp: string | Date): Date {
    const milliseconds = new Date(timestamp).getTime();
    return new Date(Math.floor(milliseconds / 60_000) * 60_000);
}

function buildSqlValues(deltas: RollupDelta[]): SqlValues {
    const placeholders: string[] = [];
    const parameters: Array<Date | string | number> = [];

    deltas.forEach((delta, index) => {
        const offset = index * 4 + 1;
        placeholders.push(
            `($${offset + 1}::timestamptz, $${offset + 2}::text, ` +
            `$${offset + 3}::text, $1::integer, $${offset + 4}::bigint)`,
        );
        parameters.push(
            delta.bucketStart,
            delta.service,
            delta.level,
            delta.count,
        );
    });

    return {
        placeholders: placeholders.join(', '),
        parameters,
    };
}
