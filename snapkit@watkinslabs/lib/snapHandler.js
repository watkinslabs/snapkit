import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * SnapHandler - Handles window snapping to zones
 */
export class SnapHandler {
    constructor(layoutManager, settings) {
        this._layoutManager = layoutManager;
        this._settings = settings;
    }

    /**
     * Snap a window to a specific zone in a layout
     * @param {Meta.Window} window - The window to snap
     * @param {string} layoutId - The layout ID
     * @param {object} zone - The zone to snap to
     * @param {number} monitorIndex - Optional monitor index (defaults to window's current monitor)
     */
    snapWindow(window, layoutId, zone, monitorIndex = null) {
        this._debug(`=== SNAP WINDOW START ===`);
        this._debug(`Window: ${window ? window.get_title() : 'null'}`);
        this._debug(`Layout: ${layoutId}`);
        this._debug(`Zone: ${zone ? JSON.stringify({id: zone.id, x: zone.x, y: zone.y, width: zone.width, height: zone.height}) : 'null'}`);
        this._debug(`Monitor index: ${monitorIndex}`);

        if (!window || !zone) {
            log('SnapKit: Invalid window or zone');
            this._debug('=== SNAP WINDOW FAILED - Invalid window or zone ===');
            Main.notify('SnapKit', 'Error: Invalid window or zone');
            return false;
        }

        try {
            // Use provided monitor index, or get the monitor the window is on
            if (monitorIndex === null) {
                monitorIndex = window.get_monitor();
                this._debug(`Using window's current monitor: ${monitorIndex}`);
            }
            const monitor = Main.layoutManager.monitors[monitorIndex];

            if (!monitor) {
                log('SnapKit: Could not find monitor');
                this._debug('=== SNAP WINDOW FAILED - Monitor not found ===');
                return false;
            }

            this._debug(`Monitor: ${monitorIndex} - x:${monitor.x} y:${monitor.y} w:${monitor.width} h:${monitor.height}`);

            // Get work area (screen area minus panels/docks)
            const workArea = this._getWorkArea(monitorIndex);

            if (!workArea) {
                log('SnapKit: Could not get work area');
                this._debug('=== SNAP WINDOW FAILED - Work area not found ===');
                return false;
            }

            this._debug(`Work area: x:${workArea.x} y:${workArea.y} w:${workArea.width} h:${workArea.height}`);

            // Calculate target geometry for the zone
            const targetGeometry = this._layoutManager.calculateZoneGeometry(zone, workArea);

            this._debug(`Target geometry: x:${targetGeometry.x} y:${targetGeometry.y} w:${targetGeometry.width} h:${targetGeometry.height}`);

            if (!this._validateGeometry(targetGeometry, monitor)) {
                log(`SnapKit: Invalid target geometry - x:${targetGeometry.x} y:${targetGeometry.y} w:${targetGeometry.width} h:${targetGeometry.height}`);
                this._debug('=== SNAP WINDOW FAILED - Invalid geometry ===');
                Main.notify('SnapKit', 'Error: Invalid window geometry calculated');
                return false;
            }

            // Unmaximize window if it's maximized
            if (window.get_maximized()) {
                this._debug('Window is maximized, unmaximizing first');
                window.unmaximize(Meta.MaximizeFlags.BOTH);
            }

            // Apply the new geometry
            this._debug('Applying window geometry...');
            this._applyWindowGeometry(window, targetGeometry);

            this._debug(`Snapped window to zone ${zone.id} in layout ${layoutId}`);
            this._debug('=== SNAP WINDOW SUCCESS ===');

            // Notify user of successful snap (only when debug mode is off)
            if (!this._settings.get_boolean('debug-mode')) {
                Main.notify('SnapKit', `Snapped "${window.get_title()}" to ${zone.id || 'zone'}`);
            }

            return true;
        } catch (e) {
            log(`SnapKit: Error snapping window: ${e.message}`);
            log(`SnapKit: Stack trace: ${e.stack}`);
            this._debug(`=== SNAP WINDOW ERROR: ${e.message} ===`);
            return false;
        }
    }

    _debug(message) {
        if (this._settings && this._settings.get_boolean('debug-mode')) {
            log(`SnapKit SnapHandler: ${message}`);
        }
    }

    _validateGeometry(geometry, monitor) {
        if (!geometry || !monitor) {
            return false;
        }

        // Check if geometry is within monitor bounds
        if (geometry.x < monitor.x || geometry.y < monitor.y) {
            return false;
        }

        if (geometry.x + geometry.width > monitor.x + monitor.width ||
            geometry.y + geometry.height > monitor.y + monitor.height) {
            return false;
        }

        // Check minimum size
        if (geometry.width < 100 || geometry.height < 100) {
            return false;
        }

        return true;
    }

