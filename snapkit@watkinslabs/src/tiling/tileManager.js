/**
 * TileManager - Manages tile groups and layout-wide resnaps
 *
 * When windows are snapped to zones using the same layout, they form a "tile group".
 * DividerSyncManager is the authoritative owner of divider-drag resize sync.
 *
 * Responsibilities:
 * - Track tile groups (windows using same layout on same monitor)
 * - Provide group lookup/resnap helpers for other components
 * - Apply override-backed layout resnaps on request
 */

import Meta from 'gi://Meta';

import { Logger } from '../core/logger.js';

/**
 * Tile group - windows sharing a layout
 * @typedef {Object} TileGroup
 * @property {number} monitorIndex
 * @property {string} layoutId
 * @property {Meta.Window[]} windows
 * @property {Object} layout - Layout definition
 * @property {Object} options - Resolution options
 */

export class TileManager {
    /**
     * @param {WindowTracker} windowTracker
     * @param {SnapHandler} snapHandler
     * @param {OverrideStore} overrideStore
 * @param {MonitorManager} monitorManager
 * @param {LayoutManager} layoutManager
 */
    constructor(windowTracker, snapHandler, overrideStore, monitorManager, layoutManager) {
        if (!windowTracker || !snapHandler || !overrideStore || !monitorManager || !layoutManager) {
            throw new Error('All dependencies are required');
        }

        this._windowTracker = windowTracker;
        this._snapHandler = snapHandler;
        this._overrideStore = overrideStore;
        this._monitorManager = monitorManager;
        this._layoutManager = layoutManager;
        this._logger = new Logger('TileManager');

        this._resizeListeners = new Map(); // window -> signal ID
    }

    /**
     * Initialize tile manager
     * Sets up window resize listeners
     */
    initialize() {
        // Connect to window size changes
        this._windowSizeChangedId = global.display.connect('window-created', (display, window) => {
            this._connectWindowSignals(window);
        });

        // Connect existing windows
        const windows = global.get_window_actors().map(a => a.get_meta_window());
        for (const window of windows) {
            this._connectWindowSignals(window);
        }

        this._logger.info('TileManager initialized');
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this._windowSizeChangedId) {
            global.display.disconnect(this._windowSizeChangedId);
            this._windowSizeChangedId = null;
        }

        // Disconnect all window listeners
        for (const [window, signalId] of this._resizeListeners.entries()) {
            try {
                window.disconnect(signalId);
            } catch (e) {
                // Window may be destroyed
            }
        }
        this._resizeListeners.clear();

