import {
    and,
    desc,
    eq,
    lt,
    or,
} from 'drizzle-orm';

import { db } from '../db/client';
import { buildLogFilterConditions } from '../db/log-filters';
import { logs } from '../db/schema';
import {
    encodeCursor,
    type LogQuery,
} from '../schemas/log-query';

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
        nextCursor: hasMore && lastRow
            ? encodeCursor(lastRow)
            : null,
    };
}
