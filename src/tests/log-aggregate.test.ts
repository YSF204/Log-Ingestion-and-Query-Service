import request from 'supertest';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';

import app from '../app';
import { pool } from '../db/client';

const CHECKOUT_SERVICE = 'aggregate-test-checkout';
const AUTH_SERVICE = 'aggregate-test-auth';
const TEST_RUN_ID = 'log-aggregate-integration-test';

const since = '2026-08-01T10:00:00Z';
const until = '2026-08-01T10:10:00Z';

async function deleteTestLogs() {
    await pool.query(
        `
            DELETE FROM logs
            WHERE attributes ->> 'test_run_id' = $1
        `,
        [TEST_RUN_ID],
    );

    await pool.query(
        `
            DELETE FROM log_rollups
            WHERE service = ANY($1::text[])
        `,
        [[CHECKOUT_SERVICE, AUTH_SERVICE]],
    );
}

describe('GET /logs/aggregate', () => {
    beforeAll(async () => {
        // Remove data left by an earlier failed test run.
        await deleteTestLogs();

        const response = await request(app)
            .post('/logs')
            .send({
                logs: [
                    {
                        timestamp: '2026-08-01T10:00:10Z',
                        level: 'error',
                        service: CHECKOUT_SERVICE,
                        message: 'payment declined',
                        attributes: {
                            region: 'eu',
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                    {
                        timestamp: '2026-08-01T10:01:20Z',
                        level: 'error',
                        service: CHECKOUT_SERVICE,
                        message: 'card declined',
                        attributes: {
                            region: 'eu',
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                    {
                        timestamp: '2026-08-01T10:04:59Z',
                        level: 'info',
                        service: AUTH_SERVICE,
                        message: 'user logged in',
                        attributes: {
                            region: 'us',
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                    {
                        timestamp: '2026-08-01T10:05:00Z',
                        level: 'warn',
                        service: CHECKOUT_SERVICE,
                        message: 'retrying payment',
                        attributes: {
                            region: 'eu',
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                    {
                        timestamp: '2026-08-01T10:07:30Z',
                        level: 'error',
                        service: AUTH_SERVICE,
                        message: 'login declined',
                        attributes: {
                            region: 'eu',
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                    {
                        // This must be excluded because `until` is exclusive.
                        timestamp: '2026-08-01T10:10:00Z',
                        level: 'error',
                        service: CHECKOUT_SERVICE,
                        message: 'outside requested range',
                        attributes: {
                            region: 'eu',
                            test_run_id: TEST_RUN_ID,
                        },
                    },
                ],
            });

        expect(response.status).toBe(200);
        expect(response.body.accepted).toBe(6);
        expect(response.body.rejected).toEqual([]);
    });

    afterAll(async () => {
        await deleteTestLogs();
        await pool.end();
    });

    it('aggregates logs into time buckets', async () => {
        const response = await request(app)
            .get('/logs/aggregate')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                since,
                until,
                bucket: '5m',
            });

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            buckets: [
                {
                    start: '2026-08-01T10:00:00.000Z',
                    group: null,
                    count: 3,
                },
                {
                    start: '2026-08-01T10:05:00.000Z',
                    group: null,
                    count: 2,
                },
            ],
        });
    });

    it('groups results by service', async () => {
        const response = await request(app)
            .get('/logs/aggregate')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                since,
                until,
                bucket: '5m',
                group_by: 'service',
            });

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            buckets: [
                {
                    start: '2026-08-01T10:00:00.000Z',
                    group: AUTH_SERVICE,
                    count: 1,
                },
                {
                    start: '2026-08-01T10:00:00.000Z',
                    group: CHECKOUT_SERVICE,
                    count: 2,
                },
                {
                    start: '2026-08-01T10:05:00.000Z',
                    group: AUTH_SERVICE,
                    count: 1,
                },
                {
                    start: '2026-08-01T10:05:00.000Z',
                    group: CHECKOUT_SERVICE,
                    count: 1,
                },
            ],
        });
    });

    it('filters by an attribute', async () => {
        const response = await request(app)
            .get('/logs/aggregate')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                since,
                until,
                bucket: '5m',
                'attr.region': 'eu',
            });

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            buckets: [
                {
                    start: '2026-08-01T10:00:00.000Z',
                    group: null,
                    count: 2,
                },
                {
                    start: '2026-08-01T10:05:00.000Z',
                    group: null,
                    count: 2,
                },
            ],
        });
    });

    it('filters messages case-insensitively', async () => {
        const response = await request(app)
            .get('/logs/aggregate')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                since,
                until,
                bucket: '5m',
                q: 'DECLINED',
            });

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            buckets: [
                {
                    start: '2026-08-01T10:00:00.000Z',
                    group: null,
                    count: 2,
                },
                {
                    start: '2026-08-01T10:05:00.000Z',
                    group: null,
                    count: 1,
                },
            ],
        });
    });

    it('returns an empty array when no logs match', async () => {
        const response = await request(app)
            .get('/logs/aggregate')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                since,
                until,
                bucket: '5m',
                service: 'service-that-does-not-exist',
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            buckets: [],
        });
    });

    it('rejects a missing required parameter', async () => {
        const response = await request(app)
            .get('/logs/aggregate')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                until,
                bucket: '5m',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: expect.any(String),
        });
    });

    it('rejects an unsupported bucket size', async () => {
        const response = await request(app)
            .get('/logs/aggregate')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                since,
                until,
                bucket: '10m',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: expect.any(String),
        });
    });

    it('rejects an invalid time range', async () => {
        const response = await request(app)
            .get('/logs/aggregate')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                since: '2026-08-01T11:00:00Z',
                until: '2026-08-01T10:00:00Z',
                bucket: '5m',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: 'until cannot be earlier than since',
        });
    });

    it('rejects an unsupported grouping field', async () => {
        const response = await request(app)
            .get('/logs/aggregate')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                since,
                until,
                bucket: '5m',
                group_by: 'message',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: expect.any(String),
        });
    });
});
