import { Router } from 'express';
import { ingestLogs, queryLogs } from '../controllers/log.controller';

const router = Router();

router.post('/', ingestLogs);
router.get('/', queryLogs);

export default router;
