import type { Request, Response } from 'express';

import { parseAggregateQuery } from '../schemas/log-aggregation-query';
import { findAggregatedLogs } from '../services/log-aggregation.service';

export async function aggregateLogs(req: Request, res: Response) {
    const query = parseAggregateQuery(req.query);

    if (!query.success) {
        return res.status(400).json({ error: query.error });
    }

    const buckets = await findAggregatedLogs(query.data);

    return res.status(200).json({
        buckets: buckets.map((bucket) => ({
            start: bucket.bucketStart.toISOString(),
            group: bucket.groupValue,
            count: bucket.count,
        })),
    });
}
