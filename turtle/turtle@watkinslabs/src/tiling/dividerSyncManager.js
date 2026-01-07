/**
 * DividerSyncManager - Synchronizes zone dividers when windows are resized
 *
 * When a snapped window is resized by dragging its edge, this manager:
 * 1. Detects which divider (shared edge) was moved
 * 2. Calculates the new divider ratio
 * 3. Updates the OverrideStore with the new ratio
 * 4. Re-snaps all windows in the layout to match the new divider positions
 *
 * This ensures that all windows sharing a divider resize together.
 */

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';

import { Logger } from '../core/logger.js';

export class DividerSyncManager {
    /**
     * @param {WindowTracker} windowTracker
     * @param {OverrideStore} overrideStore
     * @param {LayoutResolver} layoutResolver
     * @param {LayoutManager} layoutManager
     * @param {MonitorManager} monitorManager
     * @param {SnapHandler} snapHandler
     * @param {EventBus} eventBus
     */
    constructor(windowTracker, overrideStore, layoutResolver, layoutManager, monitorManager, snapHandler, eventBus) {
        this._windowTracker = windowTracker;
        this._overrideStore = overrideStore;
        this._layoutResolver = layoutResolver;
        this._layoutManager = layoutManager;
        this._monitorManager = monitorManager;
        this._snapHandler = snapHandler;
        this._eventBus = eventBus;
        this._logger = new Logger('DividerSyncManager');

        this._signalIds = [];
        this._enabled = false;

        // Resize tracking state
        this._resizingWindow = null;
        this._resizeOp = null;
        this._originalRect = null;
        this._resizeInfo = null; // {monitorIndex, layoutId, zoneIndex}
    }

    /**
     * Initialize the divider sync manager
     */
    initialize() {
        if (this._enabled) {
            this._logger.warn('Already initialized');
            return;
        }

        // Connect to grab-op signals to detect resize operations
        const grabBeginId = global.display.connect('grab-op-begin', (display, window, op) => {
            this._onGrabOpBegin(display, window, op);
        });
        this._signalIds.push({ object: global.display, id: grabBeginId });

        const grabEndId = global.display.connect('grab-op-end', (display, window, op) => {
            this._onGrabOpEnd(display, window, op);
        });
        this._signalIds.push({ object: global.display, id: grabEndId });

        this._enabled = true;
        this._logger.info('DividerSyncManager initialized');
    }

    /**
     * Handle grab operation begin
     * @private
     */
    _onGrabOpBegin(display, window, op) {
        if (!this._enabled || !window) {
            return;
        }

        // Check if this is a resize operation
        if (!this._isResizeOp(op)) {
            return;
        }

        // Check if window is tracked (snapped)
        const windowInfo = this._windowTracker.getWindowInfo(window);
        if (!windowInfo) {
            console.log(`SnapKit DEBUG: DividerSyncManager - resize on UNTRACKED window, ignoring`);
            return; // Not a snapped window
        }

        // Store resize state
        this._resizingWindow = window;
        this._resizeOp = op;
        this._originalRect = window.get_frame_rect();
        this._resizeInfo = {
            monitorIndex: windowInfo.monitorIndex,
            layoutId: windowInfo.layoutId,
            zoneIndex: windowInfo.zoneIndex
        };

        console.log(`SnapKit DEBUG: DividerSyncManager - resize STARTED on tracked window`);
        console.log(`SnapKit DEBUG: - windowTitle: ${window.get_title()}`);
        console.log(`SnapKit DEBUG: - layoutId from WindowTracker: ${windowInfo.layoutId}`);
        console.log(`SnapKit DEBUG: - zoneIndex: ${windowInfo.zoneIndex}`);
        console.log(`SnapKit DEBUG: - monitorIndex: ${windowInfo.monitorIndex}`);

        this._logger.debug('Resize started on snapped window', {
            windowTitle: window.get_title(),
            op: this._getOpName(op),
            zoneIndex: windowInfo.zoneIndex
        });
    }

