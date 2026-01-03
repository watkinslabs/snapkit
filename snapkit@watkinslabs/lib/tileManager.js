import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * TileManager - Manages tiled windows and handles resize synchronization
 * When windows are snapped to a layout, resizing one window adjusts adjacent windows
 */
export class TileManager {
    constructor(settings) {
        this._settings = settings;
        // Map of monitorIndex -> { layoutId, windows: Map<zoneId, window>, zones: [] }
        this._tileGroups = new Map();
        // Map of window -> { monitorIndex, zoneId, signalIds: [] }
        this._windowInfo = new Map();
        // Track active resize/move operation
        this._resizingWindow = null;
        this._resizeStartRect = null;
        this._resizeEdges = null;
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
     * Register a window as snapped to a zone
     */
    registerSnappedWindow(window, layoutId, zone, monitorIndex, layout) {
        if (!window || !zone) return;

        this._debug(`Registering window "${window.get_title()}" to zone ${zone.id} on monitor ${monitorIndex}`);

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
                zones: layout.zones,
                layout: layout
            };
            this._tileGroups.set(monitorIndex, group);
        }

        // Add window to group
        group.windows.set(zone.id, window);

        // Track window info and connect signals
        const signalIds = [];

        // Listen for size changes (just to track lastRect)
        try {
            const sizeId = window.connect('size-changed', () => {
                this._onWindowSizeChanged(window);
            });
            signalIds.push(sizeId);
        } catch (e) {
            this._debug(`Failed to connect size-changed: ${e.message}`);
        }

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
            signalIds,
            lastRect: window.get_frame_rect(),
            expectedRect: null  // Set when we're adjusting this window
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
     * Handle grab operation begin - detect resize start
     */
    _onGrabBegin(display, window, grabOp) {
        // Check if this is a resize operation on a tiled window
        const info = this._windowInfo.get(window);
        if (!info) return;

        // Detect resize operations (grabOp is a flags-based enum in GNOME 48+)
        // Check for any resize-related bits
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
     * Handle grab operation end - apply resize to adjacent windows
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
            this._resizingWindow = null;
            this._resizeStartRect = null;
            this._resizeEdges = null;
            return;
        }

        const endRect = window.get_frame_rect();
        const startRect = this._resizeStartRect;
        const edges = this._resizeEdges;

        if (!startRect || !edges || edges.length === 0) {
            this._resizingWindow = null;
            this._resizeStartRect = null;
            this._resizeEdges = null;
            return;
        }

