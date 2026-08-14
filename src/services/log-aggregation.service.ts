import type { AggregationResult } from '../domain/aggregation';
import { aggregateRawLogs } from '../repositories/raw-log-aggregation.repository';
import { aggregateRollups } from '../repositories/rollup-aggregation.repository';
import type { AggregateQuery } from '../schemas/log-aggregation-query';

export function findAggregatedLogs(
    query: AggregateQuery,
): Promise<AggregationResult[]> {
    if (query.q !== undefined || query.attributes.length > 0) {
        return aggregateRawLogs(query);
    }

    return aggregateRollups(query);
}