    /**
     * Handle grab operation end
     * @private
     */
    _onGrabOpEnd(display, window, op) {
        if (!this._enabled || !this._resizingWindow || window !== this._resizingWindow) {
            return;
        }

        // Check if this was a resize operation
        if (!this._isResizeOp(op)) {
            this._clearResizeState();
            return;
        }

        console.log(`SnapKit DEBUG: DividerSyncManager - resize ENDED`);

        try {
            const newRect = window.get_frame_rect();
            const { monitorIndex, layoutId, zoneIndex } = this._resizeInfo;

            console.log(`SnapKit DEBUG: - Using layoutId: ${layoutId}, zoneIndex: ${zoneIndex}`);
            console.log(`SnapKit DEBUG: - Original rect: x=${this._originalRect.x}, y=${this._originalRect.y}, w=${this._originalRect.width}, h=${this._originalRect.height}`);
            console.log(`SnapKit DEBUG: - New rect: x=${newRect.x}, y=${newRect.y}, w=${newRect.width}, h=${newRect.height}`);

            // Get work area
            const workArea = this._monitorManager.getWorkArea(monitorIndex);
            if (!workArea) {
                console.log(`SnapKit DEBUG: - No work area found, aborting`);
                this._clearResizeState();
                return;
            }

            // Get current layout
            const layoutDef = this._layoutManager.getLayout(layoutId);
            if (!layoutDef) {
                console.log(`SnapKit DEBUG: - Layout ${layoutId} not found, aborting`);
                this._clearResizeState();
                return;
            }

            console.log(`SnapKit DEBUG: - Layout found: ${layoutDef.name}`);

            // Get current overrides
            const overrides = this._overrideStore.getOverrides(layoutId, monitorIndex);
            console.log(`SnapKit DEBUG: - Current overrides: ${JSON.stringify(overrides)}`);

            // Resolve current zones to find the zone this window was in
            const zones = this._layoutResolver.resolve(layoutDef.layout, workArea, {
                overrides
            });

            console.log(`SnapKit DEBUG: - Resolved ${zones.length} zones`);

            const originalZone = zones.find(z => z.zoneIndex === zoneIndex);
            if (!originalZone) {
                console.log(`SnapKit DEBUG: - Zone ${zoneIndex} not found in resolved zones, aborting`);
                this._clearResizeState();
                return;
            }

            // Calculate which dividers were moved and their new ratios (handles corners)
            const dividerUpdates = this._calculateDividerUpdates(
                this._originalRect,
                newRect,
                originalZone,
                workArea,
                op,
                layoutDef.layout,
                overrides
            );

            console.log(`SnapKit DEBUG: - Divider updates: ${JSON.stringify(dividerUpdates)}`);

            if (dividerUpdates.length > 0) {
                // Apply ALL divider updates
                for (const update of dividerUpdates) {
                    this._logger.debug('Divider update calculated', update);

                    console.log(`SnapKit DEBUG: - Setting override path="${update.path}", ratio=${update.ratio}`);

                    // Update override store
                    this._overrideStore.setOverride(
                        layoutId,
                        monitorIndex,
                        update.path,
                        update.ratio
                    );

                    // Emit event for each divider
                    this._eventBus.emit('divider-moved', {
                        layoutId,
                        monitorIndex,
                        path: update.path,
                        ratio: update.ratio
                    });
                }

                console.log(`SnapKit DEBUG: - Calling _resnapAllWindows for layout ${layoutId}`);

                // Re-snap all windows in this layout on this monitor (once, after all updates)
                this._resnapAllWindows(monitorIndex, layoutId, layoutDef.layout);
            } else {
                console.log(`SnapKit DEBUG: - No divider updates calculated (edges at screen boundary or resize too small)`);
            }
        } catch (error) {
            console.log(`SnapKit DEBUG: - ERROR: ${error.message}`);
            this._logger.error('Error handling resize end', { error });
        }

        this._clearResizeState();
    }

