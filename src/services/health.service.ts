import { checkDatabaseConnection } from '../repositories/health.repository';

export async function verifyServiceHealth(): Promise<void> {
    await checkDatabaseConnection();
}
