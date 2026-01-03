import { PRESET_LAYOUTS } from '../layouts/presets.js';
import {
    resolveLayout,
    resolveSimpleLayout,
    findDividerForResize,
    calculateDividerDrag
} from './layoutResolver.js';
import {
    validateLayout,
    validateSimpleLayout,
    isFullSpecLayout,
    getLeafIds
} from './layoutValidator.js';
import { OverrideStore } from './overrideStore.js';

/**
 * LayoutManager - Manages layout definitions, resolution, and overrides
 *
 * Supports both:
 * - Simple format: { id, name, zones: [{id, x, y, width, height}] }
 * - Full spec format: { schema_version: 1, name, root: {...} }
 */
export class LayoutManager {
    constructor(settings) {
        this._settings = settings;
        this._layouts = new Map();          // id -> layout object
        this._resolvedCache = new Map();    // cacheKey -> resolved rects
        this._overrideStore = new OverrideStore();

        this._loadLayouts();
    }

    _debug(message) {
        if (this._settings && this._settings.get_boolean('debug-mode')) {
            log(`SnapKit LayoutManager: ${message}`);
        }
    }

    /**
     * Load all layouts (presets + custom)
     */
    _loadLayouts() {
        // Load preset layouts
        for (const layout of PRESET_LAYOUTS) {
            if (this._validateAndAdd(layout)) {
                this._debug(`Loaded preset layout: ${this.getLayoutId(layout)}`);
            }
        }

        // Load custom layouts from settings
        this._loadCustomLayouts();
    }

    /**
     * Load custom layouts from settings
     */
    _loadCustomLayouts() {
        try {
            const customLayoutsJson = this._settings.get_string('custom-layouts');
            if (!customLayoutsJson || customLayoutsJson === '[]') return;

            const customLayouts = JSON.parse(customLayoutsJson);

            for (const layout of customLayouts) {
                if (this._validateAndAdd(layout)) {
                    this._debug(`Loaded custom layout: ${layout.name || layout.id}`);
                }
            }
        } catch (e) {
            log(`SnapKit: Error loading custom layouts: ${e.message}`);
        }
    }

    /**
     * Validate and add a layout to the map
     * @param {object} layout
     * @returns {boolean} - true if added
     */
    _validateAndAdd(layout) {
        // Determine format and validate
        if (isFullSpecLayout(layout)) {
            const result = validateLayout(layout);
            if (!result.valid) {
                log(`SnapKit: Invalid full-spec layout '${layout.name}': ${result.errors.join(', ')}`);
                return false;
            }
            // Use name as ID for full-spec layouts
            this._layouts.set(layout.name, layout);
            return true;
        } else {
            const result = validateSimpleLayout(layout);
            if (!result.valid) {
                log(`SnapKit: Invalid simple layout '${layout.id}': ${result.errors.join(', ')}`);
                return false;
            }
            this._layouts.set(layout.id, layout);
            return true;
        }
    }

    /**
     * Get all enabled layouts based on settings
     * @returns {object[]}
     */
    getEnabledLayouts() {
        const enabledIds = this._settings.get_strv('enabled-layouts');
        const enabledLayouts = [];

        for (const id of enabledIds) {
            const layout = this._layouts.get(id);
            if (layout) {
                enabledLayouts.push(layout);
            }
        }

        return enabledLayouts;
    }

    /**
     * Get a specific layout by ID
     * @param {string} id
     * @returns {object|undefined}
     */
    getLayout(id) {
        return this._layouts.get(id);
    }

    /**
     * Get all available layouts (both preset and custom)
     * @returns {object[]}
     */
    getAllLayouts() {
        return Array.from(this._layouts.values());
    }

    /**
     * Get the layout ID/name
     * @param {object} layout
     * @returns {string}
     */
    getLayoutId(layout) {
        return isFullSpecLayout(layout) ? layout.name : layout.id;
    }

    /**
     * Get all leaf/zone IDs for a layout
     * @param {object} layout
     * @returns {string[]}
     */
    getZoneIds(layout) {
        return getLeafIds(layout);
    }

    /**
     * Get zones with normalized (0-1) coordinates for display/SNAP MODE.
     * Works with both simple and full-spec layouts.
     * @param {object} layout
     * @returns {Array<{id: string, x: number, y: number, width: number, height: number}>}
     */
    getZonesForDisplay(layout) {
        if (!layout) return [];

        // Simple format - already has zones array
        if (!isFullSpecLayout(layout)) {
            return layout.zones || [];
        }

        // Full-spec format - traverse tree to extract leaf positions
        const zones = [];
        this._traverseForZones(layout.root, 0, 0, 1, 1, zones);
        return zones;
    }

