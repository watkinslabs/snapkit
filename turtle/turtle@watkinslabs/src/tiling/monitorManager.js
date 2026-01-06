/**
 * MonitorManager - Monitor detection and management
 *
 * Responsibilities:
 * - Detect connected monitors
 * - Calculate work area (screen minus panels/docks)
 * - Handle monitor changes
 * - Track primary monitor
 *
 * Integrates with: GNOME Shell Main.layoutManager
 */

import { Logger } from '../core/logger.js';

export class MonitorManager {
    constructor() {
        this._logger = new Logger('MonitorManager');
        this._monitors = [];
        this._primaryMonitorIndex = 0;
        this._changeCallbacks = [];
    }

    /**
     * Initialize monitor detection
     * Must be called after GNOME Shell is ready
     *
     * @param {object} layoutManager - GNOME Shell Main.layoutManager
     */
    initialize(layoutManager) {
        if (!layoutManager) {
            throw new Error('layoutManager is required');
        }

        this._layoutManager = layoutManager;
        this._updateMonitors();

        // Listen for monitor changes
        this._monitorsChangedId = global.display.connect('monitors-changed', () => {
            this._onMonitorsChanged();
        });

        this._logger.info('MonitorManager initialized', {
            monitorCount: this._monitors.length,
            primaryIndex: this._primaryMonitorIndex
        });
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this._monitorsChangedId) {
            global.display.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        this._changeCallbacks = [];
        this._monitors = [];
    }

    /**
     * Update monitor information
     * @private
     */
    _updateMonitors() {
        this._monitors = [];

        const monitorCount = global.display.get_n_monitors();
        this._primaryMonitorIndex = global.display.get_primary_monitor();

        for (let i = 0; i < monitorCount; i++) {
            const geometry = global.display.get_monitor_geometry(i);
            const workArea = this._getWorkArea(i);

            this._monitors.push({
                index: i,
                geometry: {
                    x: geometry.x,
                    y: geometry.y,
                    width: geometry.width,
                    height: geometry.height
                },
                workArea: {
                    x: workArea.x,
                    y: workArea.y,
                    width: workArea.width,
                    height: workArea.height
                },
                isPrimary: i === this._primaryMonitorIndex
            });
        }

        this._logger.debug('Monitors updated', {
            count: this._monitors.length,
            primary: this._primaryMonitorIndex
        });
    }

    /**
     * Get work area for a monitor (minus panels/docks)
     * @private
     * @param {number} monitorIndex
     * @returns {Object} {x, y, width, height}
     */
    _getWorkArea(monitorIndex) {
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        return {
            x: workArea.x,
            y: workArea.y,
            width: workArea.width,
            height: workArea.height
        };
    }

    /**
     * Handle monitor changes
     * @private
     */
    _onMonitorsChanged() {
        this._logger.info('Monitors changed');
        const oldMonitors = [...this._monitors];
        this._updateMonitors();

        // Notify listeners
        for (const callback of this._changeCallbacks) {
            try {
                callback(oldMonitors, this._monitors);
            } catch (error) {
                this._logger.error('Error in monitor change callback', { error });
            }
        }
    }

    /**
     * Get all monitors
     * @returns {Array<Object>}
     */
    getMonitors() {
        return [...this._monitors];
    }

    /**
     * Get monitor by index
     * @param {number} monitorIndex
     * @returns {Object|null}
     */
    getMonitor(monitorIndex) {
        return this._monitors[monitorIndex] || null;
    }

    /**
     * Get primary monitor
     * @returns {Object|null}
     */
    getPrimaryMonitor() {
        return this.getMonitor(this._primaryMonitorIndex);
    }

    /**
     * Get primary monitor index
     * @returns {number}
     */
    getPrimaryMonitorIndex() {
        return this._primaryMonitorIndex;
    }

    /**
     * Get monitor count
     * @returns {number}
     */
    getMonitorCount() {
        return this._monitors.length;
    }

    /**
     * Get work area for a monitor
     * @param {number} monitorIndex
     * @returns {Object|null} {x, y, width, height}
     */
    getWorkArea(monitorIndex) {
        const monitor = this.getMonitor(monitorIndex);
        return monitor ? { ...monitor.workArea } : null;
    }

    /**
     * Get monitor geometry (full screen area)
     * @param {number} monitorIndex
     * @returns {Object|null} {x, y, width, height}
     */
    getGeometry(monitorIndex) {
        const monitor = this.getMonitor(monitorIndex);
        return monitor ? { ...monitor.geometry } : null;
    }

    /**
     * Get monitor index at point
     * @param {number} x
     * @param {number} y
     * @returns {number} Monitor index, or -1 if not found
     */
    getMonitorAtPoint(x, y) {
        for (const monitor of this._monitors) {
            const geom = monitor.geometry;
            if (x >= geom.x && x < geom.x + geom.width &&
                y >= geom.y && y < geom.y + geom.height) {
                return monitor.index;
            }
        }
        return -1;
    }

    /**
     * Get monitor for a window
     * @param {Meta.Window} window
     * @returns {number} Monitor index
     */
    getMonitorForWindow(window) {
        if (!window) {
            return this._primaryMonitorIndex;
        }

        const rect = window.get_frame_rect();
        return this.getMonitorAtPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
        );
    }

    /**
     * Subscribe to monitor changes
     * @param {Function} callback - Called with (oldMonitors, newMonitors)
     * @returns {Function} Unsubscribe function
     */
    onMonitorsChanged(callback) {
        this._changeCallbacks.push(callback);

        return () => {
            const index = this._changeCallbacks.indexOf(callback);
            if (index !== -1) {
                this._changeCallbacks.splice(index, 1);
            }
        };
    }

    /**
     * Check if monitor exists
     * @param {number} monitorIndex
     * @returns {boolean}
     */
    hasMonitor(monitorIndex) {
        return monitorIndex >= 0 && monitorIndex < this._monitors.length;
    }
}
