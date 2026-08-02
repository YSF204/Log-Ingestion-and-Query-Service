import express from 'express';
import { db, pool } from './db';
import { logSchema } from './schemas/log';
import { z } from 'zod';
import { logs } from './db/schema';
import { desc } from 'drizzle-orm';

const app = express();
app.use(express.json());

// Create ValidLog from whatever shape logSchema validates
// infer means like invistigating the type of logSchema and creating a new type based on that
type ValidLog = z.infer<typeof logSchema>;

app.get('/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({
            status: "ok",
            database: "connected"
        })

    } catch (err) {
        console.log(err);
        res.status(503).json({
            status: "unavailable",
            database: "disconnected"
        })
    }
});

app.post("/logs", async (req, res) => {

    if (typeof req.body !== 'object' || req.body === null || !Array.isArray(req.body.logs)) {
        return res.status(400).json({
            error: "body must be an object with a logs array"
        })
    }
    const validLogs: ValidLog[] = [];
    const rejectedLogs: Array<{ index: number; reason: string }> = [];

    for (const [index, entry] of req.body.logs.entries()) {
        const result = logSchema.safeParse(entry);
        if (!result.success) {
            rejectedLogs.push({
                index,
                reason: result.error.issues[0]?.message ?? "invalid log entry"
            })
            continue;
        }
        validLogs.push(result.data);
    }

    if (validLogs.length === 0) {
        return res.status(400).json({
            accepted: 0,
            rejected: rejectedLogs,
        });
    }

    try {
        await db.insert(logs).values(
            validLogs.map((log) => ({
                timestamp: new Date(log.timestamp),
                level: log.level,
                service: log.service,
                message: log.message,
                attributes: log.attributes,
            })),
        );

        res.status(200).json({
            accepted: validLogs.length,
            rejected: rejectedLogs,
        });
    } catch (error) {
        console.error("Error inserting logs:", error);
        res.status(500).json({
            error: 'failed to store logs',
        });

    }
});

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) {
        return res.status(400).json({
            error: "Invalid JSON payload"
        })
    }
    next(error)
});


app.get("/logs", async (_req, res) => {

    try {
        const rows = await db.select().from(logs).orderBy(desc(logs.timestamp), desc(logs.id)).limit(100);
        const lastRow = rows.at(-1);
        return res.status(200).json({
            logs: rows.map((row) => ({
                id: String(row.id),
                timestamp: row.timestamp.toISOString(),
                level: row.level,
                service: row.service,
                message: row.message,
                attributes: row.attributes

            })),
            next_cursor: lastRow ? String(lastRow.id) : null,
        });

    } catch (error) {

    }

})

export default app;