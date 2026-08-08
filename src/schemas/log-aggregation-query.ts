import { z } from 'zod';

import {
    isoTimestampSchema,
    logLevelSchema,
    type LogLevel,
    type ParseResult,
} from './common';
import {
    hasInvalidTimeRange,
    parseAttributeFilters,
    type AttributeFilter,
} from './query-helpers';

const aggregateQuerySchema = z.object({
    service: z.string().optional(),
    level: logLevelSchema.optional(),
    q: z.string().optional(),

    since: isoTimestampSchema,
    until: isoTimestampSchema,

    bucket: z.enum(['1m', '5m', '1h', '1d']),
    group_by: z.enum(['service', 'level']).optional(),
}).passthrough();

export type AggregateQuery = {
    service: string | undefined;
    level: LogLevel | undefined;
    q: string | undefined;

    since: Date;
    until: Date;

    bucket: '1m' | '5m' | '1h' | '1d';
    group_by: 'service' | 'level' | undefined;

    attributes: AttributeFilter[];
};

export function parseAggregateQuery(
    query: unknown,
): ParseResult<AggregateQuery> {
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

    if (hasInvalidTimeRange(since, until)) {
        return {
            success: false,
            error: 'until cannot be earlier than since',
        };
    }

    const attributes = parseAttributeFilters(query);

    if (!attributes.success) {
        return attributes;
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
            attributes: attributes.data,
        },
    };
}