    /**
     * Calculate divider updates from window resize (handles corners with multiple edges)
     * @private
     * @param {Meta.Rectangle} oldRect - Original window rect
     * @param {Meta.Rectangle} newRect - New window rect
     * @param {Object} zone - Zone the window was in
     * @param {Object} workArea - Monitor work area
     * @param {Meta.GrabOp} op - The resize operation
     * @param {Object} layout - Layout definition
     * @param {Array} overrides - Current overrides for this layout
     * @returns {Array} Array of {path, ratio} updates (can be empty, 1, or 2 items for corners)
     */
    _calculateDividerUpdates(oldRect, newRect, zone, workArea, op, layout, overrides = []) {
        const updates = [];

        // Calculate which edges moved and where they moved TO (in absolute pixels)
        const oldLeft = oldRect.x;
        const newLeft = newRect.x;
        const oldRight = oldRect.x + oldRect.width;
        const newRight = newRect.x + newRect.width;
        const oldTop = oldRect.y;
        const newTop = newRect.y;
        const oldBottom = oldRect.y + oldRect.height;
        const newBottom = newRect.y + newRect.height;

        const deltaLeft = newLeft - oldLeft;
        const deltaRight = newRight - oldRight;
        const deltaTop = newTop - oldTop;
        const deltaBottom = newBottom - oldBottom;

        console.log(`SnapKit DEBUG: _calculateDividerUpdates - deltas: left=${deltaLeft}, right=${deltaRight}, top=${deltaTop}, bottom=${deltaBottom}`);

        // Check ALL edges that could have moved based on resize op
        const edgesToCheck = [];

        if (this._isLeftResize(op) && Math.abs(deltaLeft) > 5) {
            edgesToCheck.push({ edge: 'left', newPos: newLeft });
        }
        if (this._isRightResize(op) && Math.abs(deltaRight) > 5) {
            edgesToCheck.push({ edge: 'right', newPos: newRight });
        }
        if (this._isTopResize(op) && Math.abs(deltaTop) > 5) {
            edgesToCheck.push({ edge: 'top', newPos: newTop });
        }
        if (this._isBottomResize(op) && Math.abs(deltaBottom) > 5) {
            edgesToCheck.push({ edge: 'bottom', newPos: newBottom });
        }

        console.log(`SnapKit DEBUG: _calculateDividerUpdates - edges moved: ${edgesToCheck.map(e => e.edge).join(', ')}`);

        // Process each moved edge
        for (const { edge, newPos } of edgesToCheck) {
            const dividerInfo = this._findDividerForEdgeWithArea(edge, zone, workArea, layout, overrides);
            if (!dividerInfo) {
                console.log(`SnapKit DEBUG: _calculateDividerUpdates - no divider found for edge=${edge}`);
                continue;
            }

            // Calculate new ratio based on the new edge position relative to the divider's area
            let newRatio;
            if (dividerInfo.direction === 'vertical') {
                newRatio = (newPos - dividerInfo.area.x) / dividerInfo.area.width;
            } else {
                newRatio = (newPos - dividerInfo.area.y) / dividerInfo.area.height;
            }

            console.log(`SnapKit DEBUG: _calculateDividerUpdates - edge=${edge}, path="${dividerInfo.path}", newRatio=${newRatio.toFixed(3)}`);

            // Clamp ratio
            newRatio = Math.max(0.1, Math.min(0.9, newRatio));

            updates.push({
                path: dividerInfo.path,
                ratio: newRatio
            });
        }

        return updates;
    }

    /**
     * Legacy single-update method (for compatibility)
     * @private
     */
    _calculateDividerUpdate(oldRect, newRect, zone, workArea, op, layout, overrides = []) {
        const updates = this._calculateDividerUpdates(oldRect, newRect, zone, workArea, op, layout, overrides);
        return updates.length > 0 ? updates[0] : null;
    }

