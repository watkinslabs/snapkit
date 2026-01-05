/**
 * TileManager - Manages tile groups and resize synchronization
 *
 * When windows are snapped to zones using the same layout, they form a "tile group".
 * When one window is resized (divider dragging), all windows in the group resize together.
 *
 * Responsibilities:
 * - Track tile groups (windows using same layout on same monitor)
 * - Detect divider dragging
 * - Synchronize window resizes
 * - Update divider overrides
 * - Save overrides to OverrideStore
 */

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
     */
    constructor(windowTracker, snapHandler, overrideStore, monitorManager) {
        if (!windowTracker || !snapHandler || !overrideStore || !monitorManager) {
            throw new Error('All dependencies are required');
        }

        this._windowTracker = windowTracker;
        this._snapHandler = snapHandler;
        this._overrideStore = overrideStore;
        this._monitorManager = monitorManager;
        this._logger = new Logger('TileManager');

        this._resizeListeners = new Map(); // window -> signal ID
        this._isResizing = false; // Prevent recursive resize handling
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
        // Ignore if we're already handling a resize (prevent recursion)
        if (this._isResizing) {
            return;
        }

        // Check if window is tracked
        const info = this._windowTracker.getWindowInfo(window);
        if (!info) {
            return;
        }

        // Check if window is in a tile group
        const group = this.getTileGroup(info.monitorIndex, info.layoutId);
        if (!group || group.windows.length <= 1) {
            return; // Single window, no sync needed
        }

        this._logger.debug('Window resized in tile group', {
            windowTitle: window.get_title(),
            monitorIndex: info.monitorIndex,
            layoutId: info.layoutId
        });

        // Handle resize sync
        this._handleResizeSync(window, info, group);
    }

    /**
     * Handle resize synchronization
     * @private
     * @param {Meta.Window} window - Window that was resized
     * @param {Object} info - Window info
     * @param {TileGroup} group - Tile group
     */
    _handleResizeSync(window, info, group) {
        this._isResizing = true;

        try {
            // Get current window geometry
            const windowRect = window.get_frame_rect();

            // Get expected zone geometry
            const zoneRects = this._snapHandler.getZoneRects(
                info.monitorIndex,
                group.layout,
                group.options
            );

            if (!zoneRects) {
                return;
            }

            const expectedZone = zoneRects[info.zoneIndex];
            if (!expectedZone) {
                return;
            }

            // Calculate how much the window deviated from expected zone
            // This tells us how the divider moved
            const deltaX = windowRect.x - expectedZone.x;
            const deltaY = windowRect.y - expectedZone.y;
            const deltaWidth = windowRect.width - expectedZone.width;
            const deltaHeight = windowRect.height - expectedZone.height;

            // If window moved/resized significantly, calculate new overrides
            if (Math.abs(deltaWidth) > 10 || Math.abs(deltaHeight) > 10) {
                this._updateOverridesFromResize(info, group, windowRect, expectedZone);
            }
        } finally {
            this._isResizing = false;
        }
    }

    /**
     * Update divider overrides based on window resize
     * @private
     * @param {Object} info - Window info
     * @param {TileGroup} group - Tile group
     * @param {Object} windowRect - Current window geometry
     * @param {Object} expectedZone - Expected zone geometry
     */
    _updateOverridesFromResize(info, group, windowRect, expectedZone) {
        // This is complex - we need to:
        // 1. Determine which divider was moved based on resize
        // 2. Calculate new ratio for that divider
        // 3. Update override
        // 4. Resnap all windows in group

        // For now, simplified: just resnap all windows
        // TODO: Implement proper divider detection and override calculation
        this._logger.debug('Resize detected, would update overrides here');

        // Resnap all windows in group to maintain consistent layout
        this._resnapGroup(group);
    }

    /**
     * Resnap all windows in a tile group
     * @private
     * @param {TileGroup} group
     */
    _resnapGroup(group) {
        this._isResizing = true;

        try {
            this._snapHandler.resnapLayout(
                group.monitorIndex,
                group.layoutId,
                group.layout,
                group.options
            );
        } finally {
            this._isResizing = false;
        }
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

        // Get layout definition (would need LayoutManager integration)
        // For now, return basic group info
        return {
            monitorIndex,
            layoutId,
            windows,
            layout: null, // TODO: Get from LayoutManager
            options: {}   // TODO: Get from settings
        };
    }

    /**
     * Get all tile groups
     *
     * @returns {TileGroup[]}
     */
    getAllTileGroups() {
        const groups = [];
        const stats = this._windowTracker.getStats();

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
