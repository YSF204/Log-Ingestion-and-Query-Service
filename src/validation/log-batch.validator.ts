import type {
    LogAttributes,
    LogLevel,
    RejectedLog,
    ValidLog,
} from '../domain/log';

const MAX_FUTURE_OFFSET_MS = 5 * 60 * 1_000;
const ISO_TIMESTAMP_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;
const LOG_LEVELS = new Set<unknown>(['debug', 'info', 'warn', 'error']);

type BatchValidationResult =
    | { success: false; error: string }
    | {
        success: true;
        logs: ValidLog[];
        rejected: RejectedLog[];
    };

type EntryValidationResult =
    | { success: true; log: ValidLog }
    | { success: false; reason: string };

export function validateLogBatch(body: unknown): BatchValidationResult {
    if (!hasLogsArray(body)) {
        return {
            success: false,
            error: 'body must be an object with a logs array',
        };
    }

    const logs: ValidLog[] = [];
    const rejected: RejectedLog[] = [];
    const timestampCache = new Map<string, number | undefined>();
    const maximumTimestamp = Date.now() + MAX_FUTURE_OFFSET_MS;

    for (const [index, entry] of body.logs.entries()) {
        const result = validateLogEntry(
            entry,
            maximumTimestamp,
            timestampCache,
        );

        if (result.success) {
            logs.push(result.log);
        } else {
            rejected.push({ index, reason: result.reason });
        }
    }

    return { success: true, logs, rejected };
}

function validateLogEntry(
    value: unknown,
    maximumTimestamp: number,
    timestampCache: Map<string, number | undefined>,
): EntryValidationResult {
    if (!isRecord(value)) {
        return invalid('log entry must be an object');
    }

    if (typeof value.timestamp !== 'string') {
        return invalid('timestamp must be a valid ISO 8601 timestamp');
    }

    let timestampMilliseconds = timestampCache.get(value.timestamp);

    if (!timestampCache.has(value.timestamp)) {
        timestampMilliseconds = parseIsoTimestamp(value.timestamp);
        timestampCache.set(value.timestamp, timestampMilliseconds);
    }

    if (timestampMilliseconds === undefined) {
        return invalid('timestamp must be a valid ISO 8601 timestamp');
    }

    if (timestampMilliseconds > maximumTimestamp) {
        return invalid('Timestamp cannot be more than 5 minutes in the future');
    }

    if (!LOG_LEVELS.has(value.level)) {
        return invalid(`invalid level: '${String(value.level)}'`);
    }

    if (typeof value.service !== 'string' || value.service.trim() === '') {
        return invalid('service is required');
    }

    if (typeof value.message !== 'string' || value.message.trim() === '') {
        return invalid('message is required');
    }

    const attributes = value.attributes === undefined ? {} : value.attributes;

    if (!isRecord(attributes)) {
        return invalid('attributes must be a flat object');
    }

    if (!isLogAttributes(attributes)) {
        return invalid(
            'attribute values must be strings, numbers, or booleans',
        );
    }

    return {
        success: true,
        log: {
            timestamp: value.timestamp,
            level: value.level as LogLevel,
            service: value.service.trim(),
            message: value.message.trim(),
            attributes,
        },
    };
}

function parseIsoTimestamp(value: string): number | undefined {
    const match = ISO_TIMESTAMP_PATTERN.exec(value);

    if (match === null) {
        return undefined;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const offsetHour = Number(match[7] ?? 0);
    const offsetMinute = Number(match[8] ?? 0);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    if (
        month < 1 || month > 12 ||
        day < 1 || day > daysInMonth ||
        hour > 23 || minute > 59 || second > 59 ||
        offsetHour > 23 || offsetMinute > 59
    ) {
        return undefined;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function isAttributeValue(
    value: unknown,
): value is string | number | boolean {
    return typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value));
}

function isLogAttributes(
    value: Record<string, unknown>,
): value is LogAttributes {
    return Object.values(value).every(isAttributeValue);
}

function hasLogsArray(body: unknown): body is { logs: unknown[] } {
    return isRecord(body) && Array.isArray(body.logs);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(reason: string): EntryValidationResult {
    return { success: false, reason };
}