    /**
     * Find which divider corresponds to an edge by traversing the BTree
     * Returns the divider info including the area context for proper ratio calculation
     * @private
     */
    _findDividerForEdgeWithArea(edge, zone, workArea, layout, overrides = []) {
        // Extract the actual layout tree
        const layoutData = layout?.layout ?? layout;
        if (!layoutData?.tree) {
            // Simple grid layout - use basic calculation with full work area
            const simple = this._findDividerForEdgeSimple(edge, zone, workArea);
            if (simple) {
                const isVertical = (edge === 'left' || edge === 'right');
                return {
                    path: simple.path,
                    direction: isVertical ? 'vertical' : 'horizontal',
                    area: workArea
                };
            }
            return null;
        }

        // For BTree layouts, traverse to find the correct divider
        const zoneEdgePos = this._getZoneEdgePosition(edge, zone);
        const isVerticalEdge = (edge === 'left' || edge === 'right');

        // Required divider direction: vertical edges need vertical dividers, horizontal edges need horizontal dividers
        const requiredDirection = isVerticalEdge ? 'vertical' : 'horizontal';

        console.log(`SnapKit DEBUG: _findDividerForEdgeWithArea - looking for ${requiredDirection} divider at edge=${edge}, edgePos=${zoneEdgePos}`);

        // Build override map for quick lookup
        const overrideMap = new Map();
        for (const o of overrides) {
            overrideMap.set(o.path, o.ratio);
        }

        // Traverse the tree to find matching divider WITH area context
        const result = this._findDividerInTreeWithArea(
            layoutData.tree,
            '',  // path starts empty (root)
            workArea,
            zone.zoneIndex,
            edge,
            zoneEdgePos,
            requiredDirection,
            overrideMap
        );

        if (result) {
            console.log(`SnapKit DEBUG: _findDividerForEdgeWithArea - found divider at path="${result.path}" for edge=${edge}`);
        } else {
            console.log(`SnapKit DEBUG: _findDividerForEdgeWithArea - no divider found for edge=${edge}`);
        }

        return result;
    }

    /**
     * Find which divider corresponds to an edge (legacy, without area)
     * @private
     */
    _findDividerForEdge(edge, zone, workArea, layout, overrides = []) {
        const result = this._findDividerForEdgeWithArea(edge, zone, workArea, layout, overrides);
        if (result) {
            return { path: result.path, currentRatio: result.currentRatio };
        }
        return null;
    }

    /**
     * Get the position of a zone's edge
     * @private
     */
    _getZoneEdgePosition(edge, zone) {
        switch (edge) {
            case 'left': return zone.x;
            case 'right': return zone.x + zone.width;
            case 'top': return zone.y;
            case 'bottom': return zone.y + zone.height;
        }
        return 0;
    }

    /**
     * Recursively find the divider that controls a zone's edge (with area context)
     * @private
     */
    _findDividerInTreeWithArea(node, path, area, zoneIndex, edge, edgePos, requiredDirection, overrideMap) {
        if (!node || node.zone !== undefined) {
            // Leaf node - no divider here
            return null;
        }

        const { direction, left, right } = node;

        // Get the effective ratio (with override if exists)
        const originalRatio = node.ratio;
        const effectiveRatio = overrideMap.has(path) ? overrideMap.get(path) : originalRatio;

        // Calculate the divider line position using effective ratio
        let dividerPos;
        if (direction === 'vertical') {
            dividerPos = area.x + area.width * effectiveRatio;
        } else {
            dividerPos = area.y + area.height * effectiveRatio;
        }

        // Calculate left and right areas using effective ratio
        const { leftArea, rightArea } = this._splitAreaForNode(area, direction, effectiveRatio);

        // Check if the zone is in the left or right subtree
        const zoneInLeft = this._isZoneInSubtree(left, zoneIndex);
        const zoneInRight = this._isZoneInSubtree(right, zoneIndex);

        // If this divider matches the edge we're looking for
        if (direction === requiredDirection) {
            const tolerance = 15; // pixels - increased tolerance for better matching

            console.log(`SnapKit DEBUG: _findDividerInTreeWithArea - checking path="${path}", dividerPos=${dividerPos.toFixed(0)}, edgePos=${edgePos}, diff=${Math.abs(edgePos - dividerPos).toFixed(0)}`);

            // Check if the zone's edge aligns with this divider
            if (Math.abs(edgePos - dividerPos) < tolerance) {
                // This divider controls this edge - return path, direction, and the AREA this divider operates in
                return {
                    path,
                    direction,
                    area: { ...area },  // The area this ratio applies to
                    currentRatio: effectiveRatio
                };
            }
        }

        // Recurse into the appropriate subtree
        if (zoneInLeft) {
            return this._findDividerInTreeWithArea(left, path + 'L', leftArea, zoneIndex, edge, edgePos, requiredDirection, overrideMap);
        } else if (zoneInRight) {
            return this._findDividerInTreeWithArea(right, path + 'R', rightArea, zoneIndex, edge, edgePos, requiredDirection, overrideMap);
        }

        return null;
    }

