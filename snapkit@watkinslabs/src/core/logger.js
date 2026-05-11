/**
 * Logger - Structured Logging System
 *
 * Provides structured logging with log levels and context.
 * Compatible with existing debug() function pattern in original codebase.
 *
 * @example
 * const logger = new Logger('LayoutResolver');
 * logger.debug('Resolving layout', { layoutId: 'grid-2x2' });
 * logger.info('Layout resolved', { zones: 4, time: 3.2 });
 * logger.warn('Cache miss', { key: 'layout-123' });
 * logger.error('Resolution failed', error);
 */

export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

export class Logger {
    static _globalLevel = LogLevel.INFO;
    static _enableTimestamps = true;
    static _enableContext = true;

    /**
     * Set global log level
     *
     * @param {number} level - LogLevel value
     */
    static setGlobalLevel(level) {
        Logger._globalLevel = level;
    }

    /**
     * Enable/disable timestamps in log output
     *
     * @param {boolean} enabled
     */
    static setTimestamps(enabled) {
        Logger._enableTimestamps = enabled;
    }

    /**
     * Enable/disable context in log output
     *
     * @param {boolean} enabled
     */
    static setContext(enabled) {
        Logger._enableContext = enabled;
    }

    /**
     * Create a logger instance
     *
     * @param {string} context - Logger context (e.g., class name)
     * @param {number} level - Optional log level override
     */
    constructor(context, level = null) {
        this._context = context;
        this._level = level;
    }

    /**
     * Get effective log level
     *
     * @private
     * @returns {number}
     */
    _getLevel() {
        return this._level !== null ? this._level : Logger._globalLevel;
    }

    /**
     * Format log message
     *
     * @private
     * @param {string} level - Log level name
     * @param {string} message - Log message
     * @param {*} data - Additional data
     * @returns {string}
     */
    _format(level, message, data) {
        const parts = [];

        // Timestamp
        if (Logger._enableTimestamps) {
            const now = new Date();
            const timestamp = now.toISOString().substr(11, 12); // HH:MM:SS.mmm
            parts.push(`[${timestamp}]`);
        }

        // Level
        parts.push(`[${level}]`);

        // Context
        if (Logger._enableContext && this._context) {
            parts.push(`[${this._context}]`);
        }

        // Message
        parts.push(message);

        // Build base message
        let output = parts.join(' ');

        // Append data if provided
        if (data !== undefined) {
            if (data instanceof Error) {
                output += `\n  Error: ${data.message}`;
                if (data.stack) {
                    output += `\n  Stack: ${data.stack}`;
                }
            } else if (typeof data === 'object') {
                try {
                    output += `\n  Data: ${JSON.stringify(data, null, 2)}`;
                } catch (e) {
                    output += `\n  Data: ${String(data)}`;
                }
            } else {
                output += ` ${String(data)}`;
            }
        }

        return output;
    }

    /**
     * Log debug message
     *
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    debug(message, data) {
        if (this._getLevel() <= LogLevel.DEBUG) {
            console.log(this._format('DEBUG', message, data));
        }
    }

    /**
     * Log info message
     *
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    info(message, data) {
        if (this._getLevel() <= LogLevel.INFO) {
            console.log(this._format('INFO', message, data));
        }
    }

    /**
     * Log warning message
     *
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    warn(message, data) {
        if (this._getLevel() <= LogLevel.WARN) {
            console.warn(this._format('WARN', message, data));
        }
    }

    /**
     * Log error message
     *
     * @param {string} message - Log message
     * @param {*} data - Error or additional data
     */
    error(message, data) {
        if (this._getLevel() <= LogLevel.ERROR) {
            console.error(this._format('ERROR', message, data));
        }
    }

    /**
     * Time a function execution
     *
     * @param {string} label - Timer label
     * @param {Function} fn - Function to time
     * @returns {*} Function result
     */
    time(label, fn) {
        const start = Date.now();
        try {
            const result = fn();
            const elapsed = Date.now() - start;
            this.debug(`${label} completed`, { elapsed: `${elapsed}ms` });
            return result;
        } catch (error) {
            const elapsed = Date.now() - start;
            this.error(`${label} failed`, { elapsed: `${elapsed}ms`, error });
            throw error;
        }
    }

    /**
     * Time an async function execution
     *
     * @param {string} label - Timer label
     * @param {Function} fn - Async function to time
     * @returns {Promise<*>} Function result
     */
    async timeAsync(label, fn) {
        const start = Date.now();
        try {
            const result = await fn();
            const elapsed = Date.now() - start;
            this.debug(`${label} completed`, { elapsed: `${elapsed}ms` });
            return result;
        } catch (error) {
            const elapsed = Date.now() - start;
            this.error(`${label} failed`, { elapsed: `${elapsed}ms`, error });
            throw error;
        }
    }

    /**
     * Create a child logger with additional context
     *
     * @param {string} childContext - Additional context
     * @returns {Logger}
     */
    child(childContext) {
        const fullContext = `${this._context}.${childContext}`;
        return new Logger(fullContext, this._level);
    }
}
