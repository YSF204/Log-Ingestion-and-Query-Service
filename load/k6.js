import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://app:8080';
const BATCH_SIZE = Number(__ENV.BATCH_SIZE || 100);
// Compose exposes LOAD_LOGS_PER_SECOND. Keep LOGS_PER_SECOND as a
// backwards-compatible alias for direct k6 invocations.
const LOGS_PER_SECOND = Number(
    __ENV.LOAD_LOGS_PER_SECOND || __ENV.LOGS_PER_SECOND || 15_000,
);
const DURATION = __ENV.DURATION || '30s';
const RATE_STAGES = parseRateStages(__ENV.LOAD_RATE_STAGES);
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || 100);
const MAX_VUS = Number(__ENV.MAX_VUS || 500);
const AGGREGATION_WINDOW_MINUTES = Number(
    __ENV.AGGREGATION_WINDOW_MINUTES || 60,
);
const LOAD_MODE = (__ENV.LOAD_MODE || 'both').toLowerCase();
const AGGREGATION_RATE = Number(
    __ENV.LOAD_AGGREGATION_RATE || 1,
);

if (!['ingestion', 'aggregation', 'both'].includes(LOAD_MODE)) {
    throw new Error(
        'LOAD_MODE must be ingestion, aggregation, or both',
    );
}

function requirePositiveInteger(name, value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
}

requirePositiveInteger('BATCH_SIZE', BATCH_SIZE);
requirePositiveInteger('LOGS_PER_SECOND', LOGS_PER_SECOND);
requirePositiveInteger('PRE_ALLOCATED_VUS', PRE_ALLOCATED_VUS);
requirePositiveInteger('MAX_VUS', MAX_VUS);
requirePositiveInteger(
    'AGGREGATION_WINDOW_MINUTES',
    AGGREGATION_WINDOW_MINUTES,
);

if (LOAD_MODE !== 'ingestion') {
    requirePositiveInteger(
        'LOAD_AGGREGATION_RATE',
        AGGREGATION_RATE,
    );
}

if (RATE_STAGES.length === 0 && LOGS_PER_SECOND % BATCH_SIZE !== 0) {
    throw new Error(
        'LOGS_PER_SECOND must be divisible by BATCH_SIZE so the target rate is exact',
    );
}

for (const stage of RATE_STAGES) {
    if (stage.logsPerSecond % BATCH_SIZE !== 0) {
        throw new Error(
            `stage rate ${stage.logsPerSecond} must be divisible by BATCH_SIZE`,
        );
    }
}

if (MAX_VUS < PRE_ALLOCATED_VUS) {
    throw new Error('MAX_VUS must be greater than or equal to PRE_ALLOCATED_VUS');
}

const REQUESTS_PER_SECOND = LOGS_PER_SECOND / BATCH_SIZE;
const TEST_DURATION = RATE_STAGES.length === 0
    ? DURATION
    : `${RATE_STAGES.reduce(
        (total, stage) => total + stage.durationMilliseconds,
        0,
    )}ms`;
const INGESTION_ENABLED =
    LOAD_MODE === 'ingestion' || LOAD_MODE === 'both';
const AGGREGATION_ENABLED =
    LOAD_MODE === 'aggregation' || LOAD_MODE === 'both';

const acceptedLogs = new Counter('accepted_logs');
const rejectedLogs = new Counter('rejected_logs');

const scenarios = {};
const thresholds = {};

if (INGESTION_ENABLED) {
    if (RATE_STAGES.length === 0) {
        addIngestionScenario(
            'ingestion',
            REQUESTS_PER_SECOND,
            DURATION,
            undefined,
        );
    } else {
        let startMilliseconds = 0;

        RATE_STAGES.forEach((stage, index) => {
            addIngestionScenario(
                `ingestion_stage_${index + 1}`,
                stage.logsPerSecond / BATCH_SIZE,
                stage.duration,
                `${startMilliseconds}ms`,
                stage.logsPerSecond,
            );
            startMilliseconds += stage.durationMilliseconds;
        });
    }

    thresholds.rejected_logs = ['count==0'];
}

if (AGGREGATION_ENABLED) {
    scenarios.aggregation = {
        executor: 'constant-arrival-rate',
        exec: 'aggregateLogs',
        rate: AGGREGATION_RATE,
        timeUnit: '1s',
        duration: TEST_DURATION,
        preAllocatedVUs: 10,
        maxVUs: 50,
        gracefulStop: '10s',
        tags: {
            workload: 'aggregation',
        },
    };

    thresholds['http_req_failed{scenario:aggregation}'] = ['rate==0'];
    thresholds['checks{scenario:aggregation}'] = ['rate==1'];
    thresholds['http_req_duration{scenario:aggregation}'] = ['p(95)<1000'];
    thresholds['dropped_iterations{scenario:aggregation}'] = ['count==0'];
}

export const options = {
    discardResponseBodies: false,
    scenarios,
    thresholds,
};

