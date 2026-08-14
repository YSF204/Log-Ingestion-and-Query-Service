import { selectLogs } from '../repositories/log-query.repository';
import type { LogQuery } from '../schemas/log-query';
import { encodeCursor } from '../serializers/log-cursor';

export async function findLogs(query: LogQuery) {
    const rows = await selectLogs(query);
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const lastRow = pageRows.at(-1);

    return {
        rows: pageRows,
        nextCursor: hasMore && lastRow !== undefined
            ? encodeCursor(lastRow)
            : null,
    };
}
