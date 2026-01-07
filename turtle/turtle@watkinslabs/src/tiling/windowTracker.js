/**
 * WindowTracker - Tracks windows positioned in zones
 *
 * Maintains mapping:
 * - Zone → Window
 * - Window → Zone
 *
 * Used for:
 * - Knowing which windows are snapped
 * - Resize synchronization
 * - Tile group management
 */

import Meta from 'gi://Meta';

import { Logger } from '../core/logger.js';

/**
 * Window info
 * @typedef {Object} WindowInfo
 * @property {Meta.Window} window - The window
 * @property {number} monitorIndex - Monitor index
 * @property {string} layoutId - Layout ID
 * @property {number} zoneIndex - Zone index
 * @property {number} timestamp - When window was positioned
 */

export class WindowTracker {
    constructor() {
        this._logger = new Logger('WindowTracker');
        this._windowToInfo = new Map(); // window -> WindowInfo
        this._zoneToWindow = new Map(); // "monitorIndex:layoutId:zoneIndex" -> window
    }

    /**
     * Track a window in a zone
     *
     * @param {Meta.Window} window
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @param {number} zoneIndex
     */
    trackWindow(window, monitorIndex, layoutId, zoneIndex) {
        if (!window) {
            throw new Error('window is required');
        }

        // Remove previous tracking if exists
        this.untrackWindow(window);

        const info = {
            window,
            monitorIndex,
            layoutId,
            zoneIndex,
            timestamp: Date.now()
        };

        this._windowToInfo.set(window, info);

        const zoneKey = this._getZoneKey(monitorIndex, layoutId, zoneIndex);
        this._zoneToWindow.set(zoneKey, window);

        this._logger.debug('Window tracked', {
            windowTitle: window.get_title(),
            monitorIndex,
            layoutId,
            zoneIndex
        });
    }

    /**
     * Stop tracking a window
     *
     * @param {Meta.Window} window
     * @returns {boolean} True if window was tracked
     */
    untrackWindow(window) {
        if (!window) {
            return false;
        }

        const info = this._windowToInfo.get(window);
        if (!info) {
            return false;
        }

        // Remove from both maps
        this._windowToInfo.delete(window);

        const zoneKey = this._getZoneKey(info.monitorIndex, info.layoutId, info.zoneIndex);
        this._zoneToWindow.delete(zoneKey);

        this._logger.debug('Window untracked', {
            windowTitle: window.get_title()
        });

        return true;
    }

    /**
     * Get window info
     *
     * @param {Meta.Window} window
     * @returns {WindowInfo|null}
     */
    getWindowInfo(window) {
        return this._windowToInfo.get(window) || null;
    }

    /**
     * Check if window is tracked
     *
     * @param {Meta.Window} window
     * @returns {boolean}
     */
    isWindowTracked(window) {
        return this._windowToInfo.has(window);
    }

    /**
     * Get window in a zone
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @param {number} zoneIndex
     * @returns {Meta.Window|null}
     */
    getWindowInZone(monitorIndex, layoutId, zoneIndex) {
        const zoneKey = this._getZoneKey(monitorIndex, layoutId, zoneIndex);
        return this._zoneToWindow.get(zoneKey) || null;
    }

    /**
     * Check if zone has a window
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @param {number} zoneIndex
     * @returns {boolean}
     */
    isZoneFilled(monitorIndex, layoutId, zoneIndex) {
        return this.getWindowInZone(monitorIndex, layoutId, zoneIndex) !== null;
    }

    /**
     * Get all tracked windows
     *
     * @returns {Meta.Window[]}
     */
    getAllTrackedWindows() {
        return Array.from(this._windowToInfo.keys());
    }

    /**
     * Get all windows on a monitor
     *
     * @param {number} monitorIndex
     * @returns {Meta.Window[]}
     */
    getWindowsOnMonitor(monitorIndex) {
        const windows = [];
        for (const [window, info] of this._windowToInfo.entries()) {
            if (info.monitorIndex === monitorIndex) {
                windows.push(window);
            }
        }
        return windows;
    }

    /**
     * Get all windows using a layout
     *
     * @param {string} layoutId
     * @returns {Meta.Window[]}
     */
    getWindowsInLayout(layoutId) {
        const windows = [];
        for (const [window, info] of this._windowToInfo.entries()) {
            if (info.layoutId === layoutId) {
                windows.push(window);
            }
        }
        return windows;
    }

    /**
     * Get all windows in a layout on a monitor
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @returns {Meta.Window[]}
     */
    getWindowsInLayoutOnMonitor(monitorIndex, layoutId) {
        const windows = [];
        for (const [window, info] of this._windowToInfo.entries()) {
            if (info.monitorIndex === monitorIndex && info.layoutId === layoutId) {
                windows.push(window);
            }
        }
        return windows;
    }

    /**
     * Get filled zones for a layout on a monitor
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @returns {number[]} Array of zone indices
     */
    getFilledZones(monitorIndex, layoutId) {
        const zones = [];
        for (const [window, info] of this._windowToInfo.entries()) {
            if (info.monitorIndex === monitorIndex && info.layoutId === layoutId) {
                zones.push(info.zoneIndex);
            }
        }
        return zones.sort((a, b) => a - b);
    }

    /**
     * Clear all tracking
     */
    clear() {
        const count = this._windowToInfo.size;
        this._windowToInfo.clear();
        this._zoneToWindow.clear();
        this._logger.debug('All tracking cleared', { count });
    }

    /**
     * Clear tracking for a specific layout
     *
     * @param {string} layoutId
     * @returns {number} Number of windows untracked
     */
    clearLayout(layoutId) {
        const windows = this.getWindowsInLayout(layoutId);
        for (const window of windows) {
            this.untrackWindow(window);
        }
        this._logger.debug('Layout tracking cleared', { layoutId, count: windows.length });
        return windows.length;
    }

    /**
     * Clear tracking for a specific monitor
     *
     * @param {number} monitorIndex
     * @returns {number} Number of windows untracked
     */
    clearMonitor(monitorIndex) {
        const windows = this.getWindowsOnMonitor(monitorIndex);
        for (const window of windows) {
            this.untrackWindow(window);
        }
        this._logger.debug('Monitor tracking cleared', { monitorIndex, count: windows.length });
        return windows.length;
    }

    /**
     * Get tracking statistics
     *
     * @returns {{totalWindows: number, monitors: Object, layouts: Object}}
     */
    getStats() {
        const monitors = {};
        const layouts = {};

        for (const info of this._windowToInfo.values()) {
            // Count by monitor
            monitors[info.monitorIndex] = (monitors[info.monitorIndex] || 0) + 1;

            // Count by layout
            layouts[info.layoutId] = (layouts[info.layoutId] || 0) + 1;
        }

        return {
            totalWindows: this._windowToInfo.size,
            monitors,
            layouts
        };
    }

    /**
     * Generate zone key
     * @private
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @param {number} zoneIndex
     * @returns {string}
     */
    _getZoneKey(monitorIndex, layoutId, zoneIndex) {
        return `${monitorIndex}:${layoutId}:${zoneIndex}`;
    }
}
