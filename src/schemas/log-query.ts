import { z } from 'zod';

const limitSchema = z.string()
    .refine((value) => {
        const limit = Number(value);
        return Number.isInteger(limit) && limit >= 1 && limit <= 1000;
    }, 'limit must be an integer between 1 and 1000')
    .transform(Number);

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
    const result = logQuerySchema.safeParse(query);

    if (!result.success) {
        return {
            success: false,
            error: result.error.issues[0]?.message ?? 'invalid query parameters',
        };
    }

    const since = result.data.since ? new Date(result.data.since) : undefined;
    const until = result.data.until ? new Date(result.data.until) : undefined;

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

    const cursor = result.data.cursor
        ? decodeCursor(result.data.cursor)
        : undefined;

    if (result.data.cursor !== undefined && cursor === null) {
        return { success: false, error: 'invalid cursor' };
    }

    return {
        success: true,
        data: {
            service: result.data.service,
            level: result.data.level,
            since,
            until,
            q: result.data.q,
            limit: result.data.limit ?? 100,
            attributes,
            cursor: cursor ?? undefined,
        },
    };
}
