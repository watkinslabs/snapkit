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

    /**
     * Show the snap preview on all monitors
     * @param {string} layoutId - Layout to show (optional, uses first enabled if not specified)
     */
    show(layoutId = null) {
        if (this._visible) return;

        let layout = null;

        if (layoutId) {
            layout = this._layoutManager.getLayout(layoutId);
        } else {
            // Use the first enabled layout
            const enabledLayouts = this._layoutManager.getEnabledLayouts();
            if (enabledLayouts.length > 0) {
                layout = enabledLayouts[0];
            }
        }

        if (!layout) {
            log('SnapKit SnapPreview: No layout found');
            return;
        }

        // Make sure layout has zones array
        if (!layout.zones || !Array.isArray(layout.zones)) {
            log('SnapKit SnapPreview: Layout has no zones');
            return;
        }

        this._visible = true;
        this._currentLayout = layout;

        // Create overlays for all monitors
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            this._createOverlayForMonitor(i, layout);
        }
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
        if (!this._visible) return null;

        // Find which monitor and zone the cursor is over
        const monitor = this._getMonitorAt(x, y);
        if (!monitor) return null;

        const overlay = this._overlays.get(monitor.index);
        if (!overlay) return null;

        // Find zone at position
        const zone = this._findZoneAtPosition(x, y, monitor);

        // Update highlight
        if (zone !== this._highlightedZone) {
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
        const monitor = Main.layoutManager.monitors[monitorIndex];
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);

        // Create container
        const overlay = new St.Widget({
            x: workArea.x,
            y: workArea.y,
            width: workArea.width,
            height: workArea.height,
            reactive: false,
            opacity: 0
        });

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

        // Create zone actors
        for (const [zoneId, zoneRects] of rects) {
            const rect = zoneRects.tileRect;

            // Adjust rect to be relative to overlay
            const zoneActor = new St.Widget({
                x: rect.x - workArea.x,
                y: rect.y - workArea.y,
                width: rect.width,
                height: rect.height,
                style: `
                    background-color: ${this._colorToString(gridColor)};
                    border: 2px solid ${this._colorToString(borderColor)};
                    border-radius: 4px;
                `
            });

            zoneActor._zoneId = zoneId;
            zoneActor._zone = { id: zoneId, ...zoneRects };

            overlay.add_child(zoneActor);
            overlay._zoneActors.set(zoneId, zoneActor);
        }

        // Add to stage
        Main.layoutManager.addTopChrome(overlay);
        this._overlays.set(monitorIndex, overlay);

        // Fade in
        overlay.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
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

        actor.set_style(`
            background-color: ${this._colorToString(bgColor)};
            border: ${highlighted ? 3 : 2}px solid ${this._colorToString(borderColor)};
            border-radius: 4px;
        `);
    }

    /**
     * Find the zone at a given position
     */
    _findZoneAtPosition(x, y, monitor) {
        const overlay = this._overlays.get(monitor.index);
        if (!overlay || !overlay._zoneActors) return null;

        for (const [zoneId, actor] of overlay._zoneActors) {
            const [ax, ay] = actor.get_transformed_position();
            const [aw, ah] = actor.get_size();

            if (x >= ax && x < ax + aw && y >= ay && y < ay + ah) {
                return actor._zone;
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
