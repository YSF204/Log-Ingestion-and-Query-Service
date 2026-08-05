import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';

import { pool } from '../db';
import { deleteExpiredLogs } from '../services/retention.service';

const TEST_SERVICE = 'retention-integration-test';
const CUTOFF = new Date('2000-01-01T00:00:00.000Z');

async function deleteTestLogs() {
    await pool.query(
        `
            DELETE FROM "logs"
            WHERE "service" = $1
        `,
        [TEST_SERVICE],
    );
}

async function insertTestLog(
    timestamp: string,
    message: string,
) {
    await pool.query(
        `
            INSERT INTO "logs" (
                "timestamp",
                "level",
                "service",
                "message",
                "attributes"
            )
            VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [
            timestamp,
            'info',
            TEST_SERVICE,
            message,
            JSON.stringify({
                test_run_id: 'retention-integration-test',
            }),
        ],
    );
}

async function countTestLogs(): Promise<number> {
    const result = await pool.query<{ count: number }>(
        `
            SELECT count(*)::integer AS "count"
            FROM "logs"
            WHERE "service" = $1
        `,
        [TEST_SERVICE],
    );

    return result.rows[0]?.count ?? 0;
}

describe('deleteExpiredLogs', () => {
    beforeEach(async () => {
        await deleteTestLogs();
    });

    afterEach(async () => {
        await deleteTestLogs();
    });

    afterAll(async () => {
        await pool.end();
    });

    it('deletes old logs and preserves logs at or after the cutoff', async () => {
        await insertTestLog(
            '1999-12-31T23:59:59.000Z',
            'expired log',
        );

        await insertTestLog(
            '2000-01-01T00:00:00.000Z',
            'log exactly at cutoff',
        );

        await insertTestLog(
            '2000-01-01T00:00:01.000Z',
            'newer log',
        );

        const deletedCount = await deleteExpiredLogs(
            CUTOFF,
            100,
        );

        expect(deletedCount).toBe(1);

        const remaining = await pool.query<{ message: string }>(
            `
                SELECT "message"
                FROM "logs"
                WHERE "service" = $1
                ORDER BY "timestamp" ASC
            `,
            [TEST_SERVICE],
        );

        expect(remaining.rows).toEqual([
            {
                message: 'log exactly at cutoff',
            },
            {
                message: 'newer log',
            },
        ]);
    });

    it('does not delete more than the batch size', async () => {
        for (let index = 0; index < 5; index++) {
            await insertTestLog(
                `1999-12-31T23:59:5${index}.000Z`,
                `expired log ${index}`,
            );
        }

        const firstDeletedCount = await deleteExpiredLogs(
            CUTOFF,
            2,
        );

        expect(firstDeletedCount).toBe(2);
        expect(await countTestLogs()).toBe(3);

        const secondDeletedCount = await deleteExpiredLogs(
            CUTOFF,
            2,
        );

        expect(secondDeletedCount).toBe(2);
        expect(await countTestLogs()).toBe(1);

        const thirdDeletedCount = await deleteExpiredLogs(
            CUTOFF,
            2,
        );

        expect(thirdDeletedCount).toBe(1);
        expect(await countTestLogs()).toBe(0);

        const fourthDeletedCount = await deleteExpiredLogs(
            CUTOFF,
            2,
        );

        expect(fourthDeletedCount).toBe(0);
    });

    it('rejects an invalid cutoff date', async () => {
        const invalidDate = new Date('not a date');

        await expect(
            deleteExpiredLogs(invalidDate, 100),
        ).rejects.toThrow('cut off must be a valid date');
    });

    it('rejects an invalid batch size', async () => {
        await expect(
            deleteExpiredLogs(CUTOFF, 0),
        ).rejects.toThrow(
            'batchSize must be a positive integer',
        );

        await expect(
            deleteExpiredLogs(CUTOFF, 2.5),
        ).rejects.toThrow(
            'batchSize must be a positive integer',
        );
    });
});