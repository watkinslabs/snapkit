/**
 * LayoutResolver - THE CORE ALGORITHM
 *
 * Converts BTree layout definitions into zone rectangles.
 * This is the heart of SnapKit - everything depends on this.
 *
 * Process:
 * 1. Parse layout (simple or full-spec)
 * 2. Build/get layout tree
 * 3. Traverse tree, calculating rectangles
 * 4. Apply divider overrides
 * 5. Apply margins and padding
 * 6. Return array of zone rectangles
 *
 * Performance:
 * - Aggressive caching (cache key = layout_id + monitor_id + overrides hash)
 * - Target: <5ms resolution time
 */

import { LayoutTree, SplitDirection } from '../tree/layoutTree.js';
import { LayoutValidator } from '../validator/layoutValidator.js';
import { Logger } from '../../core/logger.js';

/**
 * Zone rectangle
 * @typedef {Object} ZoneRect
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 * @property {number} width - Width
 * @property {number} height - Height
 * @property {number} zoneIndex - Zone index
 */

/**
 * Resolution options
 * @typedef {Object} ResolveOptions
 * @property {number} margin - Margin around entire layout (px)
 * @property {number} padding - Padding between zones (px)
 * @property {Array} overrides - Divider overrides [{path, ratio}]
 * @property {boolean} useCache - Whether to use cache (default: true)
 */

export class LayoutResolver {
    constructor() {
        this._cache = new Map();
        this._validator = new LayoutValidator();
        this._logger = new Logger('LayoutResolver');
        this._cacheHits = 0;
        this._cacheMisses = 0;
    }

    /**
     * Resolve layout to zone rectangles
     * THIS IS THE CORE ALGORITHM
     *
     * @param {*} layout - Layout definition (simple [rows, cols] or full-spec)
     * @param {Object} workArea - {x, y, width, height} screen work area
     * @param {ResolveOptions} options - Resolution options
     * @returns {ZoneRect[]} Array of zone rectangles
     */
    resolve(layout, workArea, options = {}) {
        // Default options
        const opts = {
            margin: options.margin ?? 0,
            padding: options.padding ?? 0,
            overrides: options.overrides ?? [],
            useCache: options.useCache !== false
        };

        // Generate cache key
        const cacheKey = this._getCacheKey(layout, workArea, opts);

        // Check cache
        if (opts.useCache && this._cache.has(cacheKey)) {
            this._cacheHits++;
            return this._cache.get(cacheKey);
        }

        this._cacheMisses++;

        // Validate layout
        const validation = this._validator.validate(layout);
        if (!validation.isValid()) {
            throw new Error(`Invalid layout: ${validation.getErrorMessage()}`);
        }

        // Build or get layout tree
        const tree = this._getLayoutTree(layout);

        // Apply overrides to tree
        this._applyOverrides(tree, opts.overrides);

        // Calculate available space (subtract margin)
        const availableArea = {
            x: workArea.x + opts.margin,
            y: workArea.y + opts.margin,
            width: workArea.width - (opts.margin * 2),
            height: workArea.height - (opts.margin * 2)
        };

        // Resolve tree to rectangles
        const zones = this._resolveTree(tree, availableArea, opts.padding);

        // Cache result
        if (opts.useCache) {
            this._cache.set(cacheKey, zones);
        }

        return zones;
    }

    /**
     * Get or build layout tree
     * @private
     * @param {*} layout
     * @returns {LayoutTree}
     */
    _getLayoutTree(layout) {
        // Simple format: [rows, cols]
        if (this._validator.isSimpleLayout(layout)) {
            const [rows, cols] = layout;
            return LayoutTree.createGrid(rows, cols);
        }

        // Full-spec format: {tree: {...}}
        if (this._validator.isFullSpecLayout(layout)) {
            return LayoutTree.fromDefinition(layout);
        }

        throw new Error('Unknown layout format');
    }

    /**
     * Apply divider overrides to tree
     * @private
     * @param {LayoutTree} tree
     * @param {Array} overrides - [{path, ratio}]
     */
    _applyOverrides(tree, overrides) {
        for (const override of overrides) {
            tree.updateSplitRatio(override.path, override.ratio);
        }
    }

    /**
     * Resolve tree to zone rectangles
     * THE CORE RECURSIVE ALGORITHM
     *
     * @private
     * @param {LayoutTree} tree
     * @param {Object} area - {x, y, width, height}
     * @param {number} padding
     * @returns {ZoneRect[]}
     */
    _resolveTree(tree, area, padding) {
        const zones = [];
        this._resolveNode(tree.root, area, padding, zones);

        // Sort by zone index
        zones.sort((a, b) => a.zoneIndex - b.zoneIndex);

        return zones;
    }

