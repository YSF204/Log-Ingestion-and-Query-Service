import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { from as copyFrom } from 'pg-copy-streams';

import { pool } from '../db/client';
import type { ValidLog } from '../domain/log';
import { groupRollupDeltas } from '../domain/rollup';
import { serializeLogForCopy } from '../serializers/postgres-copy.serializer';
import { incrementRollups } from './rollup.repository';

export async function writeLogBatch(entries: ValidLog[]): Promise<void> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const copyStream = client.query(
            copyFrom(
                'COPY logs (timestamp, level, service, message, attributes) ' +
                'FROM STDIN',
            ),
        );
        const payload = entries.map(serializeLogForCopy).join('');
        await pipeline(Readable.from([payload]), copyStream);
        await incrementRollups(client, groupRollupDeltas(entries));
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
