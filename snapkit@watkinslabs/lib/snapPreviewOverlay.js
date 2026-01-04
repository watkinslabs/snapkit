/**
 * Snap Preview Overlay
 *
 * Shows a grid overlay when dragging windows, with zones that can be snapped to.
 * Features:
 * - Fades in when dragging starts
 * - Highlights zone under cursor
 * - Auto-snaps on release (optional)
 * - Can be disabled with modifier key
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Sub-zone split types
const SubZone = {
    FULL: 'full',
    LEFT: 'left',
    RIGHT: 'right',
    TOP: 'top',
    BOTTOM: 'bottom'
};

export class SnapPreviewOverlay {
    constructor(settings, layoutManager, tileManager = null) {
        this._settings = settings;
        this._layoutManager = layoutManager;
        this._tileManager = tileManager;
        this._overlays = new Map(); // monitorIndex -> overlay actor
        this._highlightedZone = null;
        this._visible = false;
        this._currentMonitorIndex = -1; // Track which monitor's overlay is visible
        this._currentLayout = null; // Current layout for the visible monitor

        // Sub-zone splitting state
        this._currentSubZone = SubZone.FULL;
        this._subZoneIndicator = null;
        this._effectiveZone = null; // Zone with modified windowRect for sub-zone
    }

    /**
     * Set the tile manager reference (for getting modified zone positions)
     */
    setTileManager(tileManager) {
        this._tileManager = tileManager;
    }

    _debug(message) {
        if (this._settings && this._settings.get_boolean('debug-mode')) {
            log(`SnapKit SnapPreview: ${message}`);
        }
    }

    /**
     * Get the layout for a specific monitor from settings
     * @param {number} monitorIndex - Monitor index
     * @returns {object|null} Layout object or null
     */
    _getLayoutForMonitor(monitorIndex) {
        let layoutId = null;

        // Try to get per-monitor layout from settings
        try {
            const savedLayouts = this._settings.get_string('monitor-layouts');
            const layoutsObj = JSON.parse(savedLayouts);
            layoutId = layoutsObj[monitorIndex.toString()];
            this._debug(`Monitor ${monitorIndex} has assigned layout: ${layoutId || 'none'}`);
        } catch (e) {
            this._debug(`Error loading monitor layouts: ${e.message}`);
        }

        // If monitor has an assigned layout, use it
        if (layoutId) {
            const layout = this._layoutManager.getLayout(layoutId);
            if (layout) {
                return layout;
            }
            this._debug(`Assigned layout ${layoutId} not found for monitor ${monitorIndex}`);
        }

        // Fall back to snap-preview-layout setting
        const savedLayoutId = this._settings.get_string('snap-preview-layout');
        if (savedLayoutId) {
            const layout = this._layoutManager.getLayout(savedLayoutId);
            if (layout) {
                this._debug(`Using snap-preview-layout ${savedLayoutId} for monitor ${monitorIndex}`);
                return layout;
            }
        }

        // Fall back to first enabled layout
        const enabledLayouts = this._layoutManager.getEnabledLayouts();
        if (enabledLayouts.length > 0) {
            this._debug(`Using first enabled layout for monitor ${monitorIndex}`);
            return enabledLayouts[0];
        }

        return null;
    }

    /**
     * Show the snap preview - prepares overlays but doesn't show them yet
     * Overlays are shown/hidden based on cursor position via updateVisibility()
     */
    show() {
        if (this._visible) return;

        this._visible = true;
        this._currentMonitorIndex = -1; // No monitor active yet

        // Create overlays for all monitors with their respective layouts
        // But start with opacity 0 - updateVisibility will show the right one
        for (const monitor of Main.layoutManager.monitors) {
            const layout = this._getLayoutForMonitor(monitor.index);
            if (!layout) {
                this._debug(`No layout available for monitor ${monitor.index}, skipping`);
                continue;
            }

            // Make sure layout has zones
            const zones = this._layoutManager.getZonesForDisplay(layout);
            if (!zones || zones.length === 0) {
                this._debug(`Layout for monitor ${monitor.index} has no zones, skipping`);
                continue;
            }

            this._createOverlayForMonitor(monitor.index, layout);
        }

        this._debug(`Created overlays for ${this._overlays.size} monitors (all hidden initially)`);
    }

    /**
     * Update which monitor's overlay is visible based on cursor position
     * @param {number} x - Cursor X
     * @param {number} y - Cursor Y
     */
    updateVisibility(x, y) {
        if (!this._visible) return;

        const monitor = this._getMonitorAt(x, y);
        if (!monitor) return;

        // If cursor moved to a different monitor, update visibility
        if (monitor.index !== this._currentMonitorIndex) {
            this._debug(`Cursor moved to monitor ${monitor.index} from ${this._currentMonitorIndex}`);

            // Hide previous monitor's overlay
            if (this._currentMonitorIndex !== -1) {
                const prevOverlay = this._overlays.get(this._currentMonitorIndex);
                if (prevOverlay) {
                    prevOverlay.ease({
                        opacity: 0,
                        duration: 100,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD
                    });
                }
            }

            // Show current monitor's overlay
            const overlay = this._overlays.get(monitor.index);
            if (overlay) {
                overlay.ease({
                    opacity: overlay._targetOpacity,
                    duration: 150,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
                this._currentLayout = overlay._layout;
            }

            this._currentMonitorIndex = monitor.index;
        }
    }

    /**
     * Hide the snap preview
     */
    hide() {
        if (!this._visible) return;

        this._visible = false;
        this._highlightedZone = null;
        this._currentMonitorIndex = -1;
        this._currentLayout = null;
        this._effectiveZone = null;
        this._currentSubZone = SubZone.FULL;

        // Clean up sub-zone indicator
        if (this._subZoneIndicator) {
            this._subZoneIndicator.destroy();
            this._subZoneIndicator = null;
        }

        for (const [index, overlay] of this._overlays) {
            overlay.ease({
                opacity: 0,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    overlay.destroy();
                }
            });
        }
        this._overlays.clear();
    }

    /**
     * Update highlight based on cursor position
     * @param {number} x - Cursor X
     * @param {number} y - Cursor Y
     * @returns {object|null} - The zone under cursor (with sub-zone rect if applicable), or null
     */
    updateHighlight(x, y) {
        if (!this._visible) {
            this._debug(`updateHighlight: not visible`);
            return null;
        }

        // Find which monitor and zone the cursor is over
        const monitor = this._getMonitorAt(x, y);
        if (!monitor) {
            this._debug(`updateHighlight: no monitor at (${x}, ${y})`);
            this._hideSubZoneIndicator();
            return null;
        }

        const overlay = this._overlays.get(monitor.index);
        if (!overlay) {
            this._debug(`No overlay for monitor ${monitor.index}, have overlays for: ${[...this._overlays.keys()].join(', ')}`);
            this._hideSubZoneIndicator();
            return null;
        }

        // Find zone at position
        const zone = this._findZoneAtPosition(x, y, monitor);

        // Compare by ID, not object reference
        const currentZoneId = this._highlightedZone?.id ?? null;
        const newZoneId = zone?.id ?? null;

        // Update highlight if zone changed
        if (newZoneId !== currentZoneId) {
            // Unhighlight previous
            if (this._highlightedZone && overlay._zoneActors) {
                const prevActor = overlay._zoneActors.get(this._highlightedZone.id);
                if (prevActor) {
                    this._setZoneHighlight(prevActor, false);
                }
            }

            // Highlight new (dimmed if we're showing sub-zone)
            if (zone && overlay._zoneActors) {
                const zoneActor = overlay._zoneActors.get(zone.id);
                if (zoneActor) {
                    this._setZoneHighlight(zoneActor, true);
                    this._debug(`Highlighted zone: ${zone.id}, has windowRect: ${zone.windowRect ? 'yes' : 'no'}`);
                } else {
                    this._debug(`Zone actor not found for zone ${zone.id}`);
                }
            }

            this._highlightedZone = zone;
        }

        // Update sub-zone detection if zone splitting is enabled
        if (zone && this._settings.get_boolean('zone-split-enabled')) {
            const subZone = this._detectSubZone(x, y, zone);
            this._updateSubZoneIndicator(zone, subZone, overlay);
            this._effectiveZone = this._calculateEffectiveZone(zone, subZone);
            return this._effectiveZone;
        } else {
            this._hideSubZoneIndicator();
            this._effectiveZone = zone;
            this._currentSubZone = SubZone.FULL;
        }

        return zone;
    }

    /**
     * Detect which sub-zone the cursor is in
     * @param {number} x - Cursor X
     * @param {number} y - Cursor Y
     * @param {object} zone - The zone object
     * @returns {string} - SubZone type
     */
    _detectSubZone(x, y, zone) {
        if (!zone || !zone.tileRect) return SubZone.FULL;

        const rect = zone.tileRect;
        const threshold = this._settings.get_double('zone-split-threshold');

        // Calculate position within zone (0-1)
        const relX = (x - rect.x) / rect.width;
        const relY = (y - rect.y) / rect.height;

        // Check edges - prioritize the edge closest to cursor
        const distLeft = relX;
        const distRight = 1 - relX;
        const distTop = relY;
        const distBottom = 1 - relY;

        const minHorizontal = Math.min(distLeft, distRight);
        const minVertical = Math.min(distTop, distBottom);

        // Only trigger if we're within the threshold of an edge
        if (minHorizontal > threshold && minVertical > threshold) {
            return SubZone.FULL; // In center, no split
        }

        // Prefer the closest edge
        if (minHorizontal < minVertical) {
            // Horizontal split
            return distLeft < distRight ? SubZone.LEFT : SubZone.RIGHT;
        } else {
            // Vertical split
            return distTop < distBottom ? SubZone.TOP : SubZone.BOTTOM;
        }
    }

    /**
     * Calculate the effective zone rect based on sub-zone
     * @param {object} zone - Original zone
     * @param {string} subZone - Sub-zone type
     * @returns {object} - Zone with modified windowRect
     */
    _calculateEffectiveZone(zone, subZone) {
        if (!zone || !zone.windowRect || subZone === SubZone.FULL) {
            return zone;
        }

        const rect = zone.windowRect;
        let newRect;

        switch (subZone) {
            case SubZone.LEFT:
                newRect = {
                    x: rect.x,
                    y: rect.y,
                    width: Math.floor(rect.width / 2),
                    height: rect.height
                };
                break;
            case SubZone.RIGHT:
                newRect = {
                    x: rect.x + Math.floor(rect.width / 2),
                    y: rect.y,
                    width: Math.ceil(rect.width / 2),
                    height: rect.height
                };
                break;
            case SubZone.TOP:
                newRect = {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: Math.floor(rect.height / 2)
                };
                break;
            case SubZone.BOTTOM:
                newRect = {
                    x: rect.x,
                    y: rect.y + Math.floor(rect.height / 2),
                    width: rect.width,
                    height: Math.ceil(rect.height / 2)
                };
                break;
            default:
                return zone;
        }

        // Return a new zone object with modified windowRect
        return {
            ...zone,
            windowRect: newRect,
            subZone: subZone,
            originalWindowRect: rect
        };
    }

    /**
     * Update or create the sub-zone indicator
     * @param {object} zone - The zone
     * @param {string} subZone - Sub-zone type
     * @param {St.Widget} overlay - The overlay widget
     */
    _updateSubZoneIndicator(zone, subZone, overlay) {
        if (subZone === SubZone.FULL) {
            this._hideSubZoneIndicator();
            this._currentSubZone = SubZone.FULL;
            return;
        }

        if (!zone || !zone.tileRect) {
            this._hideSubZoneIndicator();
            return;
        }

        const rect = zone.tileRect;
        const workArea = Main.layoutManager.getWorkAreaForMonitor(this._currentMonitorIndex);
        const color = this._parseColor(this._settings.get_string('zone-split-preview-color'));

        let indicatorRect;
        switch (subZone) {
            case SubZone.LEFT:
                indicatorRect = {
                    x: rect.x - workArea.x,
                    y: rect.y - workArea.y,
                    width: Math.floor(rect.width / 2),
                    height: rect.height
                };
                break;
            case SubZone.RIGHT:
                indicatorRect = {
                    x: rect.x - workArea.x + Math.floor(rect.width / 2),
                    y: rect.y - workArea.y,
                    width: Math.ceil(rect.width / 2),
                    height: rect.height
                };
                break;
            case SubZone.TOP:
                indicatorRect = {
                    x: rect.x - workArea.x,
                    y: rect.y - workArea.y,
                    width: rect.width,
                    height: Math.floor(rect.height / 2)
                };
                break;
            case SubZone.BOTTOM:
                indicatorRect = {
                    x: rect.x - workArea.x,
                    y: rect.y - workArea.y + Math.floor(rect.height / 2),
                    width: rect.width,
                    height: Math.ceil(rect.height / 2)
                };
                break;
        }

        // Create or update indicator
        if (!this._subZoneIndicator) {
            this._subZoneIndicator = new St.Widget({
                style: `
                    background-color: ${this._colorToString(color)};
                    border: 3px solid rgba(255, 255, 255, 0.8);
                    border-radius: 6px;
                `,
                opacity: 255
            });
            overlay.add_child(this._subZoneIndicator);
        }

        this._subZoneIndicator.set_position(indicatorRect.x, indicatorRect.y);
        this._subZoneIndicator.set_size(indicatorRect.width, indicatorRect.height);
        this._subZoneIndicator.show();

        this._currentSubZone = subZone;
        this._debug(`Sub-zone indicator: ${subZone} at (${indicatorRect.x}, ${indicatorRect.y}) ${indicatorRect.width}x${indicatorRect.height}`);
    }

    /**
     * Hide the sub-zone indicator
     */
    _hideSubZoneIndicator() {
        if (this._subZoneIndicator) {
            this._subZoneIndicator.hide();
        }
        this._currentSubZone = SubZone.FULL;
    }

    /**
     * Get the currently highlighted zone (with sub-zone rect if applicable)
     * @returns {object|null}
     */
    getHighlightedZone() {
        // Return effective zone which has modified windowRect for sub-zones
        return this._effectiveZone || this._highlightedZone;
    }

    /**
     * Get the current sub-zone type
     * @returns {string}
     */
    getCurrentSubZone() {
        return this._currentSubZone;
    }

    /**
     * Create overlay for a specific monitor
     */
    _createOverlayForMonitor(monitorIndex, layout) {
        const monitor = Main.layoutManager.monitors.find(m => m.index === monitorIndex);
        if (!monitor) {
            this._debug(`Monitor ${monitorIndex} not found`);
            return;
        }

        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        this._debug(`Creating overlay for monitor ${monitorIndex}: workArea (${workArea.x}, ${workArea.y}) ${workArea.width}x${workArea.height}`);

        // Get opacity from snap-preview-opacity setting
        const opacitySetting = this._settings.get_double('snap-preview-opacity');
        const targetOpacity = Math.round(opacitySetting * 255);
        this._debug(`Snap preview opacity: ${opacitySetting} -> ${targetOpacity}`);

        // Create container
        const overlay = new St.Widget({
            x: workArea.x,
            y: workArea.y,
            width: workArea.width,
            height: workArea.height,
            reactive: false,
            opacity: 0  // Start at 0 for fade-in animation
        });

        overlay._targetOpacity = targetOpacity;

        overlay._zoneActors = new Map();

        // Get colors from settings
        const gridColor = this._parseColor(
            this._settings.get_string('snap-preview-grid-color')
        );
        const borderColor = this._parseColor(
            this._settings.get_string('snap-preview-grid-border-color')
        );
        const tooSmallColor = this._parseColor(
            this._settings.get_string('zone-too-small-color')
        );

        // Get minimum zone size settings for Zone Splitting feature
        const minZoneWidth = this._settings.get_int('zone-min-width');
        const minZoneHeight = this._settings.get_int('zone-min-height');

        // Resolve layout to get zone rects (base positions)
        const rects = this._layoutManager.resolveLayoutRects(layout, workArea, monitor);

        // Check if tileManager has modified positions for this monitor
        const tileGroup = this._tileManager?.getTileGroup(monitorIndex);
        const hasModifiedPositions = tileGroup && tileGroup.layoutId === (layout.id || layout.name);

        this._debug(`╔═══ GRID OVERLAY ZONES ═══╗`);
        this._debug(`║ Layout: ${layout.id || layout.name}, Monitor: ${monitorIndex}`);
        this._debug(`║ Using modified positions: ${hasModifiedPositions ? 'YES' : 'NO'}`);
        this._debug(`║ WorkArea: x=${workArea.x}, y=${workArea.y}, w=${workArea.width}, h=${workArea.height}`);

        // Build map of modified positions from tileManager
        const modifiedPositions = new Map();
        if (hasModifiedPositions && this._tileManager) {
            for (const [zoneId, window] of tileGroup.windows) {
                const windowInfo = this._tileManager._windowInfo.get(window);
                if (windowInfo?.zone?.windowRect) {
                    modifiedPositions.set(zoneId, windowInfo.zone);
                    this._debug(`║ Modified zone ${zoneId}: x=${windowInfo.zone.windowRect.x}, w=${windowInfo.zone.windowRect.width}`);
                }
            }
        }

        // Create zone actors
        for (const [zoneId, zoneRects] of rects) {
            // Use modified positions if available, otherwise use fresh resolved
            const modifiedZone = modifiedPositions.get(zoneId);
            const rect = modifiedZone?.tileRect || zoneRects.tileRect;
            const windowRect = modifiedZone?.windowRect || zoneRects.windowRect;

            const source = modifiedZone ? 'MODIFIED' : 'ORIGINAL';
            this._debug(`║ Zone ${zoneId} [${source}]: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);

            // Check if zone is too small (Zone Splitting feature)
            const isTooSmall = rect.width < minZoneWidth || rect.height < minZoneHeight;
            const bgColor = isTooSmall ? tooSmallColor : gridColor;

            // Adjust rect to be relative to overlay
            const zoneStyle = `
                background-color: ${this._colorToString(bgColor)};
                border: 2px solid ${this._colorToString(borderColor)};
                border-radius: 4px;
            `;
            this._debug(`Zone ${zoneId} style: bg=${this._colorToString(bgColor)}, border=${this._colorToString(borderColor)}, tooSmall=${isTooSmall}`);

            const zoneActor = new St.Widget({
                x: rect.x - workArea.x,
                y: rect.y - workArea.y,
                width: rect.width,
                height: rect.height,
                style: zoneStyle,
                opacity: 255  // Zones should be fully opaque within the overlay
            });

            zoneActor._zoneId = zoneId;
            zoneActor._isTooSmall = isTooSmall;
            // Store the zone data including both tileRect and windowRect
            // Use modified positions if available
            zoneActor._zone = {
                id: zoneId,
                tileRect: rect,
                windowRect: windowRect
            };

            overlay.add_child(zoneActor);
            overlay._zoneActors.set(zoneId, zoneActor);
        }

        this._debug(`╚═══════════════════════════════════════════════════════════╝`);

        // Store layout reference on overlay for per-monitor tracking
        overlay._layout = layout;

        // Add to stage
        Main.layoutManager.addTopChrome(overlay);
        this._overlays.set(monitorIndex, overlay);

        // Don't fade in here - let updateVisibility() control which monitor is shown
        // Overlay starts at opacity 0

        this._debug(`Overlay created for monitor ${monitorIndex} with ${overlay._zoneActors.size} zones (hidden until cursor enters)`);
    }

    /**
     * Set highlight state on a zone actor
     */
    _setZoneHighlight(actor, highlighted) {
        const highlightColor = this._parseColor(
            this._settings.get_string('snap-preview-highlight-color')
        );
        const gridColor = this._parseColor(
            this._settings.get_string('snap-preview-grid-color')
        );
        const borderColor = this._parseColor(
            this._settings.get_string('snap-preview-grid-border-color')
        );
        const tooSmallColor = this._parseColor(
            this._settings.get_string('zone-too-small-color')
        );

        // If zone is too small, always show the warning color (don't highlight)
        let bgColor;
        if (actor._isTooSmall) {
            bgColor = tooSmallColor;
        } else {
            bgColor = highlighted ? highlightColor : gridColor;
        }

        const bgColorStr = this._colorToString(bgColor);
        const borderColorStr = this._colorToString(borderColor);

        this._debug(`_setZoneHighlight: zone=${actor._zoneId}, highlighted=${highlighted}, tooSmall=${actor._isTooSmall}, bg=${bgColorStr}`);

        const style = `
            background-color: ${bgColorStr};
            border: ${highlighted ? 3 : 2}px solid ${borderColorStr};
            border-radius: 4px;
        `;

        actor.set_style(style);
    }

    /**
     * Find the zone at a given position
     */
    _findZoneAtPosition(x, y, monitor) {
        const overlay = this._overlays.get(monitor.index);
        if (!overlay || !overlay._zoneActors) {
            this._debug(`_findZoneAtPosition: no overlay for monitor ${monitor.index}`);
            return null;
        }

        // Log zone positions on first check or periodically
        if (!this._lastZoneLog || Date.now() - this._lastZoneLog > 2000) {
            this._lastZoneLog = Date.now();
            this._debug(`Checking ${overlay._zoneActors.size} zones for position (${x}, ${y})`);
            for (const [zoneId, actor] of overlay._zoneActors) {
                const zone = actor._zone;
                if (zone && zone.tileRect) {
                    const rect = zone.tileRect;
                    this._debug(`  Zone ${zoneId}: tileRect=(${rect.x}, ${rect.y}, ${rect.width}x${rect.height})`);
                }
            }
        }

        // Use stored tileRect for hit testing (more reliable than actor transform)
        for (const [zoneId, actor] of overlay._zoneActors) {
            const zone = actor._zone;
            if (!zone || !zone.tileRect) continue;

            const rect = zone.tileRect;
            if (x >= rect.x && x < rect.x + rect.width &&
                y >= rect.y && y < rect.y + rect.height) {
                this._debug(`Found zone ${zoneId} at (${x}, ${y})`);
                return zone;
            }
        }

        return null;
    }

    /**
     * Get monitor at position
     */
    _getMonitorAt(x, y) {
        for (const monitor of Main.layoutManager.monitors) {
            if (x >= monitor.x && x < monitor.x + monitor.width &&
                y >= monitor.y && y < monitor.y + monitor.height) {
                return monitor;
            }
        }
        return null;
    }

    /**
     * Parse a color string to {r, g, b, a}
     */
    _parseColor(colorStr) {
        // Parse rgba(r, g, b, a) format
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            return {
                r: parseInt(match[1]) / 255,
                g: parseInt(match[2]) / 255,
                b: parseInt(match[3]) / 255,
                a: match[4] ? parseFloat(match[4]) : 1.0
            };
        }
        // Default fallback
        return { r: 0.4, g: 0.6, b: 1.0, a: 0.3 };
    }

    /**
     * Convert color object to CSS string
     */
    _colorToString(color) {
        const r = Math.round(color.r * 255);
        const g = Math.round(color.g * 255);
        const b = Math.round(color.b * 255);
        return `rgba(${r}, ${g}, ${b}, ${color.a})`;
    }

    /**
     * Get the current layout
     */
    getCurrentLayout() {
        return this._currentLayout;
    }

    /**
     * Destroy the overlay
     */
    destroy() {
        this.hide();
        this._settings = null;
        this._layoutManager = null;
    }
}
