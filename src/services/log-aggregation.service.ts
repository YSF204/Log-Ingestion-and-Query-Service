import {
    and,
    asc,
    eq,
    gte,
    lt,
    sql,
    type SQL,
} from 'drizzle-orm';

import { db } from '../db/client';
import { buildLogFilterConditions } from '../db/log-filters';
import { logRollups, logs } from '../db/schema';
import type { AggregateQuery } from '../schemas/log-aggregation-query';

const BUCKET_INTERVALS = {
    '1m': sql`INTERVAL '1 minute'`,
    '5m': sql`INTERVAL '5 minutes'`,
    '1h': sql`INTERVAL '1 hour'`,
    '1d': sql`INTERVAL '1 day'`,
} as const;

export type AggregationResult = {
    bucketStart: Date;
    groupValue: string | null;
    count: number;
};

export async function findAggregatedLogs(
    query: AggregateQuery,
): Promise<AggregationResult[]> {
    const rollupsCanAnswerQuery =
        query.q === undefined && query.attributes.length === 0;

    return rollupsCanAnswerQuery
        ? aggregateRollups(query)
        : aggregateRawLogs(query);
}

async function aggregateRawLogs(
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
        const rows = await db
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

    return db
        .select({ bucketStart, groupValue: groupColumn, count })
        .from(logs)
        .where(and(...conditions))
        .groupBy(bucketStart, groupColumn)
        .orderBy(asc(bucketStart), asc(groupColumn));
}

async function aggregateRollups(
    query: AggregateQuery,
): Promise<AggregationResult[]> {
    const conditions: SQL[] = [
        gte(logRollups.bucketStart, query.since),
        lt(logRollups.bucketStart, query.until),
    ];

    if (query.service !== undefined) {
        conditions.push(eq(logRollups.service, query.service));
    }

    if (query.level !== undefined) {
        conditions.push(eq(logRollups.level, query.level));
    }

    const bucketStart = query.bucket === '1m'
        ? logRollups.bucketStart
        : sql<Date>`
            date_bin(
                ${BUCKET_INTERVALS[query.bucket]},
                ${logRollups.bucketStart},
                TIMESTAMPTZ '1970-01-01 00:00:00+00'
            )
        `.mapWith(toDate);
    const count = sql<number>`sum(${logRollups.count})::integer`;

    if (query.group_by === undefined) {
        const rows = await db
            .select({ bucketStart, count })
            .from(logRollups)
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
        ? logRollups.service
        : logRollups.level;

    return db
        .select({ bucketStart, groupValue: groupColumn, count })
        .from(logRollups)
        .where(and(...conditions))
        .groupBy(bucketStart, groupColumn)
        .orderBy(asc(bucketStart), asc(groupColumn));
}

function toDate(value: unknown): Date {
    return value instanceof Date ? value : new Date(String(value));
}
