import { Router } from 'express';

import { aggregateLogs } from '../controllers/log-aggregation.controller';
import { ingestLogs } from '../controllers/log-ingestion.controller';
import { queryLogs } from '../controllers/log-query.controller';

const router = Router();

router.post('/', ingestLogs);
router.get('/aggregate', aggregateLogs);
router.get('/', queryLogs);

export default router;
