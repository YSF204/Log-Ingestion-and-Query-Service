export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogAttributes = Record<string, string | number | boolean>;

export type ValidLog = {
    timestamp: string;
    level: LogLevel;
    service: string;
    message: string;
    attributes: LogAttributes;
};

export type RejectedLog = {
    index: number;
    reason: string;
};

export type RollupEvent = {
    timestamp: string | Date;
    service: string;
    level: string;
};
