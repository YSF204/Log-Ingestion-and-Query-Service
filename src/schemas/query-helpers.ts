import type { ParseResult } from './common';

export type AttributeFilter = {
    key: string;
    value: string;
};

export function parseAttributeFilters(
    query: unknown,
): ParseResult<AttributeFilter[]> {
    if (typeof query !== 'object' || query === null) {
        return { success: true, data: [] };
    }

    const attributes: AttributeFilter[] = [];

    for (const [queryKey, queryValue] of Object.entries(query)) {
        if (!queryKey.startsWith('attr.')) {
            continue;
        }

        const key = queryKey.slice('attr.'.length);

        if (key.length === 0) {
            return {
                success: false,
                error: 'attribute filter key cannot be empty',
            };
        }

        if (typeof queryValue !== 'string') {
            return {
                success: false,
                error: `attribute filter "${key}" must have one value`,
            };
        }

        attributes.push({ key, value: queryValue });
    }

    return { success: true, data: attributes };
}

export function hasInvalidTimeRange(
    since: Date | undefined,
    until: Date | undefined,
): boolean {
    return since !== undefined && until !== undefined && until < since;
}
