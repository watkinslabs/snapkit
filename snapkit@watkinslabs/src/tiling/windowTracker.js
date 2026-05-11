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
    /**
     * @param {EventBus} eventBus - Optional event bus for emitting events
     */
    constructor(eventBus = null) {
        this._logger = new Logger('WindowTracker');
        this._eventBus = eventBus;
        this._windowToInfo = new Map(); // window -> WindowInfo
        this._zoneToWindow = new Map(); // "monitorIndex:layoutId:zoneIndex" -> window
        this._windowSignals = new Map(); // window -> signal id
        this._wmSignalId = null;
    }

    /**
     * Initialize window tracker - connect to window manager signals
     */
    initialize() {
        if (this._wmSignalId) {
            return; // Already initialized
        }

        // Listen for window destruction via window manager
        try {
            this._wmSignalId = global.window_manager.connect('destroy', (wm, actor) => {
                const window = actor.meta_window;
                if (window && this._windowToInfo.has(window)) {
                    this._logger.debug('Window destroyed, untracking', {
                        windowTitle: window.get_title?.() || 'unknown'
                    });
                    this.untrackWindow(window);
                }
            });
        } catch (error) {
            this._logger.error('Failed to connect to window manager', { error });
        }
    }

    /**
     * Destroy window tracker - disconnect signals
     */
    destroy() {
        // Disconnect window manager signal
        if (this._wmSignalId && global.window_manager) {
            try {
                global.window_manager.disconnect(this._wmSignalId);
            } catch (e) {
                // Ignore if already disconnected
            }
            this._wmSignalId = null;
        }

        // Clear all tracking
        this.clear();
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

        // Remove previous tracking for this window.
        this.untrackWindow(window);
        this._removeZoneMappingsForWindow(window);

        // Enforce one-window-per-zone by evicting an existing occupant first.
        const zoneKey = this._getZoneKey(monitorIndex, layoutId, zoneIndex);
        const existingOccupant = this.getWindowInZone(monitorIndex, layoutId, zoneIndex);
        if (existingOccupant && existingOccupant !== window) {
            const existingInfo = this._windowToInfo.get(existingOccupant);
            const existingTitle = existingOccupant.get_title?.() || 'unknown';
            this._logger.debug('Zone already occupied, untracking existing occupant', {
                monitorIndex,
                layoutId,
                zoneIndex,
                existingTitle,
                existingZoneIndex: existingInfo?.zoneIndex ?? null
            });

            const removed = this.untrackWindow(existingOccupant);
            if (!removed) {
                // Occupant mapping can be stale if we loaded from an inconsistent state.
                this._zoneToWindow.delete(zoneKey);
            }
        }

        const info = {
            window,
            monitorIndex,
            layoutId,
            zoneIndex,
            timestamp: Date.now()
        };

        this._windowToInfo.set(window, info);

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

        // Remove from primary map first.
        this._windowToInfo.delete(window);

        const zoneKey = this._getZoneKey(info.monitorIndex, info.layoutId, info.zoneIndex);
        const mappedWindow = this._zoneToWindow.get(zoneKey);
        if (mappedWindow === window) {
            this._zoneToWindow.delete(zoneKey);
        } else if (mappedWindow) {
            this._logger.warn('Zone mapping pointed to a different window during untrack', {
                zoneKey
            });
        }

        // Remove any stale duplicate mappings that still point to this window.
        const staleRemoved = this._removeZoneMappingsForWindow(window);

        this._logger.debug('Window untracked', {
            windowTitle: window.get_title(),
            staleMappingsRemoved: staleRemoved
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
        const window = this._zoneToWindow.get(zoneKey);
        if (!window) {
            return null;
        }

        const info = this._windowToInfo.get(window);
        const mappingIsValid = !!info &&
            info.monitorIndex === monitorIndex &&
            info.layoutId === layoutId &&
            info.zoneIndex === zoneIndex;

        if (!mappingIsValid) {
            this._logger.warn('Clearing stale zone mapping', { zoneKey });
            this._zoneToWindow.delete(zoneKey);
            return null;
        }

        return window;
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

    /**
     * Remove any zone entries that still point to a specific window.
     * @private
     * @param {Meta.Window} window
     * @returns {number} Number of removed mappings
     */
    _removeZoneMappingsForWindow(window) {
        let removed = 0;
        for (const [zoneKey, mappedWindow] of this._zoneToWindow.entries()) {
            if (mappedWindow === window) {
                this._zoneToWindow.delete(zoneKey);
                removed++;
            }
        }
        return removed;
    }
}
