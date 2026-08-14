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
import {
    decodeCursor,
    type DecodedCursor,
} from '../serializers/log-cursor';

const limitSchema = z.string()
    .refine((value) => {
        const limit = Number(value);
        return Number.isInteger(limit) && limit >= 1 && limit <= 1000;
    }, 'limit must be an integer between 1 and 1000')
    .transform(Number);

const logQuerySchema = z.object({
    service: z.string().optional(),
    level: logLevelSchema.optional(),
    since: isoTimestampSchema.optional(),
    until: isoTimestampSchema.optional(),
    q: z.string().optional(),
    limit: limitSchema.optional(),
    cursor: z.string().optional(),
}).passthrough();

export type LogQuery = {
    service: string | undefined;
    level: LogLevel | undefined;
    since: Date | undefined;
    until: Date | undefined;
    q: string | undefined;
    limit: number;
    attributes: AttributeFilter[];
    cursor: DecodedCursor | undefined;
};

export function parseLogQuery(query: unknown): ParseResult<LogQuery> {
    const parsedQuery = logQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
        return {
            success: false,
            error: parsedQuery.error.issues[0]?.message ??
                'invalid query parameters',
        };
    }

    const since = parsedQuery.data.since
        ? new Date(parsedQuery.data.since)
        : undefined;
    const until = parsedQuery.data.until
        ? new Date(parsedQuery.data.until)
        : undefined;

    if (hasInvalidTimeRange(since, until)) {
        return { success: false, error: 'until cannot be earlier than since' };
    }

    const attributes = parseAttributeFilters(query);

    if (!attributes.success) {
        return attributes;
    }

    const cursor = parsedQuery.data.cursor
        ? decodeCursor(parsedQuery.data.cursor)
        : undefined;

    if (parsedQuery.data.cursor !== undefined && cursor === null) {
        return { success: false, error: 'invalid cursor' };
    }

    return {
        success: true,
        data: {
            service: parsedQuery.data.service,
            level: parsedQuery.data.level,
            since,
            until,
            q: parsedQuery.data.q,
            limit: parsedQuery.data.limit ?? 100,
            attributes: attributes.data,
            cursor: cursor ?? undefined,
        },
    };
}
