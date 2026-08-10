import {
    bigint,
    index,
    integer,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';

export type LogAttributes = Record<string, string | number | boolean>;

export const logs = pgTable(
    'logs',
    {
        id: bigint('id', { mode: 'number' })
            .generatedAlwaysAsIdentity()
            .primaryKey(),
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
        index('logs_level_timestamp_id_idx').on(
            table.level,
            table.timestamp,
            table.id,
        ),
        index('logs_message_trgm_idx').using(
            'gin',
            table.message.asc().op('gin_trgm_ops'),
        ),
        index('logs_attributes_gin_idx').using(
            'gin',
            table.attributes.asc().op('jsonb_ops'),
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
        shard: integer('shard').notNull().default(0),
        count: bigint('count', { mode: 'number' }).notNull().default(0),
    },
    (table) => [
        primaryKey({
            name: 'log_rollups_pkey',
            columns: [
                table.bucketStart,
                table.service,
                table.level,
                table.shard,
            ],
        }),
        index('log_rollups_bucket_idx').on(table.bucketStart),
    ],
);
