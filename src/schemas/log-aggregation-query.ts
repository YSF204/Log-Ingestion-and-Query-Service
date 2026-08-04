import { z } from 'zod';
import type { AttributeFilter } from './log-query';

const aggregateQuerySchema = z.object({
    service: z.string().optional(),
    level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    q: z.string().optional(),

    since: z.string().datetime({ offset: true }),
    until: z.string().datetime({ offset: true }),

    bucket: z.enum(['1m', '5m', '1h', '1d']),
    group_by: z.enum(['service', 'level']).optional(),
}).passthrough();

export type AggregateQuery = {
    service: string | undefined;
    level: 'debug' | 'info' | 'warn' | 'error' | undefined;
    q: string | undefined;

    since: Date;
    until: Date;

    bucket: '1m' | '5m' | '1h' | '1d';
    group_by: 'service' | 'level' | undefined;

    attributes: AttributeFilter[];
};

type ParseAggregateQueryResult =
    | {
        success: true;
        data: AggregateQuery;
    }
    | {
        success: false;
        error: string;
    };

export function parseAggregateQuery(
    query: unknown,
): ParseAggregateQueryResult {
    const result = aggregateQuerySchema.safeParse(query);

    if (!result.success) {
        return {
            success: false,
            error:
                result.error.issues[0]?.message ??
                'invalid aggregation query',
        };
    }

    const since = new Date(result.data.since);
    const until = new Date(result.data.until);

    if (until < since) {
        return {
            success: false,
            error: 'until cannot be earlier than since',
        };
    }

    const attributes: AttributeFilter[] = [];

    for (const [queryKey, queryValue] of Object.entries(
        query as Record<string, unknown>,
    )) {
        if (!queryKey.startsWith('attr.')) {
            continue;
        }

        const key = queryKey.slice('attr.'.length);

        if (key.length === 0) {
            return {
                success: false,
                error: 'attribute filter key cannot be empty',
            };
        }

        if (typeof queryValue !== 'string') {
            return {
                success: false,
                error: `attribute filter "${key}" must have one value`,
            };
        }

        attributes.push({
            key,
            value: queryValue,
        });
    }

    return {
        success: true,
        data: {
            service: result.data.service,
            level: result.data.level,
            q: result.data.q,
            since,
            until,
            bucket: result.data.bucket,
            group_by: result.data.group_by,
            attributes,
        },
    };
}