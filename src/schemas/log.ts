import { z } from "zod";

const attributeValue = z.union([
    z.string(),
    z.number().finite(),
    z.boolean()
]);

export const logSchema = z.object({
    timestamp: z.string().datetime({ offset: true }).refine(
        (value) => new Date(value).getTime() <= Date.now() + 5 * 60 * 1000,
        'Timestamp cannot be more than 5 minutes in the future',
    ),
    level: z.enum(["debug", "info", "warn", "error"]),

    service: z.string().trim().min(1, "service is required"),

    message: z.string().trim().min(1, "message is required"),

    attributes: z
        .record(z.string(), attributeValue)
        .optional()
        .default({}),

})
