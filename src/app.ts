import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { healthCheck } from './controllers/health.controller';
import { errorHandler } from './middleware/error-handler';
import { createRateLimiter } from './middleware/rate-limit';
import logRoutes from './routes/log.routes';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.get('/health', healthCheck);
app.use('/logs', createRateLimiter(), logRoutes);

const dashboardPath = path.join(process.cwd(), 'dashboard', 'dist');

if (existsSync(dashboardPath)) {
    app.use(express.static(dashboardPath, {
        index: 'index.html',
        maxAge: '1h',
        setHeaders: (response, filePath) => {
            if (filePath.endsWith('index.html')) {
                response.setHeader('Cache-Control', 'no-cache');
            }
        },
    }));
}

app.use(errorHandler);

export default app;
