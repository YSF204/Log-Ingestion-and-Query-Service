import { z } from 'zod';

export type { LogLevel } from '../domain/log';

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export const isoTimestampSchema = z.string().datetime({ offset: true });

export type ParseResult<T> =
    | { success: true; data: T }
    | { success: false; error: string };
