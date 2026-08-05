import {pool} from '../db';

export async function deleteExpiredLogs(cutOff: Date , batchSize: number): Promise<number> {
    if(Number.isNaN(cutOff.getTime())){
        throw new Error("cut off must be a valid date");    
    }

    if(!Number.isInteger(batchSize) || batchSize <= 0){ 
        throw new Error("batchSize must be a positive integer");    
    }

    const result = await pool.query(
        `
        WITH expired AS (
        SELECT "id"
        FROM "logs"
        WHERE "timestamp" < $1
        ORDER BY "timestamp" ASC,"id" ASC
        LIMIT $2)
        DELETE FROM "logs"
        USING expired
        WHERE "logs"."id" = expired."id"  
        `,
        [cutOff, batchSize],
    )
    return result.rowCount ?? 0 ;
}