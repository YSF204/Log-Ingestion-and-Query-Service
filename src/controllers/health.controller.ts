import type { Request, Response } from 'express';
import { pool } from '../db';

export async function healthCheck(_req: Request, res: Response) {
    try {
        await pool.query('SELECT 1');
        return res.status(200).json({
            status: 'ok',
            database: 'connected',
        });
    } catch (error) {
        console.error('Health check failed:', error);
        return res.status(503).json({
            status: 'unavailable',
            database: 'disconnected',
        });
    }
}