        // Process each edge that was resized
        for (const edge of edges) {
            // Calculate how much this edge moved
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
                this._adjustAdjacentWindows(window, info, edge, delta);
            }
        }

        // Update stored rect
        info.lastRect = endRect;

        this._resizingWindow = null;
        this._resizeStartRect = null;
        this._resizeEdges = null;
    }

    /**
     * Check if grab op is a resize operation
     */
    _isResizeOp(grabOp) {
        // In GNOME 48, grabOp values changed. Check for resize patterns.
        // Traditional values: RESIZING_* are 1-8 or so
        // New values might be flag-based
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

        // Direct match
        if (resizeOps.includes(grabOp)) return true;

        // Flag-based check (grabOp might have resize bit set)
        // Resize ops in newer Mutter are typically > 1 and have specific bits
        return grabOp > 1 && grabOp !== 4097; // 4097 seems to be keyboard-related
    }

    /**
     * Check if grab op is a move operation
     */
    _isMoveOp(grabOp) {
        return grabOp === Meta.GrabOp.MOVING ||
               grabOp === 1 ||
               grabOp === 4097; // Keyboard move in GNOME 48
    }

    /**
     * Determine which edges are being resized from grab op
     * Returns array of edges for corner drags
     */
    _getResizeEdges(grabOp) {
        const edges = [];

        // Check horizontal edges
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

        // Check vertical edges
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
     * Handle window size change - just update lastRect
     */
    _onWindowSizeChanged(window) {
        const info = this._windowInfo.get(window);
        if (!info) return;
        info.lastRect = window.get_frame_rect();
    }

    /**
     * Check if two ranges overlap
     */
    _rangesOverlap(start1, end1, start2, end2) {
        return start1 < end2 && start2 < end1;
    }

    /**
     * Adjust windows that share the resized edge (with cascading)
     */
    _adjustAdjacentWindows(window, info, edge, delta) {
        const group = this._tileGroups.get(info.monitorIndex);
        if (!group) return;

        // Track which windows we've already adjusted to prevent cycles
        const adjusted = new Set();
        adjusted.add(window);

        // Queue of adjustments to make: {window, edge, delta}
        const queue = [{window, edge, delta}];

        while (queue.length > 0) {
            const current = queue.shift();
            const currentInfo = this._windowInfo.get(current.window);
            if (!currentInfo) continue;

            const zone = currentInfo.zone;

            this._debug(`Processing ${current.edge} edge of zone ${zone.id}, delta: ${current.delta}`);

            // Find adjacent zones and their windows
            for (const [zoneId, adjWindow] of group.windows) {
                if (adjusted.has(adjWindow)) continue;

                const adjInfo = this._windowInfo.get(adjWindow);
                if (!adjInfo) continue;

                const adjZone = adjInfo.zone;
                const adjRect = adjWindow.get_frame_rect();

                let newX = adjRect.x;
                let newY = adjRect.y;
                let newWidth = adjRect.width;
                let newHeight = adjRect.height;
                let needsAdjust = false;
                let cascadeEdge = null;

                // Check if zones share the edge that was resized AND edges actually overlap
                switch (current.edge) {
                    case 'right':
                        // Our right edge moved - find windows whose left edge touches it
                        if (Math.abs((zone.x + zone.width) - adjZone.x) < 0.02 &&
                            this._rangesOverlap(zone.y, zone.y + zone.height, adjZone.y, adjZone.y + adjZone.height)) {
                            newX = adjRect.x + current.delta;
                            newWidth = adjRect.width - current.delta;
                            needsAdjust = true;
                            cascadeEdge = 'left'; // Their left edge moved
                            this._debug(`Zone ${zoneId} shares right edge, adjusting left`);
                        }
                        break;

                    case 'left':
                        // Our left edge moved - find windows whose right edge touches it
                        if (Math.abs(zone.x - (adjZone.x + adjZone.width)) < 0.02 &&
                            this._rangesOverlap(zone.y, zone.y + zone.height, adjZone.y, adjZone.y + adjZone.height)) {
                            newWidth = adjRect.width + current.delta;
                            needsAdjust = true;
                            cascadeEdge = 'right'; // Their right edge moved
                            this._debug(`Zone ${zoneId} shares left edge, adjusting right`);
                        }
                        break;

                    case 'bottom':
                        // Our bottom edge moved - find windows whose top edge touches it
                        if (Math.abs((zone.y + zone.height) - adjZone.y) < 0.02 &&
                            this._rangesOverlap(zone.x, zone.x + zone.width, adjZone.x, adjZone.x + adjZone.width)) {
                            newY = adjRect.y + current.delta;
                            newHeight = adjRect.height - current.delta;
                            needsAdjust = true;
                            cascadeEdge = 'top'; // Their top edge moved
                            this._debug(`Zone ${zoneId} shares bottom edge, adjusting top`);
                        }
                        break;

                    case 'top':
                        // Our top edge moved - find windows whose bottom edge touches it
                        if (Math.abs(zone.y - (adjZone.y + adjZone.height)) < 0.02 &&
                            this._rangesOverlap(zone.x, zone.x + zone.width, adjZone.x, adjZone.x + adjZone.width)) {
                            newHeight = adjRect.height + current.delta;
                            needsAdjust = true;
                            cascadeEdge = 'bottom'; // Their bottom edge moved
                            this._debug(`Zone ${zoneId} shares top edge, adjusting bottom`);
                        }
                        break;
                }

                if (needsAdjust && newWidth > 50 && newHeight > 50) {
                    this._debug(`Adjusting "${adjWindow.get_title()}" to ${newX},${newY} ${newWidth}x${newHeight}`);

                    adjWindow.move_resize_frame(
                        true,
                        Math.round(newX),
                        Math.round(newY),
                        Math.round(newWidth),
                        Math.round(newHeight)
                    );

                    // Update the adjacent window's last rect
                    adjInfo.lastRect = adjWindow.get_frame_rect();

                    // Mark as adjusted
                    adjusted.add(adjWindow);

                    // Queue cascade: the edge that moved on this window might affect others
                    // For left/right: if their left moved, check their left edge for more cascades
                    // For top/bottom: if their top moved, check their top edge for more cascades
                    if (cascadeEdge) {
                        queue.push({window: adjWindow, edge: cascadeEdge, delta: current.delta});
                        this._debug(`Queued cascade: ${cascadeEdge} edge of ${zoneId}`);
                    }
                }
            }
        }
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
        this._settings = null;
    }
}
