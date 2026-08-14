const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function calculateRetentionCutoff(
    now: Date,
    retentionDays: number,
): Date {
    return new Date(
        now.getTime() - retentionDays * MILLISECONDS_PER_DAY,
    );
}
