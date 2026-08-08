import { pool } from '../db/client';
import {
    decrementRollups,
    groupRollupDeltas,
    type RollupEvent,
} from './rollup.service';

export async function deleteExpiredLogs(
    cutoff: Date,
    batchSize: number,
): Promise<number> {
    validateRetentionArguments(cutoff, batchSize);

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query<RollupEvent>(
            `
                WITH expired AS (
                    SELECT id
                    FROM logs
                    WHERE timestamp < $1
                    ORDER BY timestamp ASC, id ASC
                    LIMIT $2
                    FOR UPDATE SKIP LOCKED
                )
                DELETE FROM logs
                USING expired
                WHERE logs.id = expired.id
                RETURNING logs.timestamp, logs.service, logs.level
            `,
            [cutoff, batchSize],
        );

        const rollupDeltas = groupRollupDeltas(result.rows);
        await decrementRollups(client, rollupDeltas);

        await client.query('COMMIT');
        return result.rowCount ?? 0;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

function validateRetentionArguments(cutoff: Date, batchSize: number): void {
    if (Number.isNaN(cutoff.getTime())) {
        throw new Error('cut off must be a valid date');
    }

    if (!Number.isInteger(batchSize) || batchSize <= 0) {
        throw new Error('batchSize must be a positive integer');
    }
}
