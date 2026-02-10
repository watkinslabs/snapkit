import { BaseState } from './baseState.js';

/**
 * LayoutState - Tracks active layouts per monitor
 *
 * Manages:
 * - Which layout is active on each monitor
 * - Per-monitor layout selection
 * - Layout changes
 */
export class LayoutState extends BaseState {
    constructor() {
        super();
        this._monitorLayouts = new Map(); // monitor index -> layout id
    }

    /**
     * Set layout for a monitor
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     */
    setLayoutForMonitor(monitorIndex, layoutId) {
        if (typeof monitorIndex !== 'number') {
            throw new Error('monitorIndex must be a number');
        }

        if (!layoutId) {
            throw new Error('layoutId is required');
        }

        const oldState = this._getStateSnapshot();
        this._monitorLayouts.set(monitorIndex, layoutId);
        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);
    }

    /**
     * Get layout for a monitor
     *
     * @param {number} monitorIndex
     * @returns {string|null}
     */
    getLayoutForMonitor(monitorIndex) {
        return this._monitorLayouts.get(monitorIndex) || null;
    }

    /**
     * Check if monitor has a layout set
     *
     * @param {number} monitorIndex
     * @returns {boolean}
     */
    hasLayoutForMonitor(monitorIndex) {
        return this._monitorLayouts.has(monitorIndex);
    }

    /**
     * Clear layout for a monitor
     *
     * @param {number} monitorIndex
     * @returns {boolean} True if layout was cleared
     */
    clearLayoutForMonitor(monitorIndex) {
        if (!this._monitorLayouts.has(monitorIndex)) {
            return false;
        }

        const oldState = this._getStateSnapshot();
        this._monitorLayouts.delete(monitorIndex);
        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);

        return true;
    }

    /**
     * Clear all layouts
     */
    clearAll() {
        if (this._monitorLayouts.size === 0) {
            return;
        }

        const oldState = this._getStateSnapshot();
        this._monitorLayouts.clear();
        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);
    }

    /**
     * Get all monitor indices with layouts
     *
     * @returns {number[]}
     */
    getMonitorsWithLayouts() {
        return Array.from(this._monitorLayouts.keys());
    }

    /**
     * Get all layouts
     *
     * @returns {Map<number, string>} Map of monitor index -> layout id
     */
    getAllLayouts() {
        return new Map(this._monitorLayouts);
    }

    /**
     * Get number of monitors with layouts
     *
     * @returns {number}
     */
    get monitorCount() {
        return this._monitorLayouts.size;
    }

    /**
     * Get state snapshot for change notification
     *
     * @private
     * @returns {Object}
     */
    _getStateSnapshot() {
        return {
            monitorLayouts: new Map(this._monitorLayouts)
        };
    }
}
