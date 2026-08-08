import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

export const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 20),
});

export const db = drizzle(pool, { schema });
