import request from 'supertest';
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';

import app from '../app';
import { pool } from '../db/client';

const TEST_RUN_ID = 'log-ingestion-integration-test';
const TEST_SERVICE = 'ingestion-test-service';

async function deleteTestLogs() {
    await pool.query(
        `
            DELETE FROM "logs"
            WHERE "attributes" ->> 'test_run_id' = $1
        `,
        [TEST_RUN_ID],
    );

    await pool.query(
        `
            DELETE FROM "log_rollups"
            WHERE "service" = $1
        `,
        [TEST_SERVICE],
    );
}

describe('POST /logs', () => {

    it('rejects future timestamps, empty messages, and nested attributes', async () => {
        const currentTimestamp = new Date().toISOString();

        const futureTimestamp = new Date(
            Date.now() + 10 * 60 * 1000,
        ).toISOString();

        const response = await request(app)
            .post('/logs')
            .send({
                logs: [
                    {
                        timestamp: futureTimestamp,
                        level: 'info',
                        service: TEST_SERVICE,
                        message: 'timestamp is too far in the future',
                        attributes: {
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                    {
                        timestamp: currentTimestamp,
                        level: 'info',
                        service: TEST_SERVICE,
                        message: '   ',
                        attributes: {
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                    {
                        timestamp: currentTimestamp,
                        level: 'info',
                        service: TEST_SERVICE,
                        message: 'nested attributes are invalid',
                        attributes: {
                            test_run_id: TEST_RUN_ID,
                            context: {
                                region: 'eu',
                            },
                        },
                    },
                ],
            });

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            accepted: 0,
            rejected: [
                {
                    index: 0,
                    reason: expect.any(String),
                },
                {
                    index: 1,
                    reason: expect.any(String),
                },
                {
                    index: 2,
                    reason: expect.any(String),
                },
            ],
        });

        const storedLogs = await pool.query<{
            count: number;
        }>(
            `
            SELECT count(*)::integer AS "count"
            FROM "logs"
            WHERE "attributes" ->> 'test_run_id' = $1
        `,
            [TEST_RUN_ID],
        );

        expect(storedLogs.rows[0]?.count).toBe(0);
    });
    it('returns 400 for malformed JSON', async () => {
        const response = await request(app)
            .post('/logs')
            .set('Content-Type', 'application/json')
            .send('{"logs": [');

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            error: 'malformed JSON',
        });
    });
    it('returns 400 for an empty batch', async () => {
        const response = await request(app)
            .post('/logs')
            .send({
                logs: [],
            });

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            accepted: 0,
            rejected: [],
        });
    });
    it('returns 400 when the body does not contain a logs array', async () => {
        const invalidBodies = [
            {},
            [],
            {
                logs: 'not an array',
            },
        ];

        for (const body of invalidBodies) {
            const response = await request(app)
                .post('/logs')
                .send(body);

            expect(response.status).toBe(400);

            expect(response.body).toEqual({
                error: 'body must be an object with a logs array',
            });
        }
    });

    it('returns 400 when every entry is rejected', async () => {
        const timestamp = new Date().toISOString();

        const response = await request(app)
            .post('/logs')
            .send({
                logs: [
                    {
                        timestamp,
                        level: 'critical',
                        service: TEST_SERVICE,
                        message: 'invalid level',
                        attributes: {
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                    {
                        timestamp,
                        level: 'info',
                        service: '   ',
                        message: 'empty service',
                        attributes: {
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                ],
            });

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            accepted: 0,
            rejected: [
                {
                    index: 0,
                    reason: expect.any(String),
                },
                {
                    index: 1,
                    reason: expect.any(String),
                },
            ],
        });

        const storedLogs = await pool.query<{
            count: number;
        }>(
            `
            SELECT count(*)::integer AS "count"
            FROM "logs"
            WHERE "attributes" ->> 'test_run_id' = $1
        `,
            [TEST_RUN_ID],
        );

        expect(storedLogs.rows[0]?.count).toBe(0);
    });
    it('accepts valid entries and rejects invalid entries in the same batch', async () => {
        const timestamp = new Date().toISOString();

        const response = await request(app)
            .post('/logs')
            .send({
                logs: [
                    {
                        timestamp,
                        level: 'info',
                        service: TEST_SERVICE,
                        message: 'valid log',
                        attributes: {
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                    {
                        timestamp,
                        level: 'critical',
                        service: TEST_SERVICE,
                        message: 'invalid log level',
                        attributes: {
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                ],
            });

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            accepted: 1,
            rejected: [
                {
                    index: 1,
                    reason: expect.any(String),
                },
            ],
        });

        const storedLogs = await pool.query<{
            message: string;
        }>(
            `
            SELECT "message"
            FROM "logs"
            WHERE "attributes" ->> 'test_run_id' = $1
        `,
            [TEST_RUN_ID],
        );

        expect(storedLogs.rows).toEqual([
            {
                message: 'valid log',
            },
        ]);
    });

    beforeEach(async () => {
        await deleteTestLogs();
    });

    afterEach(async () => {
        await deleteTestLogs();
    });

    afterAll(async () => {
        await pool.end();
    });

    it('accepts and stores a valid batch', async () => {
        const timestamp = new Date().toISOString();

        const response = await request(app)
            .post('/logs')
            .send({
                logs: [
                    {
                        timestamp,
                        level: 'info',
                        service: TEST_SERVICE,
                        message: 'first valid log',
                        attributes: {
                            region: 'eu',
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                    {
                        timestamp,
                        level: 'error',
                        service: TEST_SERVICE,
                        message: 'second valid log',
                        attributes: {
                            region: 'us',
                            retries: 2,
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                ],
            });

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            accepted: 2,
            rejected: [],
        });

        const storedLogs = await pool.query<{
            level: string;
            message: string;
        }>(
            `
                SELECT "level", "message"
                FROM "logs"
                WHERE "attributes" ->> 'test_run_id' = $1
                ORDER BY "id" ASC
            `,
            [TEST_RUN_ID],
        );

        expect(storedLogs.rows).toEqual([
            {
                level: 'info',
                message: 'first valid log',
            },
            {
                level: 'error',
                message: 'second valid log',
            },
        ]);
    });
});
