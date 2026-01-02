import {PRESET_LAYOUTS} from '../layouts/presets.js';

/**
 * LayoutManager - Manages layout definitions and provides utilities
 */
export class LayoutManager {
    constructor(settings) {
        this._settings = settings;
        this._layouts = new Map();
        this._loadLayouts();
    }

    _loadLayouts() {
        // Load preset layouts
        for (let layout of PRESET_LAYOUTS) {
            this._layouts.set(layout.id, layout);
        }

        // Load custom layouts from settings
        this._loadCustomLayouts();
    }

    _loadCustomLayouts() {
        try {
            const customLayoutsJson = this._settings.get_string('custom-layouts');
            const customLayouts = JSON.parse(customLayoutsJson);

            for (let layout of customLayouts) {
                // Validate layout structure
                if (this._validateLayout(layout)) {
                    this._layouts.set(layout.id, layout);
                }
            }
        } catch (e) {
            log(`SnapKit: Error loading custom layouts: ${e.message}`);
        }
    }

    _validateLayout(layout) {
        // Basic validation
        if (!layout.id || !layout.name || !layout.zones) {
            return false;
        }

        if (!Array.isArray(layout.zones) || layout.zones.length === 0) {
            return false;
        }

        // Validate each zone
        for (let zone of layout.zones) {
            if (typeof zone.x !== 'number' || typeof zone.y !== 'number' ||
                typeof zone.width !== 'number' || typeof zone.height !== 'number') {
                return false;
            }

            // Ensure coordinates are in valid range (0-1)
            if (zone.x < 0 || zone.x > 1 || zone.y < 0 || zone.y > 1 ||
                zone.width <= 0 || zone.width > 1 || zone.height <= 0 || zone.height > 1) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get all enabled layouts based on settings
     */
    getEnabledLayouts() {
        const enabledIds = this._settings.get_strv('enabled-layouts');
        const enabledLayouts = [];

        for (let id of enabledIds) {
            const layout = this._layouts.get(id);
            if (layout) {
                enabledLayouts.push(layout);
            }
        }

        return enabledLayouts;
    }

    /**
     * Get a specific layout by ID
     */
    getLayout(id) {
        return this._layouts.get(id);
    }

    /**
     * Get all available layouts (both preset and custom)
     */
    getAllLayouts() {
        return Array.from(this._layouts.values());
    }

    /**
     * Calculate absolute geometry for a zone based on monitor work area
     */
    calculateZoneGeometry(zone, workArea) {
        const geometry = {
            x: Math.round(workArea.x + (zone.x * workArea.width)),
            y: Math.round(workArea.y + (zone.y * workArea.height)),
            width: Math.round(zone.width * workArea.width),
            height: Math.round(zone.height * workArea.height)
        };

        if (this._settings && this._settings.get_boolean('debug-mode')) {
            log(`SnapKit LayoutManager: calculateZoneGeometry`);
            log(`  Zone (relative): x:${zone.x} y:${zone.y} w:${zone.width} h:${zone.height}`);
            log(`  Work area: x:${workArea.x} y:${workArea.y} w:${workArea.width} h:${workArea.height}`);
            log(`  Calculated geometry (absolute): x:${geometry.x} y:${geometry.y} w:${geometry.width} h:${geometry.height}`);
        }

        return geometry;
    }

    /**
     * Find which zone contains the given point (relative coordinates 0-1)
     */
    findZoneAtPoint(layout, x, y) {
        for (let zone of layout.zones) {
            if (x >= zone.x && x < zone.x + zone.width &&
                y >= zone.y && y < zone.y + zone.height) {
                return zone;
            }
        }
        return null;
    }

    /**
     * Reload layouts (call this when settings change)
     */
    reload() {
        this._layouts.clear();
        this._loadLayouts();
    }

    destroy() {
        this._layouts.clear();
        this._settings = null;
    }
}
