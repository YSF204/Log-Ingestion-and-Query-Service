import {
    describe,
    expect,
    it,
} from 'vitest';

import {
    parseRetentionDays,
} from '../config/retention';

import {
    calculateRetentionCutoff,
} from '../domain/retention';

describe('parseRetentionDays', () => {
    it('uses 30 days when the value is missing', () => {
        const result = parseRetentionDays(undefined);

        expect(result).toBe(30);
    });

    it('converts a valid string into a number', () => {
        expect(parseRetentionDays('7')).toBe(7);
        expect(parseRetentionDays('1')).toBe(1);
        expect(parseRetentionDays('365')).toBe(365);
    });

    it('rejects zero', () => {
        expect(() => {
            parseRetentionDays('0');
        }).toThrow(
            'RETENTION_DAYS must be a positive integer',
        );
    });

    it('rejects negative numbers', () => {
        expect(() => {
            parseRetentionDays('-5');
        }).toThrow(
            'RETENTION_DAYS must be a positive integer',
        );
    });

    it('rejects decimal numbers', () => {
        expect(() => {
            parseRetentionDays('2.5');
        }).toThrow(
            'RETENTION_DAYS must be a positive integer',
        );
    });

    it('rejects non-numeric values', () => {
        expect(() => {
            parseRetentionDays('hello');
        }).toThrow(
            'RETENTION_DAYS must be a positive integer',
        );
    });

    it('rejects an empty string', () => {
        expect(() => {
            parseRetentionDays('');
        }).toThrow(
            'RETENTION_DAYS must be a positive integer',
        );
    });
});

describe('calculateRetentionCutoff', () => {
    it('subtracts the retention period from the current time', () => {
        const now = new Date(
            '2026-08-05T12:00:00.000Z',
        );

        const cutoff = calculateRetentionCutoff(
            now,
            30,
        );

        expect(cutoff.toISOString()).toBe(
            '2026-07-06T12:00:00.000Z',
        );
    });

    it('works with a one-day retention period', () => {
        const now = new Date(
            '2026-08-05T12:00:00.000Z',
        );

        const cutoff = calculateRetentionCutoff(
            now,
            1,
        );

        expect(cutoff.toISOString()).toBe(
            '2026-08-04T12:00:00.000Z',
        );
    });

    it('does not modify the original date', () => {
        const now = new Date(
            '2026-08-05T12:00:00.000Z',
        );

        calculateRetentionCutoff(now, 30);

        expect(now.toISOString()).toBe(
            '2026-08-05T12:00:00.000Z',
        );
    });
});
