import {
    eq,
    gte,
    ilike,
    lt,
    sql,
    type SQL,
} from 'drizzle-orm';

import type { AttributeFilter } from '../schemas/query-helpers';
import type { LogLevel } from '../schemas/common';
import { logs } from './schema';

export type LogFilters = {
    service: string | undefined;
    level: LogLevel | undefined;
    since: Date | undefined;
    until: Date | undefined;
    q: string | undefined;
    attributes: AttributeFilter[];
};

export function buildLogFilterConditions(query: LogFilters): SQL[] {
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
