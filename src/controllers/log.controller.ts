import type { Request, Response } from 'express';
import { logSchema, type ValidLog } from '../schemas/log';
import { parseLogQuery } from '../schemas/log-query';
import { findLogs, insertLogs, findAggregatedLogs } from '../services/log.service';
import { parseAggregateQuery } from '../schemas/log-aggregation-query';

// POST /logs: validate and store log entries from the request body.

export async function ingestLogs(req: Request, res: Response) {
    if (
        typeof req.body !== 'object' ||
        req.body === null ||
        !Array.isArray(req.body.logs)
    ) {
        return res.status(400).json({
            error: 'body must be an object with a logs array',
        });
    }

    const validLogs: ValidLog[] = [];
    const rejected: Array<{ index: number; reason: string }> = [];

    for (const [index, entry] of req.body.logs.entries()) {
        const result = logSchema.safeParse(entry);

        if (!result.success) {
            rejected.push({
                index,
                reason: result.error.issues[0]?.message ?? 'invalid log entry',
            });
            continue;
        }

        validLogs.push(result.data);
    }

    if (validLogs.length === 0) {
        return res.status(400).json({ accepted: 0, rejected });
    }

    await insertLogs(validLogs);

    return res.status(200).json({
        accepted: validLogs.length,
        rejected,
    });
}
// GET /logs: validate query-string filters, then fetch matching log entries.
export async function queryLogs(req: Request, res: Response) {
    const query = parseLogQuery(req.query);

    if (!query.success) {
        return res.status(400).json({ error: query.error });
    }

    const result = await findLogs(query.data);

    return res.status(200).json({
        logs: result.rows.map((row) => ({
            id: String(row.id),
            timestamp: row.timestamp.toISOString(),
            level: row.level,
            service: row.service,
            message: row.message,
            attributes: row.attributes,
        })),
        next_cursor: result.nextCursor,
    });
}

export async function aggregateLogs(req: Request, res: Response) {
    const query = parseAggregateQuery(req.query);

    if (!query.success) {
        return res.status(400).json({ error: query.error });
    }

    const rows = await findAggregatedLogs(query.data);
    
    return res.status(200).json({
        buckets: rows.map((row)=>({
            start: row.bucketStart.toISOString(),
            group: row.groupValue,
            count: row.count
        })),
    });
    
    
}       