        this._logger.info('TileManager destroyed');
    }

    /**
     * Connect resize signals for a window
     * @private
     * @param {Meta.Window} window
     */
    _connectWindowSignals(window) {
        if (this._resizeListeners.has(window)) {
            return; // Already connected
        }

        const signalId = window.connect('size-changed', () => {
            this._onWindowResized(window);
        });

        this._resizeListeners.set(window, signalId);
    }

    /**
     * Handle window resize
     * @private
     * @param {Meta.Window} window
     */
    _onWindowResized(window) {
        // Check if window is tracked
        const info = this._windowTracker.getWindowInfo(window);
        if (!info) {
            return;
        }

        // Check if window is in a tile group
        const group = this.getTileGroup(info.monitorIndex, info.layoutId);
        if (!group || group.windows.length <= 1) {
            return;
        }

        // DividerSyncManager is the single resize authority.
        // Ignore size-changed resnaps here to prevent "snap back" jitter/rollback.
        this._logger.debug('Ignoring size-changed for multi-window tile group', {
            windowTitle: window.get_title(),
            monitorIndex: info.monitorIndex,
            layoutId: info.layoutId
        });
    }

    /**
     * Build resolution options for a layout on a monitor
     * @private
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @param {Object} baseOptions
     * @returns {Object}
     */
    _buildResolutionOptions(monitorIndex, layoutId, baseOptions = {}) {
        if (Array.isArray(baseOptions.overrides)) {
            return baseOptions;
        }

        return {
            ...baseOptions,
            overrides: this._overrideStore.getOverrides(layoutId, monitorIndex)
        };
    }

    /**
     * Get tile group for a layout on a monitor
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @returns {TileGroup|null}
     */
    getTileGroup(monitorIndex, layoutId) {
        const windows = this._windowTracker.getWindowsInLayoutOnMonitor(monitorIndex, layoutId);

        if (windows.length === 0) {
            return null;
        }

        const layoutDef = this._layoutManager.getLayout(layoutId);
        if (!layoutDef) {
            this._logger.warn('Layout not found for tile group', { monitorIndex, layoutId });
            return null;
        }

        const options = this._buildResolutionOptions(monitorIndex, layoutId);

        return {
            monitorIndex,
            layoutId,
            windows,
            layout: layoutDef.layout ?? layoutDef,
            options
        };
    }

    /**
     * Get all tile groups
     *
     * @returns {TileGroup[]}
     */
    getAllTileGroups() {
        const groups = [];

        // Group by monitor and layout
        const groupKeys = new Set();

        for (const window of this._windowTracker.getAllTrackedWindows()) {
            const info = this._windowTracker.getWindowInfo(window);
            if (info) {
                const key = `${info.monitorIndex}:${info.layoutId}`;
                groupKeys.add(key);
            }
        }

        // Build tile groups
        for (const key of groupKeys) {
            const [monitorStr, layoutId] = key.split(':');
            const monitorIndex = parseInt(monitorStr, 10);

            const group = this.getTileGroup(monitorIndex, layoutId);
            if (group) {
                groups.push(group);
            }
        }

        return groups;
    }

    /**
     * Re-snap all windows in a layout on a monitor
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @param {Object} layoutOrDef
     * @param {Object} baseOptions
     * @returns {number} Number of windows re-snapped
     */
    resnapLayout(monitorIndex, layoutId, layoutOrDef = null, baseOptions = {}) {
        const layoutDef = layoutOrDef || this._layoutManager.getLayout(layoutId);
        if (!layoutDef) {
            this._logger.warn('Cannot resnap: layout not found', { monitorIndex, layoutId });
            return 0;
        }

        const layout = layoutDef.layout ?? layoutDef;
        const options = this._buildResolutionOptions(monitorIndex, layoutId, baseOptions);
        return this._snapHandler.resnapLayout(monitorIndex, layoutId, layout, options);
    }

    /**
     * Update divider override and resnap group
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @param {string} dividerPath - Branch path
     * @param {number} newRatio - New split ratio
     * @param {Object} layout - Layout definition
     * @param {Object} baseOptions - Base resolution options
     * @returns {boolean} True if successful
     */
    updateDivider(monitorIndex, layoutId, dividerPath, newRatio, layout, baseOptions = {}) {
        // Get existing overrides
        const existingOverrides = this._overrideStore.getOverrides(layoutId, monitorIndex);

        // Update or add this override
        const newOverrides = [...existingOverrides];
        const existingIndex = newOverrides.findIndex(o => o.path === dividerPath);

        if (existingIndex !== -1) {
            newOverrides[existingIndex].ratio = newRatio;
        } else {
            newOverrides.push({ path: dividerPath, ratio: newRatio });
        }

        // Save override
        this._overrideStore.setOverrides(layoutId, monitorIndex, newOverrides);

        // Resnap all windows with new overrides
        const options = {
            ...baseOptions,
            overrides: newOverrides
        };

        const count = this._snapHandler.resnapLayout(monitorIndex, layoutId, layout, options);

        this._logger.info('Divider updated', {
            monitorIndex,
            layoutId,
            dividerPath,
            newRatio,
            windowsResnapped: count
        });

        return count > 0;
    }

    /**
     * Clear all overrides for a layout and resnap
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @param {Object} layout
     * @param {Object} baseOptions
     * @returns {number} Number of windows resnapped
     */
    resetLayout(monitorIndex, layoutId, layout, baseOptions = {}) {
        // Clear overrides
        this._overrideStore.clearOverrides(layoutId, monitorIndex);

        // Resnap without overrides
        const count = this._snapHandler.resnapLayout(monitorIndex, layoutId, layout, baseOptions);

        this._logger.info('Layout reset', { monitorIndex, layoutId, windowsResnapped: count });

        return count;
    }
}
