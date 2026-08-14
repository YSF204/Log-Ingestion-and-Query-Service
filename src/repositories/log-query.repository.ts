import {
    and,
    desc,
    eq,
    lt,
    or,
} from 'drizzle-orm';

import { readDb } from '../db/client';
import { logs } from '../db/schema';
import type { LogQuery } from '../schemas/log-query';
import { buildLogFilterConditions } from './log-filter.builder';

export async function selectLogs(query: LogQuery) {
    const conditions = buildLogFilterConditions(query);

    if (query.cursor !== undefined) {
        conditions.push(
            or(
                lt(logs.timestamp, query.cursor.timestamp),
                and(
                    eq(logs.timestamp, query.cursor.timestamp),
                    lt(logs.id, query.cursor.id),
                ),
            )!,
        );
    }

    return readDb
        .select()
        .from(logs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(logs.timestamp), desc(logs.id))
        .limit(query.limit + 1);
}
