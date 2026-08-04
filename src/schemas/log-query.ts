import { z } from 'zod';

const limitSchema = z.string()
    .refine((value) => {
        const limit = Number(value);
        return Number.isInteger(limit) && limit >= 1 && limit <= 1000;
    }, 'limit must be an integer between 1 and 1000')
    .transform(Number);

// These are URL query parameters used by GET /logs.
// Express gives us strings here, so this schema also converts `limit` to a number.
const logQuerySchema = z.object({
    service: z.string().optional(),
    level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    since: z.string().datetime({ offset: true }).optional(),
    until: z.string().datetime({ offset: true }).optional(),
    q: z.string().optional(),
    limit: limitSchema.optional(),
    cursor: z.string().optional(),
}).passthrough();

const cursorSchema = z.object({
    timestamp: z.string().datetime({ offset: true }),
    id: z.string().regex(/^\d+$/),
});

export type AttributeFilter = {
    key: string;
    value: string;
};

export type DecodedCursor = {
    timestamp: Date;
    id: number;
};

export type LogQuery = {
    service: string | undefined;
    level: 'debug' | 'info' | 'warn' | 'error' | undefined;
    since: Date | undefined;
    until: Date | undefined;
    q: string | undefined;
    limit: number;
    attributes: AttributeFilter[];
    cursor: DecodedCursor | undefined;
};

type ParseResult =
    | { success: true; data: LogQuery }
    | { success: false; error: string };

export function encodeCursor(row: { timestamp: Date; id: number }): string {
    return Buffer.from(JSON.stringify({
        timestamp: row.timestamp.toISOString(),
        id: String(row.id),
    }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): DecodedCursor | null {
    try {
        if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
            return null;
        }

        const json: unknown = JSON.parse(
            Buffer.from(cursor, 'base64url').toString('utf8'),
        );
        const result = cursorSchema.safeParse(json);

        if (!result.success) {
            return null;
        }

        const id = Number(result.data.id);
        if (!Number.isSafeInteger(id) || id < 1) {
            return null;
        }

        return {
            timestamp: new Date(result.data.timestamp),
            id,
        };
    } catch {
        return null;
    }
}

export function parseLogQuery(query: unknown): ParseResult {
    // A POST /logs request validates log entries in `req.body` separately.
    // GET /logs receives a new, independent URL query string, so it must be
    // validated here before it is used to build the database query.
    const parsedQuery = logQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
        return {
            success: false,
            error: parsedQuery.error.issues[0]?.message ?? 'invalid query parameters',
        };
    }

    const since = parsedQuery.data.since ? new Date(parsedQuery.data.since) : undefined;
    const until = parsedQuery.data.until ? new Date(parsedQuery.data.until) : undefined;

    if (since !== undefined && until !== undefined && until < since) {
        return { success: false, error: 'until cannot be earlier than since' };
    }

    const attributes: AttributeFilter[] = [];
    for (const [queryKey, queryValue] of Object.entries(query as Record<string, unknown>)) {
        if (!queryKey.startsWith('attr.')) {
            continue;
        }

        const key = queryKey.slice('attr.'.length);
        if (key.length === 0) {
            return { success: false, error: 'attribute filter key cannot be empty' };
        }

        if (typeof queryValue !== 'string') {
            return {
                success: false,
                error: `attribute filter "${key}" must have one value`,
            };
        }

        attributes.push({ key, value: queryValue });
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
            attributes,
            cursor: cursor ?? undefined,
        },
    };
}
