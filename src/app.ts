import express from 'express';
import { pool } from './db';
const app = express();

app.use(express.json());

app.get('/health', async (req, res) => {
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

export default app;