import { pgTable, bigint, timestamp, text, jsonb, index } from "drizzle-orm/pg-core";

export const logs = pgTable("logs", {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),

    timestamp: timestamp("timestamp", {
        withTimezone: true,
        mode: "date",

    }).notNull(),

    level: text("level").notNull(),
    message: text("message").notNull(),
    service: text("service").notNull(),

    attributes: jsonb("attributes").$type<Record<string, string | number | boolean>>().notNull().default({}),

},
    (table) => [
        index("logs_timestamp_idx").on(table.timestamp),
        index("logs_service_timestamp_idx").on(table.service, table.timestamp),
        index("logs_level_timestamp_idx").on(
            table.level,
            table.timestamp,
        ),

    ],
)