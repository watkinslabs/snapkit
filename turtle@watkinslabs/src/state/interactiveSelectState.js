import { BaseState } from './baseState.js';

/**
 * InteractiveSelectState - State for interactive zone selection workflow
 *
 * Tracks the workflow:
 * 1. User opens overlay (via trigger or shortcut)
 * 2. User selects zone (click or keyboard)
 * 3. User selects window from list
 * 4. Window snapped to zone
 * 5. Return to step 2 or close
 *
 * This state tracks:
 * - Active layout and zones
 * - Current zone selection
 * - Which zones have been filled
 * - Which monitor we're working on
 */
export class InteractiveSelectState extends BaseState {
    constructor() {
        super();
        this._isActive = false;
        this._layout = null;
        this._zones = null;
        this._currentZoneIndex = null;
        this._filledZones = new Set();
        this._monitor = null;
    }

    /**
     * Check if interactive select is active
     *
     * @returns {boolean}
     */
    get isActive() {
        return this._isActive;
    }

    /**
     * Get current layout
     *
     * @returns {Object|null}
     */
    get layout() {
        return this._layout;
    }

    /**
     * Get zones
     *
     * @returns {Array|null}
     */
    get zones() {
        return this._zones;
    }

    /**
     * Get current zone index
     *
     * @returns {number|null}
     */
    get currentZoneIndex() {
        return this._currentZoneIndex;
    }

    /**
     * Get filled zones
     *
     * @returns {Set<number>}
     */
    get filledZones() {
        return new Set(this._filledZones);
    }

    /**
     * Get monitor
     *
     * @returns {number|null}
     */
    get monitor() {
        return this._monitor;
    }

    /**
     * Start interactive select workflow
     *
     * @param {Object} layout - Layout definition
     * @param {Array} zones - Resolved zone rectangles
     * @param {number} monitor - Monitor index
     */
    start(layout, zones, monitor) {
        if (this._isActive) {
            console.warn('Interactive select already active');
            return;
        }

        const oldState = this._getStateSnapshot();

        this._isActive = true;
        this._layout = layout;
        this._zones = zones;
        this._currentZoneIndex = null;
        this._filledZones.clear();
        this._monitor = monitor;

        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);
    }

    /**
     * Select a zone
     *
     * @param {number} zoneIndex
     * @throws {Error} If zone index is invalid
     */
    selectZone(zoneIndex) {
        if (!this._isActive) {
            throw new Error('Interactive select not active');
        }

        if (!this._zones || zoneIndex < 0 || zoneIndex >= this._zones.length) {
            throw new Error(`Invalid zone index: ${zoneIndex}`);
        }

        const oldState = this._getStateSnapshot();
        this._currentZoneIndex = zoneIndex;
        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);
    }

    /**
     * Mark zone as filled
     *
     * @param {number} zoneIndex
     */
    markZoneFilled(zoneIndex) {
        if (!this._isActive) {
            return;
        }

        const oldState = this._getStateSnapshot();
        this._filledZones.add(zoneIndex);
        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);
    }

    /**
     * Navigate to next zone
     *
     * @returns {number|null} New zone index
     */
    nextZone() {
        if (!this._isActive || !this._zones) {
            return null;
        }

        const currentIndex = this._currentZoneIndex ?? -1;
        const nextIndex = (currentIndex + 1) % this._zones.length;

        this.selectZone(nextIndex);
        return nextIndex;
    }

    /**
     * Navigate to previous zone
     *
     * @returns {number|null} New zone index
     */
    previousZone() {
        if (!this._isActive || !this._zones) {
            return null;
        }

        const currentIndex = this._currentZoneIndex ?? 0;
        const prevIndex = (currentIndex - 1 + this._zones.length) % this._zones.length;

        this.selectZone(prevIndex);
        return prevIndex;
    }

    /**
     * Check if zone is filled
     *
     * @param {number} zoneIndex
     * @returns {boolean}
     */
    isZoneFilled(zoneIndex) {
        return this._filledZones.has(zoneIndex);
    }

    /**
     * Get number of filled zones
     *
     * @returns {number}
     */
    get filledZoneCount() {
        return this._filledZones.size;
    }

    /**
     * End interactive select workflow
     */
    end() {
        if (!this._isActive) {
            return;
        }

        const oldState = this._getStateSnapshot();

        this._isActive = false;
        this._layout = null;
        this._zones = null;
        this._currentZoneIndex = null;
        this._filledZones.clear();
        this._monitor = null;

        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);
    }

    /**
     * Reset state (emergency cleanup)
     */
    reset() {
        const oldState = this._getStateSnapshot();

        this._isActive = false;
        this._layout = null;
        this._zones = null;
        this._currentZoneIndex = null;
        this._filledZones.clear();
        this._monitor = null;

        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);
    }

    /**
     * Get state snapshot for change notification
     *
     * @private
     * @returns {Object}
     */
    _getStateSnapshot() {
        return {
            isActive: this._isActive,
            layout: this._layout,
            zones: this._zones,
            currentZoneIndex: this._currentZoneIndex,
            filledZones: new Set(this._filledZones),
            monitor: this._monitor
        };
    }
}
