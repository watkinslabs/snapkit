/**
 * OverrideStore - Persistent divider override storage
 *
 * When users drag dividers to resize zones, the new positions are stored
 * as overrides. These persist across sessions.
 *
 * Storage format:
 * {
 *   "layoutId:monitorIndex": [
 *     {path: "L", ratio: 0.6},
 *     {path: "R", ratio: 0.4}
 *   ]
 * }
 */

import { Logger } from '../core/logger.js';

export class OverrideStore {
    constructor() {
        this._overrides = new Map(); // key -> overrides array
        this._logger = new Logger('OverrideStore');
    }

    /**
     * Get overrides for a layout on a specific monitor
     * @param {string} layoutId
     * @param {number} monitorIndex
     * @returns {Array<{path: string, ratio: number}>}
     */
    getOverrides(layoutId, monitorIndex) {
        const key = this._getKey(layoutId, monitorIndex);
        return this._overrides.get(key) || [];
    }

    /**
     * Set overrides for a layout on a specific monitor
     * @param {string} layoutId
     * @param {number} monitorIndex
     * @param {Array<{path: string, ratio: number}>} overrides
     */
    setOverrides(layoutId, monitorIndex, overrides) {
        const key = this._getKey(layoutId, monitorIndex);
        this._overrides.set(key, [...overrides]);
        this._logger.debug('Overrides set', { layoutId, monitorIndex, count: overrides.length });
    }

    /**
     * Add or update a single override
     * @param {string} layoutId
     * @param {number} monitorIndex
     * @param {string} path - Branch path
     * @param {number} ratio - New ratio
     */
    setOverride(layoutId, monitorIndex, path, ratio) {
        const key = this._getKey(layoutId, monitorIndex);
        const overrides = this._overrides.get(key) || [];

        // Find existing override for this path
        const existingIndex = overrides.findIndex(o => o.path === path);

        if (existingIndex !== -1) {
            // Update existing
            overrides[existingIndex].ratio = ratio;
        } else {
            // Add new
            overrides.push({ path, ratio });
        }

        this._overrides.set(key, overrides);
        this._logger.debug('Override updated', { layoutId, monitorIndex, path, ratio });
    }

    /**
     * Clear overrides for a layout on a specific monitor
     * @param {string} layoutId
     * @param {number} monitorIndex
     * @returns {boolean} True if overrides were cleared
     */
    clearOverrides(layoutId, monitorIndex) {
        const key = this._getKey(layoutId, monitorIndex);
        const hadOverrides = this._overrides.has(key);
        this._overrides.delete(key);

        if (hadOverrides) {
            this._logger.debug('Overrides cleared', { layoutId, monitorIndex });
        }

        return hadOverrides;
    }

    /**
     * Clear all overrides
     */
    clearAll() {
        const count = this._overrides.size;
        this._overrides.clear();
        this._logger.debug('All overrides cleared', { count });
    }

    /**
     * Check if overrides exist for a layout/monitor
     * @param {string} layoutId
     * @param {number} monitorIndex
     * @returns {boolean}
     */
    hasOverrides(layoutId, monitorIndex) {
        const key = this._getKey(layoutId, monitorIndex);
        return this._overrides.has(key) && this._overrides.get(key).length > 0;
    }

    /**
     * Get all override keys
     * @returns {string[]} Array of "layoutId:monitorIndex" keys
     */
    getAllKeys() {
        return Array.from(this._overrides.keys());
    }

    /**
     * Serialize overrides to JSON
     * Used for saving to settings
     * @returns {string}
     */
    serialize() {
        const obj = {};
        for (const [key, overrides] of this._overrides.entries()) {
            obj[key] = overrides;
        }
        return JSON.stringify(obj);
    }

    /**
     * Deserialize overrides from JSON
     * Used for loading from settings
     * @param {string} json
     * @returns {boolean} True if successful
     */
    deserialize(json) {
        try {
            const obj = JSON.parse(json);
            this._overrides.clear();

            for (const [key, overrides] of Object.entries(obj)) {
                if (Array.isArray(overrides)) {
                    this._overrides.set(key, overrides);
                }
            }

            this._logger.debug('Overrides deserialized', { count: this._overrides.size });
            return true;
        } catch (e) {
            this._logger.error('Failed to deserialize overrides', { error: e });
            return false;
        }
    }

    /**
     * Export overrides for a specific layout
     * @param {string} layoutId
     * @returns {Object} Map of monitorIndex -> overrides
     */
    exportLayout(layoutId) {
        const result = {};

        for (const [key, overrides] of this._overrides.entries()) {
            const [lid, monitorStr] = key.split(':');
            if (lid === layoutId) {
                result[monitorStr] = overrides;
            }
        }

        return result;
    }

    /**
     * Import overrides for a specific layout
     * @param {string} layoutId
     * @param {Object} data - Map of monitorIndex -> overrides
     */
    importLayout(layoutId, data) {
        for (const [monitorStr, overrides] of Object.entries(data)) {
            const monitorIndex = parseInt(monitorStr, 10);
            if (!isNaN(monitorIndex) && Array.isArray(overrides)) {
                this.setOverrides(layoutId, monitorIndex, overrides);
            }
        }
    }

    /**
     * Get override count
     * @returns {number}
     */
    get size() {
        return this._overrides.size;
    }

    /**
     * Get total number of individual overrides
     * @returns {number}
     */
    getTotalOverrideCount() {
        let total = 0;
        for (const overrides of this._overrides.values()) {
            total += overrides.length;
        }
        return total;
    }

    /**
     * Generate storage key
     * @private
     * @param {string} layoutId
     * @param {number} monitorIndex
     * @returns {string}
     */
    _getKey(layoutId, monitorIndex) {
        return `${layoutId}:${monitorIndex}`;
    }
}
