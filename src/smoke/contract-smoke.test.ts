import {
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';

const BASE_URL = 'http://localhost:8080';

type IngestResponse = {
    accepted: number;
    rejected: unknown[];
};

type QueryResponse = {
    logs: Array<{
        service: string;
        message: string;
    }>;
    next_cursor: string | null;
};

type AggregateResponse = {
    buckets: Array<{
        count: number;
    }>;
};

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

async function waitForHealth(): Promise<void> {
    for (let attempt = 1; attempt <= 60; attempt++) {
        try {
            const response = await fetch(
                `${BASE_URL}/health`,
            );

            if (response.ok) {
                return;
            }
        } catch {
            // The container may still be starting.
        }

        await wait(1_000);
    }

    throw new Error(
        'Service did not become healthy within 60 seconds',
    );
}

async function readJson<T>(
    response: Response,
): Promise<T> {
    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(
            `Request failed with status ${response.status}: ` +
            responseText,
        );
    }

    return JSON.parse(responseText) as T;
}

describe('Docker contract smoke test', () => {
    beforeAll(async () => {
        await waitForHealth();
    }, 65_000);

    it('serves the operational dashboard', async () => {
        const response = await fetch(`${BASE_URL}/`);
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type'))
            .toContain('text/html');
        expect(body).toContain('Eventline · Log Observatory');
    });

    it('supports the required API contract', async () => {
        const testId = String(Date.now());
        const service = `contract-smoke-${testId}`;

        const now = Date.now();

        const firstTimestamp = new Date(
            now - 2_000,
        ).toISOString();

        const secondTimestamp = new Date(
            now - 1_000,
        ).toISOString();

        // 1. Test POST /logs.

        const ingestResponse = await fetch(
            `${BASE_URL}/logs`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    logs: [
                        {
                            timestamp: firstTimestamp,
                            level: 'info',
                            service,
                            message: 'first smoke-test log',
                            attributes: {
                                smoke_test_id: testId,
                            },
                        },
                        {
                            timestamp: secondTimestamp,
                            level: 'error',
                            service,
                            message: 'second smoke-test log',
                            attributes: {
                                smoke_test_id: testId,
                            },
                        },
                    ],
                }),
            },
        );

        const ingestBody =
            await readJson<IngestResponse>(
                ingestResponse,
            );

        expect(ingestBody).toEqual({
            accepted: 2,
            rejected: [],
        });

        // 2. Test GET /logs.

        const queryParameters = new URLSearchParams({
            service,
        });

        const queryResponse = await fetch(
            `${BASE_URL}/logs?${queryParameters}`,
        );

        const queryBody =
            await readJson<QueryResponse>(
                queryResponse,
            );

        expect(queryBody.logs).toHaveLength(2);

        expect(
            queryBody.logs.map((log) => log.message),
        ).toEqual([
            'second smoke-test log',
            'first smoke-test log',
        ]);

        // 3. Test GET /logs/aggregate.

        const aggregateParameters = new URLSearchParams({
            service,
            since: new Date(
                now - 60_000,
            ).toISOString(),
            until: new Date(
                now + 60_000,
            ).toISOString(),
            bucket: '1m',
        });

        const aggregateResponse = await fetch(
            `${BASE_URL}/logs/aggregate?${aggregateParameters}`,
        );

        const aggregateBody =
            await readJson<AggregateResponse>(
                aggregateResponse,
            );

        const totalCount =
            aggregateBody.buckets.reduce(
                (total, bucket) => {
                    return total + bucket.count;
                },
                0,
            );

        expect(totalCount).toBe(2);
    });
});
