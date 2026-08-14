import { readPool } from '../db/client';
import type { AggregationResult } from '../domain/aggregation';
import type { AggregateQuery } from '../schemas/log-aggregation-query';

const BUCKET_INTERVALS = {
    '1m': '1 minute',
    '5m': '5 minutes',
    '1h': '1 hour',
    '1d': '1 day',
} as const;

type AggregationRow = {
    bucket_start: Date | string;
    group_value: string | null;
    count: number | string;
};

export async function aggregateRollups(
    query: AggregateQuery,
): Promise<AggregationResult[]> {
    const rollupSince = floorToMinute(query.since);
    const rollupUntil = ceilToMinute(query.until);
    const groupColumn = getGroupColumn(query.group_by);
    const groupExpression = groupColumn ?? 'NULL::text';
    const parameters: unknown[] = [
        BUCKET_INTERVALS[query.bucket],
        rollupSince,
        rollupUntil,
        query.since,
        query.until,
    ];
    const filters = buildFilters(query, parameters);
    const filterSql = filters.length > 0
        ? ` AND ${filters.join(' AND ')}`
        : '';

    const result = await readPool.query<AggregationRow>(`
        WITH combined AS (
            SELECT
                date_bin(
                    $1::interval,
                    bucket_start,
                    TIMESTAMPTZ '1970-01-01 00:00:00+00'
                ) AS bucket_start,
                ${groupExpression} AS group_value,
                sum(count)::bigint AS count
            FROM log_rollups
            WHERE bucket_start >= $2
              AND bucket_start < $3
              ${filterSql}
            GROUP BY 1, 2

            UNION ALL

            SELECT
                date_bin(
                    $1::interval,
                    timestamp,
                    TIMESTAMPTZ '1970-01-01 00:00:00+00'
                ) AS bucket_start,
                ${groupExpression} AS group_value,
                -count(*)::bigint AS count
            FROM logs
            WHERE (
                    (timestamp >= $2 AND timestamp < $4)
                 OR (timestamp >= $5 AND timestamp < $3)
              )
              ${filterSql}
            GROUP BY 1, 2
        )
        SELECT
            bucket_start,
            group_value,
            sum(count)::bigint AS count
        FROM combined
        GROUP BY bucket_start, group_value
        HAVING sum(count) > 0
        ORDER BY bucket_start ASC, group_value ASC NULLS FIRST
    `, parameters);

    return result.rows.map((row) => ({
        bucketStart: toDate(row.bucket_start),
        groupValue: row.group_value,
        count: Number(row.count),
    }));
}

function buildFilters(
    query: AggregateQuery,
    parameters: unknown[],
): string[] {
    const filters: string[] = [];

    if (query.service !== undefined) {
        parameters.push(query.service);
        filters.push(`service = $${parameters.length}`);
    }

    if (query.level !== undefined) {
        parameters.push(query.level);
        filters.push(`level = $${parameters.length}`);
    }

    return filters;
}

function getGroupColumn(
    groupBy: AggregateQuery['group_by'],
): 'service' | 'level' | undefined {
    if (groupBy === 'service' || groupBy === 'level') {
        return groupBy;
    }

    return undefined;
}

function floorToMinute(value: Date): Date {
    return new Date(Math.floor(value.getTime() / 60_000) * 60_000);
}

function ceilToMinute(value: Date): Date {
    return new Date(Math.ceil(value.getTime() / 60_000) * 60_000);
}

function toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
}
