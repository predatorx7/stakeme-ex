import pino, { stdTimeFunctions } from 'pino'
import { LOG_LEVEL } from './consts.ts'

export const LOGGER = pino({
	timestamp: stdTimeFunctions.isoTime,
	base: { hostname: undefined, pid: undefined },
})
LOGGER.level = LOG_LEVEL
