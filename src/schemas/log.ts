import { z } from 'zod';

import { isoTimestampSchema, logLevelSchema } from './common';

const MAX_FUTURE_OFFSET_MS = 5 * 60 * 1_000;

const attributeValueSchema = z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
]);

export const logSchema = z.object({
    timestamp: isoTimestampSchema
        .refine(
            (value) => {
                return new Date(value).getTime() <=
                    Date.now() + MAX_FUTURE_OFFSET_MS;
            },
            'Timestamp cannot be more than 5 minutes in the future',
        ),
    level: logLevelSchema,
    service: z.string().trim().min(1, 'service is required'),
    message: z.string().trim().min(1, 'message is required'),
    attributes: z
        .record(z.string(), attributeValueSchema)
        .optional()
        .default({}),
});

export type ValidLog = z.infer<typeof logSchema>;

export type RejectedLog = {
    index: number;
    reason: string;
};

type BatchValidationResult =
    | { success: false; error: string }
    | {
        success: true;
        logs: ValidLog[];
        rejected: RejectedLog[];
    };

export function validateLogBatch(body: unknown): BatchValidationResult {
    if (!hasLogsArray(body)) {
        return {
            success: false,
            error: 'body must be an object with a logs array',
        };
    }

    const logs: ValidLog[] = [];
    const rejected: RejectedLog[] = [];

    for (const [index, entry] of body.logs.entries()) {
        const result = logSchema.safeParse(entry);

        if (result.success) {
            logs.push(result.data);
        } else {
            rejected.push({
                index,
                reason: result.error.issues[0]?.message ?? 'invalid log entry',
            });
        }
    }

    return { success: true, logs, rejected };
}

function hasLogsArray(body: unknown): body is { logs: unknown[] } {
    return typeof body === 'object' &&
        body !== null &&
        'logs' in body &&
        Array.isArray(body.logs);
}
