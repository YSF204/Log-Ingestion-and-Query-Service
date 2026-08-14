import { pool } from '../db/client';
import type { RollupEvent } from '../domain/log';
import { groupRollupDeltas } from '../domain/rollup';
import { decrementRollups } from './rollup.repository';

export async function deleteExpiredLogBatch(
    cutoff: Date,
    batchSize: number,
): Promise<number> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query<RollupEvent>(
            `
                WITH expired AS (
                    SELECT ctid
                    FROM logs
                    WHERE timestamp < $1
                    ORDER BY timestamp ASC, id ASC
                    LIMIT $2
                    FOR UPDATE SKIP LOCKED
                )
                DELETE FROM logs
                USING expired
                WHERE logs.ctid = expired.ctid
                RETURNING logs.timestamp, logs.service, logs.level
            `,
            [cutoff, batchSize],
        );

        await decrementRollups(client, groupRollupDeltas(result.rows));
        await client.query('COMMIT');

        return result.rowCount ?? 0;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
