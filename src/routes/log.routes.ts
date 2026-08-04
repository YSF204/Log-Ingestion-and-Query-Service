import { Router } from 'express';
import { ingestLogs, queryLogs , aggregateLogs } from '../controllers/log.controller';

const router = Router();

router.post('/', ingestLogs);
router.get('/aggregate', aggregateLogs);
router.get('/', queryLogs);

export default router;
