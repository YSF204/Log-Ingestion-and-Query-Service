import { z } from 'zod';

import { isoTimestampSchema } from '../schemas/common';

const cursorSchema = z.object({
    timestamp: isoTimestampSchema,
    id: z.string().regex(/^\d+$/),
});

export type DecodedCursor = {
    timestamp: Date;
    id: number;
};

export function encodeCursor(row: { timestamp: Date; id: number }): string {
    return Buffer.from(JSON.stringify({
        timestamp: row.timestamp.toISOString(),
        id: String(row.id),
    }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): DecodedCursor | null {
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
