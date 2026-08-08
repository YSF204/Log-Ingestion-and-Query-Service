import { z } from 'zod';

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export const isoTimestampSchema = z.string().datetime({ offset: true });

export type LogLevel = z.infer<typeof logLevelSchema>;

export type ParseResult<T> =
    | { success: true; data: T }
    | { success: false; error: string };
