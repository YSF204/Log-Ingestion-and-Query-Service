import type { RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'

const DEFAULT_WINDOW_MS = 1_000
const DEFAULT_MAX_REQUESTS = 100

function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}


export function createRateLimiter(): RequestHandler {
    if (process.env.RATE_LIMIT_ENABLED !== 'true') {
        return (_request, _response, next) => next()
    }

    return rateLimit({
        windowMs: positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),
        limit: positiveInteger(process.env.RATE_LIMIT_MAX, DEFAULT_MAX_REQUESTS),
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' },
    })
}