    /**
     * Get the work area for a monitor (excludes panels, docks, etc.)
     */
    _getWorkArea(monitorIndex) {
        try {
            if (monitorIndex < 0 || monitorIndex >= Main.layoutManager.monitors.length) {
                log(`SnapKit: Invalid monitor index: ${monitorIndex}`);
                return null;
            }

            const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);

            if (!workArea) {
                return null;
            }

            return {
                x: workArea.x,
                y: workArea.y,
                width: workArea.width,
                height: workArea.height
            };
        } catch (e) {
            log(`SnapKit: Error getting work area: ${e.message}`);
            return null;
        }
    }

    /**
     * Apply geometry to a window
     */
    _applyWindowGeometry(window, geometry) {
        try {
            this._debug(`Original geometry: x:${geometry.x} y:${geometry.y} w:${geometry.width} h:${geometry.height}`);

            // Respect window constraints
            const constrainedGeometry = this._constrainGeometry(window, geometry);

            this._debug(`Constrained geometry: x:${constrainedGeometry.x} y:${constrainedGeometry.y} w:${constrainedGeometry.width} h:${constrainedGeometry.height}`);

            // Move and resize the window
            // Note: GNOME Shell handles animation automatically for window operations
            this._debug(`Calling move_resize_frame with: x:${constrainedGeometry.x} y:${constrainedGeometry.y} w:${constrainedGeometry.width} h:${constrainedGeometry.height}`);
            window.move_resize_frame(
                true, // user_op - this is a user operation
                constrainedGeometry.x,
                constrainedGeometry.y,
                constrainedGeometry.width,
                constrainedGeometry.height
            );

            this._debug('move_resize_frame completed');

            // Raise the window
            window.raise();
            window.activate(global.get_current_time());

            this._debug('Window raised and activated');
        } catch (e) {
            log(`SnapKit: Error applying window geometry: ${e.message}`);
            log(`SnapKit: Stack trace: ${e.stack}`);
            this._debug(`ERROR in _applyWindowGeometry: ${e.message}`);
        }
    }

    /**
     * Constrain geometry to window's min/max size constraints
     */
    _constrainGeometry(window, geometry) {
        let {x, y, width, height} = geometry;

        // GNOME Shell's Meta.Window doesn't have get_size_hints()
        // Instead, we'll just ensure reasonable minimum sizes
        const MIN_WIDTH = 100;
        const MIN_HEIGHT = 100;

        if (width < MIN_WIDTH) {
            this._debug(`Width ${width} below minimum, setting to ${MIN_WIDTH}`);
            width = MIN_WIDTH;
        }
        if (height < MIN_HEIGHT) {
            this._debug(`Height ${height} below minimum, setting to ${MIN_HEIGHT}`);
            height = MIN_HEIGHT;
        }

        return {x, y, width, height};
    }

    /**
     * Get the currently focused window
     */
    getCurrentWindow() {
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = workspace.list_windows();

        // Get the most recently focused window
        windows.sort((a, b) => {
            return b.get_user_time() - a.get_user_time();
        });

        // Return first normal window (skip modals, etc.)
        for (let window of windows) {
            if (window.window_type === Meta.WindowType.NORMAL) {
                return window;
            }
        }

        return null;
    }

    /**
     * Check if a window can be snapped (is it a normal, moveable window?)
     */
    canSnapWindow(window) {
        if (!window) {
            this._debug('canSnapWindow: No window provided');
            return false;
        }

        // Check if window is a normal window
        if (window.window_type !== Meta.WindowType.NORMAL) {
            this._debug(`canSnapWindow: Window "${window.get_title()}" is not NORMAL type (type: ${window.window_type})`);
            return false;
        }

        // Check if window can be moved/resized
        if (!window.allows_move() || !window.allows_resize()) {
            this._debug(`canSnapWindow: Window "${window.get_title()}" cannot be moved/resized (allows_move: ${window.allows_move()}, allows_resize: ${window.allows_resize()})`);
            return false;
        }

        // Check if window is not fullscreen
        if (window.is_fullscreen()) {
            this._debug(`canSnapWindow: Window "${window.get_title()}" is fullscreen`);
            return false;
        }

        this._debug(`canSnapWindow: Window "${window.get_title()}" can be snapped`);
        return true;
    }

    destroy() {
        this._layoutManager = null;
        this._settings = null;
    }
}
