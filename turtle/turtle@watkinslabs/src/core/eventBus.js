/**
 * EventBus - Publish/Subscribe Event System
 *
 * Provides a centralized event system for loosely-coupled communication
 * between components.
 *
 * @example
 * const bus = new EventBus();
 *
 * // Subscribe to event
 * const unsubscribe = bus.on('zone-selected', (data) => {
 *     console.log('Zone selected:', data.zoneIndex);
 * });
 *
 * // Emit event
 * bus.emit('zone-selected', { zoneIndex: 3 });
 *
 * // Unsubscribe
 * unsubscribe();
 */
export class EventBus {
    constructor() {
        this._listeners = new Map();
        this._onceListeners = new Map();
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
     * Subscribe to an event (fires once, then auto-unsubscribes)
     *
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     * @returns {Function} Unsubscribe function
     */
    once(event, handler) {
        if (typeof handler !== 'function') {
            throw new Error('Event handler must be a function');
        }

        if (!this._onceListeners.has(event)) {
            this._onceListeners.set(event, []);
        }

        this._onceListeners.get(event).push(handler);

        // Return unsubscribe function
        return () => this._removeOnceListener(event, handler);
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
        // Handle regular listeners
        const listeners = this._listeners.get(event);
        if (listeners) {
            // Copy array to avoid issues if handlers modify listeners
            const listenersCopy = [...listeners];
            for (const handler of listenersCopy) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for '${event}':`, error);
                }
            }
        }

        // Handle once listeners
        const onceListeners = this._onceListeners.get(event);
        if (onceListeners) {
            const onceListenersCopy = [...onceListeners];
            // Clear once listeners before calling them
            this._onceListeners.delete(event);

            for (const handler of onceListenersCopy) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in once handler for '${event}':`, error);
                }
            }
        }
    }

    /**
     * Remove a once listener
     *
     * @private
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     */
    _removeOnceListener(event, handler) {
        const listeners = this._onceListeners.get(event);
        if (!listeners) {
            return false;
        }

        const index = listeners.indexOf(handler);
        if (index === -1) {
            return false;
        }

        listeners.splice(index, 1);

        if (listeners.length === 0) {
            this._onceListeners.delete(event);
        }

        return true;
    }

    /**
     * Remove all listeners for an event
     *
     * @param {string} event - Event name (if omitted, clears all events)
     */
    clear(event) {
        if (event) {
            this._listeners.delete(event);
            this._onceListeners.delete(event);
        } else {
            this._listeners.clear();
            this._onceListeners.clear();
        }
    }

    /**
     * Get number of listeners for an event
     *
     * @param {string} event - Event name
     * @returns {number}
     */
    listenerCount(event) {
        const regular = this._listeners.get(event)?.length || 0;
        const once = this._onceListeners.get(event)?.length || 0;
        return regular + once;
    }

    /**
     * Get all event names with listeners
     *
     * @returns {string[]}
     */
    eventNames() {
        const regular = Array.from(this._listeners.keys());
        const once = Array.from(this._onceListeners.keys());
        return [...new Set([...regular, ...once])];
    }
}
