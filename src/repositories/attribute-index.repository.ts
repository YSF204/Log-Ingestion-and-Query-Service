import { pool } from '../db/client';

export async function cleanAttributeIndex(): Promise<void> {
    await pool.query(
        `SELECT gin_clean_pending_list('logs_attributes_gin_idx')`,
    );
}
