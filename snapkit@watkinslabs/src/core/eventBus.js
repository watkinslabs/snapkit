import { Logger } from './logger.js';

const logger = new Logger('EventBus');

/**
 * EventBus - Publish/Subscribe Event System
 *
 * Provides a centralized event system for loosely-coupled communication
 * between components.
 *
 * @example
 * const bus = new EventBus();
 * const unsubscribe = bus.on('layout-switched', data => {
 *     // handle event data
 * });
 * bus.emit('layout-switched', { layoutId: 'grid-2x2', monitorIndex: 0 });
 * unsubscribe();
 */
export class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    /**
     * Subscribe to an event
     *
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
        if (typeof handler !== 'function') {
            throw new Error('Event handler must be a function');
        }

        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }

        this._listeners.get(event).push(handler);

        // Return unsubscribe function
        return () => this.off(event, handler);
    }

    /**
     * Unsubscribe from an event
     *
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     * @returns {boolean} True if handler was removed
     */
    off(event, handler) {
        const listeners = this._listeners.get(event);
        if (!listeners) {
            return false;
        }

        const index = listeners.indexOf(handler);
        if (index === -1) {
            return false;
        }

        listeners.splice(index, 1);

        // Clean up empty arrays
        if (listeners.length === 0) {
            this._listeners.delete(event);
        }

        return true;
    }

    /**
     * Emit an event
     *
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        const listeners = this._listeners.get(event);
        if (!listeners) return;

        // Copy array to avoid issues if handlers modify listeners
        const listenersCopy = [...listeners];
        for (const handler of listenersCopy) {
            try {
                handler(data);
            } catch (error) {
                logger.error(`Error in event handler for '${event}'`, error);
            }
        }
    }
}
