import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * TileManager - Manages tiled windows with layout-driven resize
 *
 * Architecture:
 * - Layout is the source of truth
 * - Windows are rendered instances of the layout schema
 * - On resize: update layout divider → re-resolve layout → re-snap ALL windows
 *
 * This eliminates complex window-to-window edge calculations.
 */
export class TileManager {
    constructor(settings, layoutManager = null) {
        this._settings = settings;
        this._layoutManager = layoutManager;

        // Map of monitorIndex -> TileGroup
        // TileGroup: { layoutId, windows: Map<zoneId, window>, monitor }
        this._tileGroups = new Map();

        // Map of window -> WindowInfo
        // WindowInfo: { monitorIndex, zoneId, signalIds: [] }
        this._windowInfo = new Map();

        // Track active resize operation
        this._resizingWindow = null;
        this._resizeStartRect = null;
        this._resizeEdges = null;

        // Track move operations (to detect untile)
        this._movingWindow = null;
        this._moveStartRect = null;

        // Connect to grab events
        this._grabBeginId = global.display.connect('grab-op-begin',
            this._onGrabBegin.bind(this));
        this._grabEndId = global.display.connect('grab-op-end',
            this._onGrabEnd.bind(this));
    }

    _debug(message) {
        if (this._settings && this._settings.get_boolean('debug-mode')) {
            log(`SnapKit TileManager: ${message}`);
        }
    }

    /**
     * Set the layout manager reference
     * Called from extension.js after both are created
     */
    setLayoutManager(layoutManager) {
        this._layoutManager = layoutManager;
    }

    /**
     * Register a window as snapped to a zone
     */
    registerSnappedWindow(window, layoutId, zone, monitorIndex, layout) {
        if (!window || !zone) {
            this._debug(`Cannot register: window=${!!window}, zone=${!!zone}`);
            return;
        }

        this._debug(`Registering window "${window.get_title()}" to layout=${layoutId}, zone=${zone.id}, monitor=${monitorIndex}`);
        this._debug(`  Layout provided: ${layout ? 'yes' : 'no'}, has root: ${layout?.root ? 'yes' : 'no'}`);
        this._debug(`  Zone has windowRect: ${zone.windowRect ? 'yes' : 'no'}`);
        this._debug(`  Zone has tileRect: ${zone.tileRect ? 'yes' : 'no'}`);

        // Remove from any existing tile group first
        this.unregisterWindow(window);

        // Get or create tile group for this monitor
        let group = this._tileGroups.get(monitorIndex);
        if (!group || group.layoutId !== layoutId) {
            // New layout on this monitor - clear old group
            if (group) {
                this._clearGroup(monitorIndex);
            }
            group = {
                layoutId: layoutId,
                windows: new Map(),
                layout: layout,
                monitor: Main.layoutManager.monitors[monitorIndex]
            };
            this._tileGroups.set(monitorIndex, group);
        }

        // Add window to group
        group.windows.set(zone.id, window);

        // Track window info and connect signals
        const signalIds = [];

        // Listen for window being closed
        try {
            const unmanagedId = window.connect('unmanaged', () => {
                this.unregisterWindow(window);
            });
            signalIds.push(unmanagedId);
        } catch (e) {
            this._debug(`Failed to connect unmanaged: ${e.message}`);
        }

        this._windowInfo.set(window, {
            monitorIndex,
            zoneId: zone.id,
            zone: zone,
            signalIds
        });

        this._debug(`Tile group on monitor ${monitorIndex} now has ${group.windows.size} windows`);
    }

    /**
     * Unregister a window from tile management
     */
    unregisterWindow(window) {
        const info = this._windowInfo.get(window);
        if (!info) return;

        this._debug(`Unregistering window from zone ${info.zoneId}`);

        // Disconnect signals
        for (const id of info.signalIds) {
            try {
                window.disconnect(id);
            } catch (e) {
                // Window may already be destroyed
            }
        }

        // Remove from tile group
        const group = this._tileGroups.get(info.monitorIndex);
        if (group) {
            group.windows.delete(info.zoneId);
            if (group.windows.size === 0) {
                this._tileGroups.delete(info.monitorIndex);
            }
        }

        this._windowInfo.delete(window);
    }

    /**
     * Handle grab operation begin - detect resize/move start
     */
    _onGrabBegin(display, window, grabOp) {
        const info = this._windowInfo.get(window);
        if (!info) return;

        const isResize = this._isResizeOp(grabOp);
        const isMove = this._isMoveOp(grabOp);

        if (isMove && !isResize) {
            // Pure move - will break tile on end
            this._debug(`Move started on tiled window "${window.get_title()}"`);
            this._movingWindow = window;
            this._moveStartRect = window.get_frame_rect();
            return;
        }

        if (isResize) {
            this._debug(`Resize started on tiled window "${window.get_title()}", grabOp: ${grabOp}`);
            this._resizingWindow = window;
            this._resizeStartRect = window.get_frame_rect();
            this._resizeEdges = this._getResizeEdges(grabOp);
            this._debug(`Resize edges: ${this._resizeEdges ? this._resizeEdges.join(', ') : 'none'}`);
        }
    }

