import GLib from 'gi://GLib';
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
        this._resizeStartPositions = null; // Store all window positions at resize start

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

            // Capture all window positions at resize start
            this._resizeStartPositions = this._captureAllWindowPositions(info.monitorIndex, window);
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

        // Log start vs end positions for all windows
        // Defer logging to capture actual final positions after resize settles
        const monitorIdx = info.monitorIndex;
        const resizedWin = window;
        const startPositions = this._resizeStartPositions;

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._logResizeComparisonDeferred(monitorIdx, resizedWin, startPositions);
            return GLib.SOURCE_REMOVE;
        });

        this._clearResizeState();
    }

    /**
     * Pure pixel-based resize: the resized window is source of truth,
     * sibling windows adjust based on pixel math (no fraction conversion)
     */
    _handleLayoutDrivenResize(window, info, edge, delta) {
        this._debug(`_handleLayoutDrivenResize: window="${window.get_title()}", zoneId=${info.zoneId}, edge=${edge}, delta=${delta}`);

        const group = this._tileGroups.get(info.monitorIndex);
        if (!group) {
            this._debug(`No tile group found for monitor ${info.monitorIndex}`);
            return;
        }

        this._debug(`Tile group: layoutId=${group.layoutId}, windows=${group.windows.size}`);

        // Get both start and end rects
        const startRect = this._resizeStartRect;
        const endRect = window.get_frame_rect();
        this._debug(`Resized window START rect: ${startRect.x},${startRect.y} ${startRect.width}x${startRect.height}`);
        this._debug(`Resized window END rect: ${endRect.x},${endRect.y} ${endRect.width}x${endRect.height}`);

        // Update stored zone info for resized window
        if (info.zone) {
            info.zone.windowRect = {
                x: endRect.x,
                y: endRect.y,
                width: endRect.width,
                height: endRect.height
            };
            info.zone.tileRect = { ...info.zone.windowRect };
        }

        // Find and adjust sibling windows that share the resized edge
        // Use START rect for adjacency detection, END rect for new positions
        this._adjustSiblingWindows(group, window, info, edge, startRect, endRect);
    }

    /**
     * Adjust sibling windows based on the resized window's new position
     * Use startRect for adjacency detection, endRect for calculating new positions
     */
    _adjustSiblingWindows(group, resizedWindow, resizedInfo, edge, startRect, endRect) {
        const isHorizontalEdge = edge === 'left' || edge === 'right';

        for (const [zoneId, siblingWindow] of group.windows) {
            if (siblingWindow === resizedWindow) continue;

            const siblingInfo = this._windowInfo.get(siblingWindow);
            if (!siblingInfo || !siblingInfo.zone) continue;

            const siblingRect = siblingWindow.get_frame_rect();
            let newRect = null;

            this._debug(`Checking sibling ${zoneId}: ${siblingRect.x},${siblingRect.y} ${siblingRect.width}x${siblingRect.height}`);

            if (isHorizontalEdge) {
                // Resized left or right edge - check for horizontal adjacency
                if (edge === 'right') {
                    // Resized window's right edge moved
                    // Sibling on the right should adjust its left edge
                    // Check adjacency using START rect (before resize)
                    if (this._isAdjacentRight(startRect, siblingRect)) {
                        // Use END rect for new position
                        const resizedRight = endRect.x + endRect.width;
                        newRect = {
                            x: resizedRight,
                            y: siblingRect.y,
                            width: (siblingRect.x + siblingRect.width) - resizedRight,
                            height: siblingRect.height
                        };
                        this._debug(`Sibling ${zoneId} was adjacent on right (startRect), adjusting: x=${newRect.x}, width=${newRect.width}`);
                    }
                } else if (edge === 'left') {
                    // Resized window's left edge moved
                    // Sibling on the left should adjust its right edge
                    if (this._isAdjacentLeft(startRect, siblingRect)) {
                        newRect = {
                            x: siblingRect.x,
                            y: siblingRect.y,
                            width: endRect.x - siblingRect.x,
                            height: siblingRect.height
                        };
                        this._debug(`Sibling ${zoneId} was adjacent on left (startRect), adjusting: width=${newRect.width}`);
                    }
                }
            } else {
                // Resized top or bottom edge - check for vertical adjacency
                if (edge === 'bottom') {
                    // Resized window's bottom edge moved
                    // Sibling below should adjust its top edge
                    if (this._isAdjacentBelow(startRect, siblingRect)) {
                        const resizedBottom = endRect.y + endRect.height;
                        newRect = {
                            x: siblingRect.x,
                            y: resizedBottom,
                            width: siblingRect.width,
                            height: (siblingRect.y + siblingRect.height) - resizedBottom
                        };
                        this._debug(`Sibling ${zoneId} was adjacent below (startRect), adjusting: y=${newRect.y}, height=${newRect.height}`);
                    }
                } else if (edge === 'top') {
                    // Resized window's top edge moved
                    // Sibling above should adjust its bottom edge
                    if (this._isAdjacentAbove(startRect, siblingRect)) {
                        newRect = {
                            x: siblingRect.x,
                            y: siblingRect.y,
                            width: siblingRect.width,
                            height: endRect.y - siblingRect.y
                        };
                        this._debug(`Sibling ${zoneId} was adjacent above (startRect), adjusting: height=${newRect.height}`);
                    }
                }
            }

            // Apply the new rect if we calculated one
            // Defer to next frame to avoid conflicts with grab operation
            if (newRect && newRect.width > 50 && newRect.height > 50) {
                const targetRect = { ...newRect };
                const targetZoneId = zoneId;
                const targetWindow = siblingWindow;
                const targetZoneInfo = siblingInfo.zone;

                this._debug(`Scheduling sibling ${targetZoneId} adjustment to: ${targetRect.x},${targetRect.y} ${targetRect.width}x${targetRect.height}`);

                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    try {
                        // Verify window still exists
                        targetWindow.get_title();

                        this._debug(`Applying deferred move to sibling ${targetZoneId}`);
                        targetWindow.move_resize_frame(
                            true,
                            Math.round(targetRect.x),
                            Math.round(targetRect.y),
                            Math.round(targetRect.width),
                            Math.round(targetRect.height)
                        );

                        // Update stored zone info AFTER successful move
                        if (targetZoneInfo) {
                            targetZoneInfo.windowRect = { ...targetRect };
                            targetZoneInfo.tileRect = { ...targetRect };
                        }

                        this._debug(`Adjusted sibling ${targetZoneId} to: ${targetRect.x},${targetRect.y} ${targetRect.width}x${targetRect.height}`);
                    } catch (e) {
                        this._debug(`Failed to adjust sibling ${targetZoneId}: ${e.message}`);
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
    }

    /**
     * Check if siblingRect is adjacent to the right of resizedRect
     */
    _isAdjacentRight(resizedRect, siblingRect) {
        const resizedRight = resizedRect.x + resizedRect.width;
        // Sibling's left edge should be near resized's right edge (within tolerance)
        // And they should overlap vertically
        const horizontallyAdjacent = Math.abs(siblingRect.x - resizedRight) < 50;
        const verticalOverlap = !(siblingRect.y >= resizedRect.y + resizedRect.height ||
                                   siblingRect.y + siblingRect.height <= resizedRect.y);
        return horizontallyAdjacent && verticalOverlap;
    }

    /**
     * Check if siblingRect is adjacent to the left of resizedRect
     */
    _isAdjacentLeft(resizedRect, siblingRect) {
        const siblingRight = siblingRect.x + siblingRect.width;
        const horizontallyAdjacent = Math.abs(siblingRight - resizedRect.x) < 50;
        const verticalOverlap = !(siblingRect.y >= resizedRect.y + resizedRect.height ||
                                   siblingRect.y + siblingRect.height <= resizedRect.y);
        return horizontallyAdjacent && verticalOverlap;
    }

    /**
     * Check if siblingRect is adjacent below resizedRect
     */
    _isAdjacentBelow(resizedRect, siblingRect) {
        const resizedBottom = resizedRect.y + resizedRect.height;
        const verticallyAdjacent = Math.abs(siblingRect.y - resizedBottom) < 50;
        const horizontalOverlap = !(siblingRect.x >= resizedRect.x + resizedRect.width ||
                                     siblingRect.x + siblingRect.width <= resizedRect.x);
        return verticallyAdjacent && horizontalOverlap;
    }

    /**
     * Check if siblingRect is adjacent above resizedRect
     */
    _isAdjacentAbove(resizedRect, siblingRect) {
        const siblingBottom = siblingRect.y + siblingRect.height;
        const verticallyAdjacent = Math.abs(siblingBottom - resizedRect.y) < 50;
        const horizontalOverlap = !(siblingRect.x >= resizedRect.x + resizedRect.width ||
                                     siblingRect.x + siblingRect.width <= resizedRect.x);
        return verticallyAdjacent && horizontalOverlap;
    }

    /**
     * Re-apply window positions for all windows in a tile group
     * @param {object} group - The tile group
     * @param {Map} rects - Zone rectangles from layout resolution
     * @param {Meta.Window} excludeWindow - Optional window to skip (the one being resized)
     */
    _reapplyAllWindowsInGroup(group, rects, excludeWindow = null) {
        this._debug(`Re-applying ${group.windows.size} windows to their zones${excludeWindow ? ' (excluding resized window)' : ''}`);

        for (const [zoneId, window] of group.windows) {
            // Skip the window that was just resized - it's already in the right place
            if (excludeWindow && window === excludeWindow) {
                this._debug(`Skipping resized window in zone ${zoneId} - keeping user's position`);
                continue;
            }

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
        this._resizeStartPositions = null;
    }

    /**
     * Capture positions of all windows AND their zone info in a tile group
     */
    _captureAllWindowPositions(monitorIndex, resizedWindow) {
        const group = this._tileGroups.get(monitorIndex);
        if (!group) return null;

        const positions = new Map();
        for (const [zoneId, window] of group.windows) {
            try {
                const rect = window.get_frame_rect();
                const isResized = window === resizedWindow;
                const info = this._windowInfo.get(window);
                const zone = info?.zone;

                positions.set(zoneId, {
                    title: window.get_title(),
                    isResized,
                    // Window position
                    window: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    },
                    // Stored zone/grid info
                    zone: zone ? {
                        windowRect: zone.windowRect ? { ...zone.windowRect } : null,
                        tileRect: zone.tileRect ? { ...zone.tileRect } : null
                    } : null
                });
            } catch (e) {
                // Window may be destroyed
            }
        }
        return positions;
    }

    /**
     * Log start and end positions of all windows AND grids for debugging
     * Deferred version that takes startPositions as parameter
     */
    _logResizeComparisonDeferred(monitorIndex, resizedWindow, startPositions) {
        if (!startPositions) {
            this._debug('No start positions captured');
            return;
        }

        const group = this._tileGroups.get(monitorIndex);
        if (!group) {
            this._debug('No tile group found');
            return;
        }

        this._debug('');
        this._debug('╔══════════════════════════════════════════════════════════════╗');
        this._debug('║          RESIZE COMPARISON: START vs END                     ║');
        this._debug('╚══════════════════════════════════════════════════════════════╝');
        this._debug(`Layout: ${group.layoutId}, Windows: ${group.windows.size}`);
        this._debug('');

        for (const [zoneId, window] of group.windows) {
            const startData = startPositions.get(zoneId);
            const info = this._windowInfo.get(window);
            const endZone = info?.zone;

            try {
                const endRect = window.get_frame_rect();
                const isResized = window === resizedWindow;
                const marker = isResized ? ' [RESIZED]' : '';

                this._debug(`┌─── Zone: ${zoneId}${marker} ───`);

                // WINDOW positions
                this._debug('│ WINDOW:');
                if (startData?.window) {
                    const sw = startData.window;
                    this._debug(`│   START: x=${sw.x}, y=${sw.y}, w=${sw.width}, h=${sw.height}`);
                } else {
                    this._debug(`│   START: (not captured)`);
                }
                this._debug(`│   END:   x=${endRect.x}, y=${endRect.y}, w=${endRect.width}, h=${endRect.height}`);

                if (startData?.window) {
                    const sw = startData.window;
                    const dx = endRect.x - sw.x;
                    const dy = endRect.y - sw.y;
                    const dw = endRect.width - sw.width;
                    const dh = endRect.height - sw.height;
                    if (dx !== 0 || dy !== 0 || dw !== 0 || dh !== 0) {
                        this._debug(`│   DELTA: dx=${dx}, dy=${dy}, dw=${dw}, dh=${dh}`);
                    }
                }

                // GRID/ZONE stored info
                this._debug('│ GRID (stored zone.windowRect):');
                if (startData?.zone?.windowRect) {
                    const sz = startData.zone.windowRect;
                    this._debug(`│   START: x=${sz.x}, y=${sz.y}, w=${sz.width}, h=${sz.height}`);
                } else {
                    this._debug(`│   START: (no zone.windowRect)`);
                }
                if (endZone?.windowRect) {
                    const ez = endZone.windowRect;
                    this._debug(`│   END:   x=${ez.x}, y=${ez.y}, w=${ez.width}, h=${ez.height}`);
                } else {
                    this._debug(`│   END:   (no zone.windowRect)`);
                }

                // Calculate grid delta if both exist
                if (startData?.zone?.windowRect && endZone?.windowRect) {
                    const sz = startData.zone.windowRect;
                    const ez = endZone.windowRect;
                    const dx = ez.x - sz.x;
                    const dy = ez.y - sz.y;
                    const dw = ez.width - sz.width;
                    const dh = ez.height - sz.height;
                    if (dx !== 0 || dy !== 0 || dw !== 0 || dh !== 0) {
                        this._debug(`│   DELTA: dx=${dx}, dy=${dy}, dw=${dw}, dh=${dh}`);
                    }
                }

                this._debug('└───────────────────────────────');
                this._debug('');
            } catch (e) {
                this._debug(`Zone ${zoneId}: (window destroyed)`);
            }
        }
        this._debug('═══════════════════════════════════════════════════════════════');
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