    /**
     * Recursively traverse the layout tree to extract zone positions.
     * @private
     */
    _traverseForZones(node, x, y, width, height, zones) {
        if (!node) return;

        if (node.type === 'leaf') {
            zones.push({
                id: node.id,
                x: x,
                y: y,
                width: width,
                height: height
            });
            return;
        }

        if (node.type === 'split' && node.children && node.children.length > 0) {
            const isCol = node.dir === 'col';

            // Calculate sizes for children
            const childSizes = [];
            let totalFrac = 0;

            for (const child of node.children) {
                if (child.size && child.size.kind === 'frac' && child.size.value) {
                    childSizes.push({ frac: child.size.value });
                    totalFrac += child.size.value;
                } else {
                    childSizes.push({ frac: null });
                }
            }

            // Normalize fractions
            const numChildren = node.children.length;
            let normalizedSizes = [];

            if (totalFrac > 0) {
                let remainingFrac = 1.0;
                let unspecifiedCount = 0;

                for (const cs of childSizes) {
                    if (cs.frac !== null) {
                        remainingFrac -= cs.frac / totalFrac;
                    } else {
                        unspecifiedCount++;
                    }
                }

                for (const cs of childSizes) {
                    if (cs.frac !== null) {
                        normalizedSizes.push(cs.frac / totalFrac);
                    } else if (unspecifiedCount > 0) {
                        normalizedSizes.push(remainingFrac / unspecifiedCount);
                    } else {
                        normalizedSizes.push(1 / numChildren);
                    }
                }
            } else {
                for (let i = 0; i < numChildren; i++) {
                    normalizedSizes.push(1 / numChildren);
                }
            }

            // Traverse children
            let offset = 0;
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const size = normalizedSizes[i];

                let childX, childY, childW, childH;

                if (isCol) {
                    childX = x + offset * width;
                    childY = y;
                    childW = size * width;
                    childH = height;
                } else {
                    childX = x;
                    childY = y + offset * height;
                    childW = width;
                    childH = size * height;
                }
                offset += size;

                this._traverseForZones(child, childX, childY, childW, childH, zones);
            }
        }
    }

    /**
     * Resolve a layout to pixel rectangles
     *
     * @param {string|object} layoutOrId - Layout object or ID
     * @param {{x: number, y: number, width: number, height: number}} workArea
     * @param {object} monitor - Monitor object for override lookup
     * @returns {Map<string, {tileRect: object, windowRect: object}>}
     */
    resolveLayoutRects(layoutOrId, workArea, monitor = null) {
        const layout = typeof layoutOrId === 'string'
            ? this._layouts.get(layoutOrId)
            : layoutOrId;

        if (!layout) {
            this._debug(`Layout not found: ${layoutOrId}`);
            return new Map();
        }

        // Get overrides for this layout + monitor
        let overrides = [];
        if (monitor) {
            const monitorKey = OverrideStore.getMonitorKey(monitor);
            const layoutName = this.getLayoutId(layout);
            overrides = this._overrideStore.getOverrides(layoutName, monitorKey);
        }

        // Resolve based on format
        if (isFullSpecLayout(layout)) {
            return resolveLayout(layout, workArea, overrides);
        } else {
            // Simple format - use simple resolver
            return resolveSimpleLayout(layout, workArea);
        }
    }

    /**
     * Get the window rectangle for a specific zone
     *
     * @param {string|object} layoutOrId
     * @param {string} zoneId
     * @param {{x: number, y: number, width: number, height: number}} workArea
     * @param {object} monitor
     * @returns {{x: number, y: number, width: number, height: number}|null}
     */
    getZoneWindowRect(layoutOrId, zoneId, workArea, monitor = null) {
        const rects = this.resolveLayoutRects(layoutOrId, workArea, monitor);
        const zoneRects = rects.get(zoneId);
        return zoneRects?.windowRect ?? null;
    }

    /**
     * Get the tile rectangle for a specific zone
     *
     * @param {string|object} layoutOrId
     * @param {string} zoneId
     * @param {{x: number, y: number, width: number, height: number}} workArea
     * @param {object} monitor
     * @returns {{x: number, y: number, width: number, height: number}|null}
     */
    getZoneTileRect(layoutOrId, zoneId, workArea, monitor = null) {
        const rects = this.resolveLayoutRects(layoutOrId, workArea, monitor);
        const zoneRects = rects.get(zoneId);
        return zoneRects?.tileRect ?? null;
    }

    /**
     * Calculate absolute geometry for a zone (backward compatibility)
     * @deprecated Use getZoneWindowRect instead
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
     * Find which zone contains the given point
     * @param {object} layout
     * @param {number} x - Absolute x coordinate
     * @param {number} y - Absolute y coordinate
     * @param {{x: number, y: number, width: number, height: number}} workArea
     * @param {object} monitor
     * @returns {{id: string, tileRect: object, windowRect: object}|null}
     */
    findZoneAtPoint(layout, x, y, workArea, monitor = null) {
        const rects = this.resolveLayoutRects(layout, workArea, monitor);

        for (const [zoneId, zoneRects] of rects) {
            const rect = zoneRects.tileRect;
            if (x >= rect.x && x < rect.x + rect.width &&
                y >= rect.y && y < rect.y + rect.height) {
                return {
                    id: zoneId,
                    ...zoneRects
                };
            }
        }

        return null;
    }

    /**
     * Handle a window resize and update divider overrides
     *
     * @param {string} layoutId
     * @param {string} zoneId - The zone being resized
     * @param {string} edge - Which edge was dragged: 'left', 'right', 'top', 'bottom'
     * @param {number} deltaPixels - How many pixels the edge moved
     * @param {{x: number, y: number, width: number, height: number}} workArea
     * @param {object} monitor
     * @returns {boolean} - true if override was updated
     */
    handleResize(layoutId, zoneId, edge, deltaPixels, workArea, monitor) {
        this._debug(`handleResize: layoutId=${layoutId}, zoneId=${zoneId}, edge=${edge}, delta=${deltaPixels}`);

        const layout = this._layouts.get(layoutId);
        if (!layout) {
            this._debug(`Layout not found: ${layoutId}`);
            return false;
        }

        const isFullSpec = isFullSpecLayout(layout);
        this._debug(`Layout found: isFullSpec=${isFullSpec}, schema_version=${layout.schema_version}, has root=${!!layout.root}`);

        if (!isFullSpec) {
            this._debug(`Cannot handle resize for non-full-spec layout: ${layoutId}`);
            return false;
        }

        // Find which divider this resize affects
        const dividerInfo = findDividerForResize(layout, zoneId, edge);
        if (!dividerInfo) {
            this._debug(`No divider found for resize: ${zoneId} ${edge}`);
            return false;
        }

        // Calculate axis length for the split
        const isHorizontal = dividerInfo.direction === 'col';
        const axisLength = isHorizontal ? workArea.width : workArea.height;

        // Calculate new sizes
        const newSizes = calculateDividerDrag(
            layout,
            dividerInfo.splitPath,
            dividerInfo.dividerIndex,
            deltaPixels,
            axisLength
        );

        if (newSizes.length === 0) {
            this._debug('No size changes calculated');
            return false;
        }

        // Store the override
        const monitorKey = OverrideStore.getMonitorKey(monitor);
        this._overrideStore.setOverride(
            layoutId,
            monitorKey,
            dividerInfo.splitPath,
            newSizes
        );

        // Invalidate cache
        this._invalidateCache(layoutId, monitorKey);

        this._debug(`Updated override for ${layoutId} divider ${dividerInfo.dividerIndex}`);
        return true;
    }

    /**
     * Reset overrides for a layout on current monitor
     * @param {string} layoutId
     * @param {object} monitor
     */
    resetOverrides(layoutId, monitor) {
        const monitorKey = OverrideStore.getMonitorKey(monitor);
        this._overrideStore.clearOverrides(layoutId, monitorKey);
        this._invalidateCache(layoutId, monitorKey);
    }

    /**
     * Invalidate cached resolutions
     */
    _invalidateCache(layoutId, monitorKey) {
        const keyPrefix = `${layoutId}:${monitorKey}`;
        for (const key of this._resolvedCache.keys()) {
            if (key.startsWith(keyPrefix)) {
                this._resolvedCache.delete(key);
            }
        }
    }

    /**
     * Get the override store (for TileManager access)
     * @returns {OverrideStore}
     */
    getOverrideStore() {
        return this._overrideStore;
    }

    /**
     * Reload layouts (call this when settings change)
     */
    reload() {
        this._layouts.clear();
        this._resolvedCache.clear();
        this._loadLayouts();
    }

    /**
     * Add a custom layout
     * @param {object} layout
     * @returns {boolean}
     */
    addCustomLayout(layout) {
        if (!this._validateAndAdd(layout)) {
            return false;
        }

        // Save to settings
        this._saveCustomLayouts();
        return true;
    }

    /**
     * Remove a custom layout
     * @param {string} layoutId
     * @returns {boolean}
     */
    removeCustomLayout(layoutId) {
        // Don't remove presets
        if (PRESET_LAYOUTS.some(p => p.id === layoutId)) {
            return false;
        }

        if (!this._layouts.has(layoutId)) {
            return false;
        }

        this._layouts.delete(layoutId);
        this._overrideStore.clearLayoutOverrides(layoutId);
        this._saveCustomLayouts();

        return true;
    }

    /**
     * Save custom layouts to settings
     */
    _saveCustomLayouts() {
        const customLayouts = [];

        for (const [id, layout] of this._layouts) {
            // Skip presets (check both id and name for full-spec layouts)
            if (PRESET_LAYOUTS.some(p => (p.id === id) || (p.name === id))) {
                continue;
            }
            customLayouts.push(layout);
        }

        try {
            const json = JSON.stringify(customLayouts);
            this._settings.set_string('custom-layouts', json);
        } catch (e) {
            log(`SnapKit: Failed to save custom layouts: ${e.message}`);
        }
    }

    /**
     * Check if a layout is a preset
     * @param {string} layoutId
     * @returns {boolean}
     */
    isPreset(layoutId) {
        // Check both id (simple format) and name (full-spec format)
        return PRESET_LAYOUTS.some(p => (p.id === layoutId) || (p.name === layoutId));
    }

    destroy() {
        this._layouts.clear();
        this._resolvedCache.clear();

        if (this._overrideStore) {
            this._overrideStore.destroy();
            this._overrideStore = null;
        }

        this._settings = null;
    }
}