function addIngestionScenario(
    name,
    rate,
    duration,
    startTime,
    targetLogsPerSecond = LOGS_PER_SECOND,
) {
    scenarios[name] = {
        executor: 'constant-arrival-rate',
        exec: 'ingestLogs',
        rate,
        timeUnit: '1s',
        duration,
        preAllocatedVUs: PRE_ALLOCATED_VUS,
        maxVUs: MAX_VUS,
        gracefulStop: '10s',
        tags: {
            workload: 'ingestion',
            target_logs_per_second: String(targetLogsPerSecond),
        },
    };

    if (startTime !== undefined) {
        scenarios[name].startTime = startTime;
    }

    thresholds[`http_req_failed{scenario:${name}}`] = ['rate==0'];
    thresholds[`checks{scenario:${name}}`] = ['rate==1'];
    thresholds[`dropped_iterations{scenario:${name}}`] = ['count==0'];
}

function parseRateStages(value) {
    if (value === undefined || value.trim() === '') {
        return [];
    }

    return value.split(',').map((rawStage) => {
        const match = rawStage.trim().match(
            /^(\d+):(\d+(?:\.\d+)?)(ms|s|m|h)$/,
        );

        if (match === null) {
            throw new Error(
                'LOAD_RATE_STAGES must look like 15000:30s,22500:60s,30000:60s',
            );
        }

        const logsPerSecond = Number(match[1]);
        const durationValue = Number(match[2]);
        const durationUnit = match[3];
        const unitMilliseconds = {
            ms: 1,
            s: 1_000,
            m: 60_000,
            h: 3_600_000,
        }[durationUnit];

        requirePositiveInteger('stage logs per second', logsPerSecond);

        if (durationValue <= 0) {
            throw new Error('stage duration must be positive');
        }

        return {
            logsPerSecond,
            duration: `${durationValue}${durationUnit}`,
            durationMilliseconds: durationValue * unitMilliseconds,
        };
    });
}

const levels = ['debug', 'info', 'warn', 'error'];
const services = [
    'load-checkout',
    'load-auth',
    'load-payments',
    'load-notifications',
];
const regions = ['eu', 'us', 'asia'];

export function setup() {
    for (let attempt = 1; attempt <= 60; attempt++) {
        const response = http.get(`${BASE_URL}/health`);

        if (response.status === 200) {
            return {
                runId: String(Date.now()),
                aggregationSince: new Date(
                    Date.now() - AGGREGATION_WINDOW_MINUTES * 60_000,
                ).toISOString(),
            };
        }

        sleep(1);
    }

    fail('Service did not become healthy within 60 seconds');
}

function createBatch(runId) {
    const logs = [];
    const timestamp = new Date().toISOString();
    const iteration = Number(exec.scenario.iterationInTest);
    const vuId = exec.vu.idInTest;

    for (let index = 0; index < BATCH_SIZE; index++) {
        const value = iteration * BATCH_SIZE + index;

        logs.push({
            timestamp,
            level: levels[value % levels.length],
            service: services[value % services.length],
            message: `generated k6 load-test log ${value}`,
            attributes: {
                load_test_id: runId,
                request_id: `${vuId}-${iteration}-${index}`,
                region: regions[value % regions.length],
                vu: vuId,
            },
        });
    }

    return logs;
}

export function ingestLogs(data) {
    const logs = createBatch(data.runId);

    const response = http.post(
        `${BASE_URL}/logs`,
        JSON.stringify({ logs }),
        {
            headers: {
                'Content-Type': 'application/json',
            },
            tags: {
                endpoint: 'POST /logs',
            },
        },
    );

    const body = readResponseBody(response);

    const responseIsValid = check(response, {
        'ingestion returns 200': (result) => result.status === 200,
        'entire batch is accepted': () => body?.accepted === BATCH_SIZE,
        'no logs are rejected': () =>
            Array.isArray(body?.rejected) && body.rejected.length === 0,
    });

    if (typeof body?.accepted === 'number') {
        acceptedLogs.add(body.accepted);
    }

    if (Array.isArray(body?.rejected)) {
        rejectedLogs.add(body.rejected.length);
    }

    if (!responseIsValid && response.status !== 200) {
        console.error(
            `Ingestion failed with HTTP ${response.status}: ${response.body}`,
        );
    }
}

export function aggregateLogs(data) {
    const parameters = [
        `since=${encodeURIComponent(data.aggregationSince)}`,
        `until=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`,
        'bucket=1m',
        'group_by=service',
    ].join('&');

    const response = http.get(
        `${BASE_URL}/logs/aggregate?${parameters}`,
        {
            tags: {
                endpoint: 'GET /logs/aggregate',
            },
        },
    );

    const body = readResponseBody(response);

    check(response, {
        'aggregation returns 200': (result) => result.status === 200,
        'aggregation returns buckets': () => Array.isArray(body?.buckets),
    });
}

function readResponseBody(response) {
    try {
        return response.json();
    } catch {
        return null;
    }
}
