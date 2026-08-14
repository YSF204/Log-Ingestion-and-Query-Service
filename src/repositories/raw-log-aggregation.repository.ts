import { and, asc, sql } from 'drizzle-orm';

import { readDb } from '../db/client';
import { logs } from '../db/schema';
import type { AggregationResult } from '../domain/aggregation';
import type { AggregateQuery } from '../schemas/log-aggregation-query';
import { buildLogFilterConditions } from './log-filter.builder';

const BUCKET_INTERVALS = {
    '1m': sql`INTERVAL '1 minute'`,
    '5m': sql`INTERVAL '5 minutes'`,
    '1h': sql`INTERVAL '1 hour'`,
    '1d': sql`INTERVAL '1 day'`,
} as const;

export async function aggregateRawLogs(
    query: AggregateQuery,
): Promise<AggregationResult[]> {
    const conditions = buildLogFilterConditions(query);
    const bucketStart = sql<Date>`
        date_bin(
            ${BUCKET_INTERVALS[query.bucket]},
            ${logs.timestamp},
            TIMESTAMPTZ '1970-01-01 00:00:00+00'
        )
    `.mapWith(toDate);
    const count = sql<number>`count(*)::integer`;

    if (query.group_by === undefined) {
        const rows = await readDb
            .select({ bucketStart, count })
            .from(logs)
            .where(and(...conditions))
            .groupBy(bucketStart)
            .orderBy(asc(bucketStart));

        return rows.map((row) => ({
            bucketStart: row.bucketStart,
            groupValue: null,
            count: row.count,
        }));
    }

    const groupColumn = query.group_by === 'service'
        ? logs.service
        : logs.level;

    return readDb
        .select({ bucketStart, groupValue: groupColumn, count })
        .from(logs)
        .where(and(...conditions))
        .groupBy(bucketStart, groupColumn)
        .orderBy(asc(bucketStart), asc(groupColumn));
}

function toDate(value: unknown): Date {
    return value instanceof Date ? value : new Date(String(value));
}
