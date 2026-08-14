import type { ValidLog } from '../domain/log';

export function serializeLogForCopy(entry: ValidLog): string {
    return [
        entry.timestamp,
        entry.level,
        entry.service,
        entry.message,
        JSON.stringify(entry.attributes),
    ]
        .map(escapeCopyTextField)
        .join('\t') + '\n';
}

function escapeCopyTextField(value: string): string {
    if (!/[\\\t\n\r]/.test(value)) {
        return value;
    }

    return value.replace(/[\\\t\n\r]/g, (character) => {
        switch (character) {
            case '\\':
                return '\\\\';
            case '\t':
                return '\\t';
            case '\n':
                return '\\n';
            default:
                return '\\r';
        }
    });
}
