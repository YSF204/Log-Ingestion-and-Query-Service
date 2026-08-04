import {
    asc,
    and,
    desc,
    eq,
    gte,
    ilike,
    lt,
    or,
    sql,
    type SQL,
} from 'drizzle-orm';
import { db } from '../db';
import { logs } from '../db/schema';
import { encodeCursor, type LogQuery } from '../schemas/log-query';
import type { ValidLog } from '../schemas/log';
import type { AggregateQuery } from '../schemas/log-aggregation-query';


type LogFilterInput = Pick<
    LogQuery,
    'service' | 'level' | 'since' | 'until' | 'q' | 'attributes'
>;

export async function insertLogs(entries: ValidLog[]): Promise<void> {
    await db.insert(logs).values(
        entries.map((entry) => ({
            timestamp: new Date(entry.timestamp),
            level: entry.level,
            service: entry.service,
            message: entry.message,
            attributes: entry.attributes,
        })),
    );
}

// Aggregate queries will reuse these filters, so the SQL rules live in one place.
export function buildLogFilterConditions(query: LogFilterInput): SQL[] {
    const conditions: SQL[] = [];

    if (query.service !== undefined) {
        conditions.push(eq(logs.service, query.service));
    }

    if (query.level !== undefined) {
        conditions.push(eq(logs.level, query.level));
    }

    if (query.since !== undefined) {
        conditions.push(gte(logs.timestamp, query.since));
    }

    if (query.until !== undefined) {
        conditions.push(lt(logs.timestamp, query.until));
    }

    if (query.q !== undefined) {
        conditions.push(ilike(logs.message, `%${query.q}%`));
    }

    for (const attribute of query.attributes) {
        conditions.push(
            sql`${logs.attributes} ->> ${attribute.key} = ${attribute.value}`,
        );
    }

    return conditions;
}

export async function findLogs(query: LogQuery) {
    const conditions = buildLogFilterConditions(query);

    if (query.cursor !== undefined) {
        const cursorCondition = or(
            lt(logs.timestamp, query.cursor.timestamp),
            and(
                eq(logs.timestamp, query.cursor.timestamp),
                lt(logs.id, query.cursor.id),
            ),
        );

        if (cursorCondition !== undefined) {
            conditions.push(cursorCondition);
        }
    }

    const rows = await db
        .select()
        .from(logs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(logs.timestamp), desc(logs.id))
        .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const lastRow = pageRows.at(-1);

    return {
        rows: pageRows,
        nextCursor: hasMore && lastRow ? encodeCursor(lastRow) : null,
    };
}


const bucketIntervals = {
    '1m': sql`INTERVAL '1 minute'`,
    '5m': sql`INTERVAL '5 minutes'`,
    '1h': sql`INTERVAL '1 hour'`,
    '1d': sql`INTERVAL '1 day'`,
} as const;

export async function findAggregatedLogs(
    query: AggregateQuery,
) {
    const conditions = buildLogFilterConditions(query);
    const interval = bucketIntervals[query.bucket];

    const bucketStart = sql<Date>`
    date_bin(
        ${interval},
        ${logs.timestamp},
        TIMESTAMPTZ '1970-01-01 00:00:00+00'
    )
`.mapWith((value) => {
        if (value instanceof Date) {
            return value;
        }

        return new Date(String(value));
    }); const count = sql<number>`count(*)::integer`;

    if (query.group_by === undefined) {
        const rows = await db
            .select({
                bucketStart,
                count,
            })
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

    const groupColumn =
        query.group_by === 'service'
            ? logs.service
            : logs.level;

    return db
        .select({
            bucketStart,
            groupValue: groupColumn,
            count,
        })
        .from(logs)
        .where(and(...conditions))
        .groupBy(bucketStart, groupColumn)
        .orderBy(asc(bucketStart), asc(groupColumn));
}
