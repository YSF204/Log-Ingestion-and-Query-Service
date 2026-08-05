const DEFAULT_RETENTION_DAYS = 30;

export function parseRetentionDays(value: string | undefined): number {
    if (value === undefined) {
        return DEFAULT_RETENTION_DAYS;
    }

    const days = Number(value);

    if (!Number.isInteger(days) || days <= 0) {
        throw new Error(
            'RETENTION_DAYS must be a positive integer',
        );
    }

    return days;
}

export const RETENTION_DAYS = parseRetentionDays(
    process.env.RETENTION_DAYS,
);