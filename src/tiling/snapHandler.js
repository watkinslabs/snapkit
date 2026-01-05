/**
 * SnapHandler - Snaps windows to zones
 *
 * This is where BTree layouts meet real windows.
 *
 * Process:
 * 1. Get zone rectangle from layout resolver
 * 2. Calculate window geometry (handle constraints)
 * 3. Move/resize window to fit zone
 * 4. Track window in WindowTracker
 *
 * Handles:
 * - Window constraints (min/max size)
 * - Maximized/fullscreen windows
 * - Window decorations
 */

import { Logger } from '../core/logger.js';

export class SnapHandler {
    /**
     * @param {LayoutResolver} layoutResolver
     * @param {WindowTracker} windowTracker
     * @param {MonitorManager} monitorManager
     */
    constructor(layoutResolver, windowTracker, monitorManager) {
        if (!layoutResolver || !windowTracker || !monitorManager) {
            throw new Error('layoutResolver, windowTracker, and monitorManager are required');
        }

        this._layoutResolver = layoutResolver;
        this._windowTracker = windowTracker;
        this._monitorManager = monitorManager;
        this._logger = new Logger('SnapHandler');
    }

    /**
     * Snap a window to a zone
     *
     * @param {Meta.Window} window - Window to snap
     * @param {number} monitorIndex - Monitor index
     * @param {string} layoutId - Layout ID
     * @param {number} zoneIndex - Zone index
     * @param {Object} layout - Layout definition
     * @param {Object} options - Options {margin, padding, overrides}
     * @returns {boolean} True if snap successful
     */
    snapToZone(window, monitorIndex, layoutId, zoneIndex, layout, options = {}) {
        if (!window) {
            this._logger.warn('snapToZone: window is null');
            return false;
        }

        // Get work area for monitor
        const workArea = this._monitorManager.getWorkArea(monitorIndex);
        if (!workArea) {
            this._logger.warn('snapToZone: invalid monitor', { monitorIndex });
            return false;
        }

        try {
            // Resolve layout to get zone rectangles
            const zones = this._layoutResolver.resolve(layout, workArea, options);

            if (zoneIndex < 0 || zoneIndex >= zones.length) {
                this._logger.warn('snapToZone: invalid zone index', { zoneIndex, zoneCount: zones.length });
                return false;
            }

            const zoneRect = zones[zoneIndex];

            // Unmaximize if needed
            if (window.get_maximized()) {
                window.unmaximize(Meta.MaximizeFlags.BOTH);
            }

            // Calculate final window geometry (handle constraints)
            const windowGeom = this._calculateWindowGeometry(window, zoneRect);

            // Move and resize window
            window.move_resize_frame(
                true, // user_op
                windowGeom.x,
                windowGeom.y,
                windowGeom.width,
                windowGeom.height
            );

            // Track window
            this._windowTracker.trackWindow(window, monitorIndex, layoutId, zoneIndex);

            this._logger.debug('Window snapped', {
                windowTitle: window.get_title(),
                monitorIndex,
                layoutId,
                zoneIndex,
                geometry: windowGeom
            });

            return true;
        } catch (error) {
            this._logger.error('Failed to snap window', {
                error,
                monitorIndex,
                layoutId,
                zoneIndex
            });
            return false;
        }
    }

    /**
     * Calculate window geometry considering constraints
     *
     * @private
     * @param {Meta.Window} window
     * @param {Object} zoneRect - {x, y, width, height}
     * @returns {Object} {x, y, width, height}
     */
    _calculateWindowGeometry(window, zoneRect) {
        // Get window hints (min/max size)
        const hints = window.get_size_hints();

        let width = zoneRect.width;
        let height = zoneRect.height;

        // Apply min size constraint
        if (hints.min_width && width < hints.min_width) {
            width = hints.min_width;
        }
        if (hints.min_height && height < hints.min_height) {
            height = hints.min_height;
        }

        // Apply max size constraint
        if (hints.max_width && width > hints.max_width) {
            width = hints.max_width;
        }
        if (hints.max_height && height > hints.max_height) {
            height = hints.max_height;
        }

        // Center window in zone if size was constrained
        let x = zoneRect.x;
        let y = zoneRect.y;

        if (width < zoneRect.width) {
            x = zoneRect.x + Math.floor((zoneRect.width - width) / 2);
        }

        if (height < zoneRect.height) {
            y = zoneRect.y + Math.floor((zoneRect.height - height) / 2);
        }

        return { x, y, width, height };
    }

    /**
     * Get zone rectangle for a specific zone
     *
     * @param {number} monitorIndex
     * @param {Object} layout - Layout definition
     * @param {number} zoneIndex
     * @param {Object} options
     * @returns {Object|null} Zone rectangle
     */
    getZoneRect(monitorIndex, layout, zoneIndex, options = {}) {
        const workArea = this._monitorManager.getWorkArea(monitorIndex);
        if (!workArea) {
            return null;
        }

        try {
            const zones = this._layoutResolver.resolve(layout, workArea, options);
            return zones[zoneIndex] || null;
        } catch (error) {
            this._logger.error('Failed to get zone rect', { error, monitorIndex, zoneIndex });
            return null;
        }
    }

    /**
     * Get all zone rectangles for a layout
     *
     * @param {number} monitorIndex
     * @param {Object} layout - Layout definition
     * @param {Object} options
     * @returns {Array|null} Array of zone rectangles
     */
    getZoneRects(monitorIndex, layout, options = {}) {
        const workArea = this._monitorManager.getWorkArea(monitorIndex);
        if (!workArea) {
            return null;
        }

        try {
            return this._layoutResolver.resolve(layout, workArea, options);
        } catch (error) {
            this._logger.error('Failed to get zone rects', { error, monitorIndex });
            return null;
        }
    }

    /**
     * Check if window is snapped to a zone
     *
     * @param {Meta.Window} window
     * @returns {boolean}
     */
    isWindowSnapped(window) {
        return this._windowTracker.isWindowTracked(window);
    }

    /**
     * Unsnap window (remove from tracking)
     *
     * @param {Meta.Window} window
     * @returns {boolean} True if window was snapped
     */
    unsnapWindow(window) {
        return this._windowTracker.untrackWindow(window);
    }

    /**
     * Get zone index for a window
     *
     * @param {Meta.Window} window
     * @returns {number|null} Zone index, or null if not snapped
     */
    getWindowZoneIndex(window) {
        const info = this._windowTracker.getWindowInfo(window);
        return info ? info.zoneIndex : null;
    }

    /**
     * Resnap all windows in a layout
     * Used when layout changes or monitor changes
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @param {Object} layout
     * @param {Object} options
     * @returns {number} Number of windows resnapped
     */
    resnapLayout(monitorIndex, layoutId, layout, options = {}) {
        const windows = this._windowTracker.getWindowsInLayoutOnMonitor(monitorIndex, layoutId);
        let count = 0;

        for (const window of windows) {
            const info = this._windowTracker.getWindowInfo(window);
            if (info && this.snapToZone(window, monitorIndex, layoutId, info.zoneIndex, layout, options)) {
                count++;
            }
        }

        this._logger.debug('Layout resnapped', { monitorIndex, layoutId, count });
        return count;
    }

    /**
     * Get window at zone
     *
     * @param {number} monitorIndex
     * @param {string} layoutId
     * @param {number} zoneIndex
     * @returns {Meta.Window|null}
     */
    getWindowAtZone(monitorIndex, layoutId, zoneIndex) {
        return this._windowTracker.getWindowInZone(monitorIndex, layoutId, zoneIndex);
    }
}
