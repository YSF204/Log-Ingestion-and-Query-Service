import {
    and,
    eq,
    gte,
    ilike,
    lt,
    or,
    sql,
    type SQL,
} from 'drizzle-orm';

import type { LogLevel } from '../domain/log';
import type { AttributeFilter } from '../schemas/query-helpers';
import { logs } from '../db/schema';

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
        conditions.push(buildAttributeCondition(attribute));
    }

    return conditions;
}

function buildAttributeCondition(attribute: AttributeFilter): SQL {
    const indexedValues: Array<string | number | boolean> = [attribute.value];
    const parsedValue = parseIndexedPrimitive(attribute.value);

    if (parsedValue !== undefined) {
        indexedValues.push(parsedValue);
    }

    const indexedConditions = indexedValues.map((value) => sql`
        ${logs.attributes} @> ${JSON.stringify({
            [attribute.key]: value,
        })}::jsonb
    `);

    return and(
        or(...indexedConditions),
        sql`${logs.attributes} ->> ${attribute.key} = ${attribute.value}`,
    )!;
}

function parseIndexedPrimitive(value: string): number | boolean | undefined {
    try {
        const parsedValue: unknown = JSON.parse(value);

        if (typeof parsedValue === 'boolean') {
            return parsedValue;
        }

        if (typeof parsedValue === 'number' && Number.isFinite(parsedValue)) {
            return parsedValue;
        }
    } catch {
        return undefined;
    }

    return undefined;
}
