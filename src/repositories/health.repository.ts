import { pool } from '../db/client';

export async function checkDatabaseConnection(): Promise<void> {
    await pool.query('SELECT 1');
}
