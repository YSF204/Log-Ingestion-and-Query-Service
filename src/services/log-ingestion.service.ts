import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { from as copyFrom } from 'pg-copy-streams';

import { pool } from '../db/client';
import type { ValidLog } from '../schemas/log';
import {
    groupRollupDeltas,
    incrementRollups,
} from './rollup.service';

export async function insertLogs(entries: ValidLog[]): Promise<void> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const copyStream = client.query(
            copyFrom(
                'COPY logs (timestamp, level, service, message, attributes) ' +
                'FROM STDIN WITH (FORMAT csv)',
            ),
        );

        const rows = entries.map(serializeLogForCopy);
        await pipeline(Readable.from(rows), copyStream);

        const rollupDeltas = groupRollupDeltas(entries);
        await incrementRollups(client, rollupDeltas);

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

function serializeLogForCopy(entry: ValidLog): string {
    return [
        new Date(entry.timestamp).toISOString(),
        entry.level,
        entry.service,
        entry.message,
        JSON.stringify(entry.attributes),
    ]
        .map(escapeCsvField)
        .join(',') + '\n';
}

function escapeCsvField(value: string): string {
    if (!/[",\n\r]/.test(value)) {
        return value;
    }

    return `"${value.replaceAll('"', '""')}"`;
}
