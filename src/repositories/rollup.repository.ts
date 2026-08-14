import type { PoolClient } from 'pg';

import type { RollupDelta } from '../domain/rollup';

type SqlValues = {
    placeholders: string;
    parameters: Array<Date | string | number>;
};

export function incrementRollups(
    client: PoolClient,
    deltas: RollupDelta[],
): Promise<void> {
    return insertRollupDeltas(client, deltas);
}

export function decrementRollups(
    client: PoolClient,
    deltas: RollupDelta[],
): Promise<void> {
    return insertRollupDeltas(
        client,
        deltas.map((delta) => ({ ...delta, count: -delta.count })),
    );
}

async function insertRollupDeltas(
    client: PoolClient,
    deltas: RollupDelta[],
): Promise<void> {
    if (deltas.length === 0) {
        return;
    }

    const values = buildSqlValues(deltas);

    await client.query(
        `
            INSERT INTO log_rollups (bucket_start, service, level, count)
            VALUES ${values.placeholders}
        `,
        values.parameters,
    );
}

function buildSqlValues(deltas: RollupDelta[]): SqlValues {
    const placeholders: string[] = [];
    const parameters: Array<Date | string | number> = [];

    deltas.forEach((delta, index) => {
        const offset = index * 4;
        placeholders.push(
            `($${offset + 1}::timestamptz, $${offset + 2}::text, ` +
            `$${offset + 3}::text, $${offset + 4}::bigint)`,
        );
        parameters.push(
            delta.bucketStart,
            delta.service,
            delta.level,
            delta.count,
        );
    });

    return {
        placeholders: placeholders.join(', '),
        parameters,
    };
}
