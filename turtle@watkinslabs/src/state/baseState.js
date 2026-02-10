/**
 * BaseState - Base class for all state objects
 *
 * Provides:
 * - Observer pattern for state changes
 * - State history for debugging
 * - State validation
 *
 * @abstract
 */
export class BaseState {
    constructor() {
        this._subscribers = [];
        this._history = [];
        this._maxHistory = 50;
    }

    /**
     * Subscribe to state changes
     *
     * @param {Function} callback - Called with (oldState, newState)
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        this._subscribers.push(callback);

        // Return unsubscribe function
        return () => {
            const index = this._subscribers.indexOf(callback);
            if (index !== -1) {
                this._subscribers.splice(index, 1);
            }
        };
    }

    /**
     * Notify all subscribers of state change
     *
     * @protected
     * @param {*} oldState - Previous state
     * @param {*} newState - New state
     */
    _notifySubscribers(oldState, newState) {
        // Add to history
        this._addToHistory(oldState, newState);

        // Notify subscribers
        for (const callback of this._subscribers) {
            try {
                callback(oldState, newState);
            } catch (error) {
                console.error('Error in state change subscriber:', error);
            }
        }
    }

    /**
     * Add state change to history
     *
     * @private
     * @param {*} oldState
     * @param {*} newState
     */
    _addToHistory(oldState, newState) {
        this._history.push({
            timestamp: Date.now(),
            oldState: this._cloneState(oldState),
            newState: this._cloneState(newState)
        });

        // Limit history size
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        }
    }

    /**
     * Clone state for history
     *
     * @private
     * @param {*} state
     * @returns {*}
     */
    _cloneState(state) {
        if (state === null || state === undefined) {
            return state;
        }

        if (typeof state === 'object') {
            try {
                return JSON.parse(JSON.stringify(state));
            } catch (e) {
                return String(state);
            }
        }

        return state;
    }

    /**
     * Get state change history
     *
     * @returns {Array}
     */
    getHistory() {
        return [...this._history];
    }

    /**
     * Clear state change history
     */
    clearHistory() {
        this._history = [];
    }

    /**
     * Get number of subscribers
     *
     * @returns {number}
     */
    get subscriberCount() {
        return this._subscribers.length;
    }

    /**
     * Clear all subscribers
     */
    clearSubscribers() {
        this._subscribers = [];
    }
}
