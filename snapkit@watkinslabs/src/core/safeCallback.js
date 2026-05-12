import { Logger } from './logger.js';

const fallbackLogger = new Logger('SafeCallback');

/**
 * Wrap a callback so unexpected exceptions are logged and contained.
 *
 * @param {Logger} logger
 * @param {string} context
 * @param {Function} callback
 * @param {*} fallbackReturn
 * @returns {Function}
 */
export function safeCallback(logger, context, callback, fallbackReturn = undefined) {
    if (typeof callback !== 'function') {
        throw new Error('callback must be a function');
    }

    return (...args) => {
        try {
            return callback(...args);
        } catch (error) {
            const activeLogger = logger && typeof logger.error === 'function'
                ? logger
                : fallbackLogger;
            activeLogger.error(`Unhandled callback exception: ${context}`, error);
            return fallbackReturn;
        }
    };
}
