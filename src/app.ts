import express from 'express';

import { healthCheck } from './controllers/health.controller';
import { errorHandler } from './middleware/error-handler';
import logRoutes from './routes/log.routes';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.get('/health', healthCheck);
app.use('/logs', logRoutes);
app.use(errorHandler);

export default app;