    /**
     * Recursively find the divider that controls a zone's edge (legacy)
     * @private
     */
    _findDividerInTree(node, path, area, zoneIndex, edge, edgePos, requiredDirection, overrideMap) {
        const result = this._findDividerInTreeWithArea(node, path, area, zoneIndex, edge, edgePos, requiredDirection, overrideMap);
        if (result) {
            return { path: result.path, currentRatio: result.currentRatio };
        }
        return null;
    }

    /**
     * Check if a zone index is in a subtree
     * @private
     */
    _isZoneInSubtree(node, zoneIndex) {
        if (!node) return false;
        if (node.zone !== undefined) {
            return node.zone === zoneIndex;
        }
        return this._isZoneInSubtree(node.left, zoneIndex) ||
               this._isZoneInSubtree(node.right, zoneIndex);
    }

    /**
     * Split area for a node (similar to LayoutResolver)
     * @private
     */
    _splitAreaForNode(area, direction, ratio) {
        if (direction === 'horizontal') {
            const splitY = area.y + area.height * ratio;
            return {
                leftArea: { x: area.x, y: area.y, width: area.width, height: splitY - area.y },
                rightArea: { x: area.x, y: splitY, width: area.width, height: area.y + area.height - splitY }
            };
        } else {
            const splitX = area.x + area.width * ratio;
            return {
                leftArea: { x: area.x, y: area.y, width: splitX - area.x, height: area.height },
                rightArea: { x: splitX, y: area.y, width: area.x + area.width - splitX, height: area.height }
            };
        }
    }

    /**
     * Simple divider finding for grid layouts
     * @private
     */
    _findDividerForEdgeSimple(edge, zone, workArea) {
        const zoneRelLeft = (zone.x - workArea.x) / workArea.width;
        const zoneRelRight = (zone.x + zone.width - workArea.x) / workArea.width;
        const zoneRelTop = (zone.y - workArea.y) / workArea.height;
        const zoneRelBottom = (zone.y + zone.height - workArea.y) / workArea.height;

        if (edge === 'left' && zoneRelLeft > 0.05) {
            return { path: '', currentRatio: zoneRelLeft };
        }
        if (edge === 'right' && zoneRelRight < 0.95) {
            return { path: '', currentRatio: zoneRelRight };
        }
        if (edge === 'top' && zoneRelTop > 0.05) {
            return { path: '', currentRatio: zoneRelTop };
        }
        if (edge === 'bottom' && zoneRelBottom < 0.95) {
            return { path: '', currentRatio: zoneRelBottom };
        }

        return null;
    }

    /**
     * Re-snap all windows in a layout
     * @private
     */
    _resnapAllWindows(monitorIndex, layoutId, layout) {
        const windows = this._windowTracker.getWindowsInLayoutOnMonitor(monitorIndex, layoutId);
        const overrides = this._overrideStore.getOverrides(layoutId, monitorIndex);

        console.log(`SnapKit DEBUG: _resnapAllWindows - found ${windows.length} windows in layout ${layoutId} on monitor ${monitorIndex}`);
        console.log(`SnapKit DEBUG: _resnapAllWindows - using overrides: ${JSON.stringify(overrides)}`);

        for (const window of windows) {
            const info = this._windowTracker.getWindowInfo(window);
            if (info) {
                console.log(`SnapKit DEBUG: _resnapAllWindows - re-snapping "${window.get_title()}" to zone ${info.zoneIndex}`);
                // Get layout definition
                const layoutDef = this._layoutManager.getLayout(layoutId);
                if (layoutDef) {
                    this._snapHandler.snapToZone(
                        window,
                        monitorIndex,
                        layoutId,
                        info.zoneIndex,
                        layoutDef.layout,
                        { overrides }
                    );
                }
            }
        }

        this._logger.debug('Re-snapped all windows', {
            monitorIndex,
            layoutId,
            count: windows.length
        });
    }