    /**
     * Resolve a single node recursively
     * @private
     * @param {TreeNode} node
     * @param {Object} area - {x, y, width, height}
     * @param {number} padding
     * @param {ZoneRect[]} zones - Output array
     */
    _resolveNode(node, area, padding, zones) {
        if (node.isLeaf()) {
            // Leaf node - create zone rectangle
            zones.push({
                x: Math.round(area.x),
                y: Math.round(area.y),
                width: Math.round(area.width),
                height: Math.round(area.height),
                zoneIndex: node.zoneIndex
            });
            return;
        }

        // Branch node - split area and recurse
        const { leftArea, rightArea } = this._splitArea(area, node.direction, node.ratio, padding);

        this._resolveNode(node.left, leftArea, padding, zones);
        this._resolveNode(node.right, rightArea, padding, zones);
    }

    /**
     * Split an area based on direction and ratio
     * @private
     * @param {Object} area - {x, y, width, height}
     * @param {string} direction - horizontal or vertical
     * @param {number} ratio - Split ratio (0-1)
     * @param {number} padding - Padding between zones
     * @returns {{leftArea: Object, rightArea: Object}}
     */
    _splitArea(area, direction, ratio, padding) {
        const halfPadding = padding / 2;

        if (direction === SplitDirection.HORIZONTAL) {
            // Horizontal split (top/bottom)
            const splitY = area.y + (area.height * ratio);

            return {
                leftArea: {
                    x: area.x,
                    y: area.y,
                    width: area.width,
                    height: (splitY - area.y) - halfPadding
                },
                rightArea: {
                    x: area.x,
                    y: splitY + halfPadding,
                    width: area.width,
                    height: (area.y + area.height) - (splitY + halfPadding)
                }
            };
        } else {
            // Vertical split (left/right)
            const splitX = area.x + (area.width * ratio);

            return {
                leftArea: {
                    x: area.x,
                    y: area.y,
                    width: (splitX - area.x) - halfPadding,
                    height: area.height
                },
                rightArea: {
                    x: splitX + halfPadding,
                    y: area.y,
                    width: (area.x + area.width) - (splitX + halfPadding),
                    height: area.height
                }
            };
        }
    }

    /**
     * Generate cache key
     * @private
     * @param {*} layout
     * @param {Object} workArea
     * @param {ResolveOptions} options
     * @returns {string}
     */
    _getCacheKey(layout, workArea, options) {
        const layoutKey = this._getLayoutKey(layout);
        const workAreaKey = `${workArea.x},${workArea.y},${workArea.width},${workArea.height}`;
        const optsKey = `${options.margin},${options.padding}`;
        const overridesKey = this._getOverridesKey(options.overrides);

        return `${layoutKey}|${workAreaKey}|${optsKey}|${overridesKey}`;
    }

    /**
     * Get layout key for caching
     * @private
     * @param {*} layout
     * @returns {string}
     */
    _getLayoutKey(layout) {
        if (this._validator.isSimpleLayout(layout)) {
            return `simple:${layout[0]}x${layout[1]}`;
        }

        // For full-spec, use JSON (could be optimized)
        try {
            return `full:${JSON.stringify(layout.tree)}`;
        } catch (e) {
            return `full:${Date.now()}`;
        }
    }

    /**
     * Get overrides key for caching
     * @private
     * @param {Array} overrides
     * @returns {string}
     */
    _getOverridesKey(overrides) {
        if (!overrides || overrides.length === 0) {
            return 'none';
        }

        return overrides
            .map(o => `${o.path}:${o.ratio.toFixed(3)}`)
            .sort()
            .join(',');
    }

    /**
     * Invalidate cache
     * @param {string} cacheKey - Specific key to invalidate, or null for all
     */
    invalidateCache(cacheKey = null) {
        if (cacheKey) {
            this._cache.delete(cacheKey);
            this._logger.debug('Cache invalidated', { cacheKey });
        } else {
            this._cache.clear();
            this._logger.debug('All cache invalidated');
        }
    }

    /**
     * Get cache statistics
     * @returns {{size: number, hits: number, misses: number, hitRate: number}}
     */
    getCacheStats() {
        const total = this._cacheHits + this._cacheMisses;
        return {
            size: this._cache.size,
            hits: this._cacheHits,
            misses: this._cacheMisses,
            hitRate: total > 0 ? (this._cacheHits / total) : 0
        };
    }

    /**
     * Clear cache statistics
     */
    clearCacheStats() {
        this._cacheHits = 0;
        this._cacheMisses = 0;
    }
}