    /**
     * Handle grab operation end
     */
    _onGrabEnd(display, window, grabOp) {
        // Handle move end - break tile if window was moved
        if (this._movingWindow === window) {
            const endRect = window.get_frame_rect();
            const startRect = this._moveStartRect;

            if (startRect) {
                const moved = Math.abs(endRect.x - startRect.x) > 20 ||
                             Math.abs(endRect.y - startRect.y) > 20;
                if (moved) {
                    this._debug(`Window "${window.get_title()}" was moved, removing from tile group`);
                    this.unregisterWindow(window);
                }
            }

            this._movingWindow = null;
            this._moveStartRect = null;
            return;
        }

        // Handle resize end
        if (this._resizingWindow !== window) return;

        const info = this._windowInfo.get(window);
        if (!info) {
            this._clearResizeState();
            return;
        }

        const endRect = window.get_frame_rect();
        const startRect = this._resizeStartRect;
        const edges = this._resizeEdges;

        if (!startRect || !edges || edges.length === 0) {
            this._clearResizeState();
            return;
        }

        // Process each edge that was resized
        for (const edge of edges) {
            let delta = 0;
            switch (edge) {
                case 'left':
                    delta = endRect.x - startRect.x;
                    break;
                case 'right':
                    delta = (endRect.x + endRect.width) - (startRect.x + startRect.width);
                    break;
                case 'top':
                    delta = endRect.y - startRect.y;
                    break;
                case 'bottom':
                    delta = (endRect.y + endRect.height) - (startRect.y + startRect.height);
                    break;
            }

            this._debug(`Resize ended, edge: ${edge}, delta: ${delta}`);

            if (Math.abs(delta) > 5) {
                // Use layout-driven resize
                this._handleLayoutDrivenResize(window, info, edge, delta);
            }
        }

        this._clearResizeState();
    }

    /**
     * Layout-driven resize: update divider → re-resolve → re-snap all
     */
    _handleLayoutDrivenResize(window, info, edge, delta) {
        this._debug(`_handleLayoutDrivenResize: window="${window.get_title()}", zoneId=${info.zoneId}, edge=${edge}, delta=${delta}`);

        if (!this._layoutManager) {
            this._debug('No layout manager, cannot sync resize');
            return;
        }

        const group = this._tileGroups.get(info.monitorIndex);
        if (!group) {
            this._debug(`No tile group found for monitor ${info.monitorIndex}`);
            return;
        }

        this._debug(`Tile group: layoutId=${group.layoutId}, windows=${group.windows.size}`);

        const monitor = group.monitor;
        if (!monitor) {
            this._debug('No monitor in tile group');
            return;
        }

        // Get work area
        const workArea = Main.layoutManager.getWorkAreaForMonitor(info.monitorIndex);
        this._debug(`WorkArea: ${workArea.width}x${workArea.height}`);

        // Step 1: Update the layout divider override
        this._debug(`Calling handleResize for layout ${group.layoutId}`);
        const overrideUpdated = this._layoutManager.handleResize(
            group.layoutId,
            info.zoneId,
            edge,
            delta,
            workArea,
            monitor
        );

        this._debug(`Override updated: ${overrideUpdated}`);

        if (!overrideUpdated) {
            this._debug(`Divider override not updated for ${edge} edge - layout may not be full-spec`);
            // Still re-snap to ensure consistency
        }

        // Step 2: Re-resolve the layout with updated overrides
        const rects = this._layoutManager.resolveLayoutRects(
            group.layoutId,
            workArea,
            monitor
        );

        this._debug(`Resolved ${rects.size} zones after resize`);

        if (rects.size === 0) {
            this._debug('No rects resolved');
            return;
        }

        // Step 3: Re-snap ALL windows to their zones
        this._debug('Re-snapping all windows in tile group');
        this._reapplyAllWindowsInGroup(group, rects);
    }

    /**
     * Re-apply window positions for all windows in a tile group
     */
    _reapplyAllWindowsInGroup(group, rects) {
        this._debug(`Re-applying ${group.windows.size} windows to their zones`);

        for (const [zoneId, window] of group.windows) {
            const zoneRects = rects.get(zoneId);
            if (!zoneRects) {
                this._debug(`No rect found for zone ${zoneId}`);
                continue;
            }

            const rect = zoneRects.windowRect;
            this._debug(`Re-snapping window to zone ${zoneId}: ${rect.x},${rect.y} ${rect.width}x${rect.height}`);

            try {
                // Check window is still valid
                window.get_title();

                window.move_resize_frame(
                    true,
                    Math.round(rect.x),
                    Math.round(rect.y),
                    Math.round(rect.width),
                    Math.round(rect.height)
                );
            } catch (e) {
                this._debug(`Failed to re-snap window: ${e.message}`);
                // Window may have been destroyed
                group.windows.delete(zoneId);
            }
        }
    }

