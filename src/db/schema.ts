import {
    bigint,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';

import type { LogAttributes } from '../domain/log';

export const logs = pgTable(
    'logs',
    {
        id: bigint('id', { mode: 'number' })
            .generatedAlwaysAsIdentity()
            .notNull(),
        timestamp: timestamp('timestamp', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        level: text('level').notNull(),
        service: text('service').notNull(),
        message: text('message').notNull(),
        attributes: jsonb('attributes')
            .$type<LogAttributes>()
            .notNull()
            .default({}),
    },
    (table) => [
        index('logs_timestamp_id_idx').on(table.timestamp, table.id),
        index('logs_service_timestamp_id_idx').on(
            table.service,
            table.timestamp,
            table.id,
        ),
        index('logs_attributes_gin_idx').using(
            'gin',
            table.attributes.asc().op('jsonb_path_ops'),
        ),
    ],
);

export const logRollups = pgTable(
    'log_rollups',
    {
        bucketStart: timestamp('bucket_start', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        service: text('service').notNull(),
        level: text('level').notNull(),
        count: bigint('count', { mode: 'number' }).notNull().default(0),
    },
    (table) => [
        index('log_rollups_bucket_service_level_idx').on(
            table.bucketStart,
            table.service,
            table.level,
        ),
    ],
);
