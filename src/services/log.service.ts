import {
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
export function buildLogFilterConditions(query: LogQuery): SQL[] {
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
