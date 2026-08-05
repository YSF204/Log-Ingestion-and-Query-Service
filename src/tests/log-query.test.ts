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
import { pool } from '../db';

const TEST_RUN_ID = 'log-query-integration-test';
let paymentDeclinedAt: Date;
let paymentAcceptedAt: Date;
let tokenExpiringAt: Date;
let loginDeclinedAt: Date;

async function deleteTestLogs() {
    await pool.query(
        `
            DELETE FROM "logs"
            WHERE "attributes" ->> 'test_run_id' = $1
        `,
        [TEST_RUN_ID],
    );
}

async function insertTestLog(
    timestamp: Date,
    level: string,
    service: string,
    message: string,
    region: string,
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
            level,
            service,
            message,
            JSON.stringify({
                region,
                test_run_id: TEST_RUN_ID,
            }),
        ],
    );
}

describe('GET /logs', () => {
    it('uses an inclusive since and an exclusive until', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                since: paymentAcceptedAt.toISOString(),
                until: loginDeclinedAt.toISOString(),
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(200);

        expect(
            response.body.logs.map(
                (log: { message: string }) => log.message,
            ),
        ).toEqual([
            'token expiring',
            'payment accepted',
        ]);
    });
    it('rejects an invalid timestamp', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                since: 'not-a-timestamp',
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            error: expect.any(String),
        });
    });

    it('rejects until earlier than since', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                since: loginDeclinedAt.toISOString(),
                until: paymentDeclinedAt.toISOString(),
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            error: 'until cannot be earlier than since',
        });
    });
    it('rejects an unsupported log level', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                level: 'critical',
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            error: expect.any(String),
        });
    });
    it('rejects invalid limits', async () => {
        const invalidLimits = [
            'not-a-number',
            '0',
            '1001',
            '2.5',
        ];

        for (const limit of invalidLimits) {
            const response = await request(app)
                .get('/logs')
                .query({
                    limit,
                    'attr.test_run_id': TEST_RUN_ID,
                });

            expect(response.status).toBe(400);

            expect(response.body).toEqual({
                error: expect.any(String),
            });
        }
    });
    it('accepts the maximum supported limit', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                limit: '1000',
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(200);
        expect(response.body.logs).toHaveLength(4);
        expect(response.body.next_cursor).toBeNull();
    });
    it('rejects a malformed cursor', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                cursor: 'not-a-real-cursor',
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            error: 'invalid cursor',
        });
    });
    it('rejects multiple values for one attribute filter', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                'attr.region': ['eu', 'us'],
            });

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            error: expect.any(String),
        });
    });
    it('paginates without duplicates or missing logs', async () => {
        const firstPage = await request(app)
            .get('/logs')
            .query({
                limit: '2',
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(firstPage.status).toBe(200);

        expect(
            firstPage.body.logs.map(
                (log: { message: string }) => log.message,
            ),
        ).toEqual([
            'login declined',
            'token expiring',
        ]);

        expect(firstPage.body.next_cursor).toEqual(
            expect.any(String),
        );

        const secondPage = await request(app)
            .get('/logs')
            .query({
                limit: '2',
                cursor: firstPage.body.next_cursor,
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(secondPage.status).toBe(200);

        expect(
            secondPage.body.logs.map(
                (log: { message: string }) => log.message,
            ),
        ).toEqual([
            'payment accepted',
            'payment declined',
        ]);

        expect(secondPage.body.next_cursor).toBeNull();

        const allIds = [
            ...firstPage.body.logs.map(
                (log: { id: string }) => log.id,
            ),
            ...secondPage.body.logs.map(
                (log: { id: string }) => log.id,
            ),
        ];

        expect(new Set(allIds).size).toBe(4);
    });
    it('uses IDs to order logs with the same timestamp', async () => {
        const sameTimestamp = new Date(
            Date.now() - 5_000,
        );

        await insertTestLog(
            sameTimestamp,
            'info',
            'query-test-same-timestamp',
            'inserted first',
            'eu',
        );

        await insertTestLog(
            sameTimestamp,
            'info',
            'query-test-same-timestamp',
            'inserted second',
            'eu',
        );

        const response = await request(app)
            .get('/logs')
            .query({
                service: 'query-test-same-timestamp',
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(200);

        expect(
            response.body.logs.map(
                (log: { message: string }) => log.message,
            ),
        ).toEqual([
            'inserted second',
            'inserted first',
        ]);
    });
    it('filters logs by service', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                service: 'query-test-checkout',
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(200);

        expect(
            response.body.logs.map(
                (log: { message: string }) => log.message,
            ),
        ).toEqual([
            'payment accepted',
            'payment declined',
        ]);
    });

    it('filters logs by level', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                level: 'error',
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(200);

        expect(
            response.body.logs.map(
                (log: { message: string }) => log.message,
            ),
        ).toEqual([
            'login declined',
            'payment declined',
        ]);
    });

    it('filters logs by an attribute', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
                'attr.region': 'us',
            });

        expect(response.status).toBe(200);

        expect(
            response.body.logs.map(
                (log: { message: string }) => log.message,
            ),
        ).toEqual([
            'payment accepted',
        ]);
    });

    it('searches messages case-insensitively', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                q: 'DECLINED',
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(200);

        expect(
            response.body.logs.map(
                (log: { message: string }) => log.message,
            ),
        ).toEqual([
            'login declined',
            'payment declined',
        ]);
    });

    it('combines multiple filters', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                service: 'query-test-auth',
                level: 'error',
                q: 'DECLINED',
                'attr.test_run_id': TEST_RUN_ID,
                'attr.region': 'eu',
            });

        expect(response.status).toBe(200);

        expect(
            response.body.logs.map(
                (log: { message: string }) => log.message,
            ),
        ).toEqual([
            'login declined',
        ]);
    });

    beforeEach(async () => {
        await deleteTestLogs();

        const now = Date.now();

        paymentDeclinedAt = new Date(now - 40_000);
        paymentAcceptedAt = new Date(now - 30_000);
        tokenExpiringAt = new Date(now - 20_000);
        loginDeclinedAt = new Date(now - 10_000);

        await insertTestLog(
            paymentDeclinedAt,
            'error',
            'query-test-checkout',
            'payment declined',
            'eu',
        );

        await insertTestLog(
            paymentAcceptedAt,
            'info',
            'query-test-checkout',
            'payment accepted',
            'us',
        );

        await insertTestLog(
            tokenExpiringAt,
            'warn',
            'query-test-auth',
            'token expiring',
            'eu',
        );

        await insertTestLog(
            loginDeclinedAt,
            'error',
            'query-test-auth',
            'login declined',
            'eu',
        );
    });

    afterEach(async () => {
        await deleteTestLogs();
    });

    afterAll(async () => {
        await pool.end();
    });

    it('returns matching logs from newest to oldest', async () => {
        const response = await request(app)
            .get('/logs')
            .query({
                'attr.test_run_id': TEST_RUN_ID,
            });

        expect(response.status).toBe(200);

        expect(response.body.next_cursor).toBeNull();

        expect(
            response.body.logs.map(
                (log: { message: string }) => log.message,
            ),
        ).toEqual([
            'login declined',
            'token expiring',
            'payment accepted',
            'payment declined',
        ]);

        for (const log of response.body.logs) {
            expect(log).toEqual({
                id: expect.any(String),
                timestamp: expect.any(String),
                level: expect.any(String),
                service: expect.any(String),
                message: expect.any(String),
                attributes: expect.any(Object),
            });
        }
    });
});