    /**
     * Manually re-snap all windows in a tile group
     * Called when layout changes or after settings update
     */
    reapplyTileGroup(monitorIndex) {
        const group = this._tileGroups.get(monitorIndex);
        if (!group || !this._layoutManager) return;

        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        const rects = this._layoutManager.resolveLayoutRects(
            group.layoutId,
            workArea,
            group.monitor
        );

        if (rects.size > 0) {
            this._reapplyAllWindowsInGroup(group, rects);
        }
    }

    /**
     * Re-snap all tile groups on all monitors
     */
    reapplyAllTileGroups() {
        for (const monitorIndex of this._tileGroups.keys()) {
            this.reapplyTileGroup(monitorIndex);
        }
    }

    _clearResizeState() {
        this._resizingWindow = null;
        this._resizeStartRect = null;
        this._resizeEdges = null;
    }

    /**
     * Check if grab op is a resize operation
     */
    _isResizeOp(grabOp) {
        const resizeOps = [
            Meta.GrabOp.RESIZING_NW,
            Meta.GrabOp.RESIZING_N,
            Meta.GrabOp.RESIZING_NE,
            Meta.GrabOp.RESIZING_W,
            Meta.GrabOp.RESIZING_E,
            Meta.GrabOp.RESIZING_SW,
            Meta.GrabOp.RESIZING_S,
            Meta.GrabOp.RESIZING_SE
        ];

        if (resizeOps.includes(grabOp)) return true;

        // Flag-based check for newer GNOME versions
        return grabOp > 1 && grabOp !== 4097;
    }

    /**
     * Check if grab op is a move operation
     */
    _isMoveOp(grabOp) {
        return grabOp === Meta.GrabOp.MOVING ||
               grabOp === 1 ||
               grabOp === 4097;
    }

    /**
     * Determine which edges are being resized from grab op
     */
    _getResizeEdges(grabOp) {
        const edges = [];

        if (grabOp === Meta.GrabOp.RESIZING_W ||
            grabOp === Meta.GrabOp.RESIZING_NW ||
            grabOp === Meta.GrabOp.RESIZING_SW) {
            edges.push('left');
        }
        if (grabOp === Meta.GrabOp.RESIZING_E ||
            grabOp === Meta.GrabOp.RESIZING_NE ||
            grabOp === Meta.GrabOp.RESIZING_SE) {
            edges.push('right');
        }
        if (grabOp === Meta.GrabOp.RESIZING_N ||
            grabOp === Meta.GrabOp.RESIZING_NW ||
            grabOp === Meta.GrabOp.RESIZING_NE) {
            edges.push('top');
        }
        if (grabOp === Meta.GrabOp.RESIZING_S ||
            grabOp === Meta.GrabOp.RESIZING_SW ||
            grabOp === Meta.GrabOp.RESIZING_SE) {
            edges.push('bottom');
        }

        return edges.length > 0 ? edges : null;
    }

    /**
     * Clear all windows from a tile group
     */
    _clearGroup(monitorIndex) {
        const group = this._tileGroups.get(monitorIndex);
        if (!group) return;

        for (const [zoneId, window] of group.windows) {
            const info = this._windowInfo.get(window);
            if (info) {
                for (const id of info.signalIds) {
                    try {
                        window.disconnect(id);
                    } catch (e) {}
                }
                this._windowInfo.delete(window);
            }
        }

        this._tileGroups.delete(monitorIndex);
    }

    /**
     * Clear all tile groups
     */
    clearAll() {
        for (const monitorIndex of this._tileGroups.keys()) {
            this._clearGroup(monitorIndex);
        }
    }

    /**
     * Get current tile group info for a monitor
     */
    getTileGroup(monitorIndex) {
        return this._tileGroups.get(monitorIndex);
    }

    /**
     * Check if a window is currently tiled
     */
    isWindowTiled(window) {
        return this._windowInfo.has(window);
    }

    /**
     * Get the zone ID for a tiled window
     */
    getWindowZoneId(window) {
        const info = this._windowInfo.get(window);
        return info?.zoneId ?? null;
    }

    destroy() {
        // Disconnect grab signals
        if (this._grabBeginId) {
            global.display.disconnect(this._grabBeginId);
            this._grabBeginId = null;
        }
        if (this._grabEndId) {
            global.display.disconnect(this._grabEndId);
            this._grabEndId = null;
        }

        this.clearAll();
        this._layoutManager = null;
        this._settings = null;
    }
}
