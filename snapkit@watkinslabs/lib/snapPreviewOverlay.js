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

export class SnapPreviewOverlay {
    constructor(settings, layoutManager) {
        this._settings = settings;
        this._layoutManager = layoutManager;
        this._overlays = new Map(); // monitorIndex -> overlay actor
        this._highlightedZone = null;
        this._visible = false;
    }

    _debug(message) {
        if (this._settings && this._settings.get_boolean('debug-mode')) {
            log(`SnapKit SnapPreview: ${message}`);
        }
    }

    /**
     * Show the snap preview on all monitors
     * @param {string} layoutId - Layout to show (optional, uses saved setting or first enabled)
     */
    show(layoutId = null) {
        if (this._visible) return;

        let layout = null;

        if (layoutId) {
            layout = this._layoutManager.getLayout(layoutId);
        } else {
            // Use the saved snap-preview-layout setting
            const savedLayoutId = this._settings.get_string('snap-preview-layout');
            this._debug(`Saved snap-preview-layout setting: ${savedLayoutId}`);

            if (savedLayoutId) {
                layout = this._layoutManager.getLayout(savedLayoutId);
                this._debug(`Found saved layout: ${layout ? 'yes' : 'no'}`);
            }

            // Fall back to first enabled layout if saved layout not found
            if (!layout) {
                const enabledLayouts = this._layoutManager.getEnabledLayouts();
                this._debug(`Saved layout not found, got ${enabledLayouts.length} enabled layouts`);
                if (enabledLayouts.length > 0) {
                    layout = enabledLayouts[0];
                }
            }
        }

        if (!layout) {
            this._debug('No layout found');
            return;
        }

        const layoutName = this._layoutManager.getLayoutId(layout);
        this._debug(`Using layout: ${layoutName}`);

        // Make sure layout has zones (works with both simple and full-spec layouts)
        const zones = this._layoutManager.getZonesForDisplay(layout);
        if (!zones || zones.length === 0) {
            this._debug('Layout has no zones, cannot show preview');
            return;
        }

        this._visible = true;
        this._currentLayout = layout;

        // Create overlays for all monitors, using monitor.index as key
        for (const monitor of Main.layoutManager.monitors) {
            this._createOverlayForMonitor(monitor.index, layout);
        }

        this._debug(`Created overlays for ${this._overlays.size} monitors`);
    }

    /**
     * Hide the snap preview
     */
    hide() {
        if (!this._visible) return;

        this._visible = false;
        this._highlightedZone = null;

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
     * @returns {object|null} - The zone under cursor, or null
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
            return null;
        }

        const overlay = this._overlays.get(monitor.index);
        if (!overlay) {
            this._debug(`No overlay for monitor ${monitor.index}, have overlays for: ${[...this._overlays.keys()].join(', ')}`);
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

            // Highlight new
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

        return zone;
    }

    /**
     * Get the currently highlighted zone
     * @returns {object|null}
     */
    getHighlightedZone() {
        return this._highlightedZone;
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

        // Resolve layout to get zone rects
        const rects = this._layoutManager.resolveLayoutRects(layout, workArea, monitor);
        this._debug(`Resolved ${rects.size} zones for layout`);

        // Create zone actors
        for (const [zoneId, zoneRects] of rects) {
            const rect = zoneRects.tileRect;
            const windowRect = zoneRects.windowRect;

            this._debug(`Zone ${zoneId}: tileRect=(${rect.x}, ${rect.y}) ${rect.width}x${rect.height}, windowRect=${windowRect ? `(${windowRect.x}, ${windowRect.y}) ${windowRect.width}x${windowRect.height}` : 'missing'}`);

            // Adjust rect to be relative to overlay
            const zoneStyle = `
                background-color: ${this._colorToString(gridColor)};
                border: 2px solid ${this._colorToString(borderColor)};
                border-radius: 4px;
            `;
            this._debug(`Zone ${zoneId} style: bg=${this._colorToString(gridColor)}, border=${this._colorToString(borderColor)}`);

            const zoneActor = new St.Widget({
                x: rect.x - workArea.x,
                y: rect.y - workArea.y,
                width: rect.width,
                height: rect.height,
                style: zoneStyle,
                opacity: 255  // Zones should be fully opaque within the overlay
            });

            zoneActor._zoneId = zoneId;
            // Store the zone data including both tileRect and windowRect
            zoneActor._zone = {
                id: zoneId,
                tileRect: zoneRects.tileRect,
                windowRect: zoneRects.windowRect
            };

            overlay.add_child(zoneActor);
            overlay._zoneActors.set(zoneId, zoneActor);
        }

        // Add to stage
        Main.layoutManager.addTopChrome(overlay);
        this._overlays.set(monitorIndex, overlay);

        // Fade in to target opacity
        overlay.ease({
            opacity: overlay._targetOpacity,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });

        this._debug(`Overlay created with ${overlay._zoneActors.size} zones, target opacity ${overlay._targetOpacity}`);
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

        const bgColor = highlighted ? highlightColor : gridColor;
        const bgColorStr = this._colorToString(bgColor);
        const borderColorStr = this._colorToString(borderColor);

        this._debug(`_setZoneHighlight: zone=${actor._zoneId}, highlighted=${highlighted}, bg=${bgColorStr}`);

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
