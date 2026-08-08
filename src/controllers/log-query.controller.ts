import type { Request, Response } from 'express';

import { parseLogQuery } from '../schemas/log-query';
import { findLogs } from '../services/log-query.service';

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
