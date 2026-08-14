import type { Request, Response } from 'express';

import { insertLogs } from '../services/log-ingestion.service';
import { validateLogBatch } from '../validation/log-batch.validator';

export async function ingestLogs(req: Request, res: Response) {
    const batch = validateLogBatch(req.body);

    if (!batch.success) {
        return res.status(400).json({ error: batch.error });
    }

    if (batch.logs.length === 0) {
        return res.status(400).json({
            accepted: 0,
            rejected: batch.rejected,
        });
    }

    await insertLogs(batch.logs);

    return res.status(200).json({
        accepted: batch.logs.length,
        rejected: batch.rejected,
    });
}