    /**
     * Clear resize state
     * @private
     */
    _clearResizeState() {
        this._resizingWindow = null;
        this._resizeOp = null;
        this._originalRect = null;
        this._resizeInfo = null;
    }

    /**
     * Check if grab op is a resize
     * @private
     */
    _isResizeOp(op) {
        return op === Meta.GrabOp.RESIZING_N ||
               op === Meta.GrabOp.RESIZING_S ||
               op === Meta.GrabOp.RESIZING_E ||
               op === Meta.GrabOp.RESIZING_W ||
               op === Meta.GrabOp.RESIZING_NE ||
               op === Meta.GrabOp.RESIZING_NW ||
               op === Meta.GrabOp.RESIZING_SE ||
               op === Meta.GrabOp.RESIZING_SW;
    }

    /**
     * Check if op resizes left edge
     * @private
     */
    _isLeftResize(op) {
        return op === Meta.GrabOp.RESIZING_W ||
               op === Meta.GrabOp.RESIZING_NW ||
               op === Meta.GrabOp.RESIZING_SW;
    }

    /**
     * Check if op resizes right edge
     * @private
     */
    _isRightResize(op) {
        return op === Meta.GrabOp.RESIZING_E ||
               op === Meta.GrabOp.RESIZING_NE ||
               op === Meta.GrabOp.RESIZING_SE;
    }

    /**
     * Check if op resizes top edge
     * @private
     */
    _isTopResize(op) {
        return op === Meta.GrabOp.RESIZING_N ||
               op === Meta.GrabOp.RESIZING_NE ||
               op === Meta.GrabOp.RESIZING_NW;
    }

    /**
     * Check if op resizes bottom edge
     * @private
     */
    _isBottomResize(op) {
        return op === Meta.GrabOp.RESIZING_S ||
               op === Meta.GrabOp.RESIZING_SE ||
               op === Meta.GrabOp.RESIZING_SW;
    }

    /**
     * Get human-readable op name
     * @private
     */
    _getOpName(op) {
        const names = {
            [Meta.GrabOp.RESIZING_N]: 'RESIZING_N',
            [Meta.GrabOp.RESIZING_S]: 'RESIZING_S',
            [Meta.GrabOp.RESIZING_E]: 'RESIZING_E',
            [Meta.GrabOp.RESIZING_W]: 'RESIZING_W',
            [Meta.GrabOp.RESIZING_NE]: 'RESIZING_NE',
            [Meta.GrabOp.RESIZING_NW]: 'RESIZING_NW',
            [Meta.GrabOp.RESIZING_SE]: 'RESIZING_SE',
            [Meta.GrabOp.RESIZING_SW]: 'RESIZING_SW'
        };
        return names[op] || `UNKNOWN(${op})`;
    }

    /**
     * Enable the manager
     */
    enable() {
        if (!this._enabled) {
            this.initialize();
        }
    }

    /**
     * Disable the manager
     */
    disable() {
        this._enabled = false;
        this._clearResizeState();
        this._logger.info('DividerSyncManager disabled');
    }

    /**
     * Destroy the manager
     */
    destroy() {
        this.disable();

        // Disconnect signals
        for (const { object, id } of this._signalIds) {
            try {
                object.disconnect(id);
            } catch (e) {
                // Object may be destroyed
            }
        }
        this._signalIds = [];

        this._logger.info('DividerSyncManager destroyed');
    }
}
