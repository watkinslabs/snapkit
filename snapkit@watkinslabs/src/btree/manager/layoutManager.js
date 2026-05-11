/**
 * LayoutManager - Manages layouts (built-in and custom)
 *
 * Responsibilities:
 * - Register built-in layouts
 * - Manage custom layouts
 * - Layout import/export
 * - Layout retrieval by ID
 */

import { LayoutValidator } from '../validator/layoutValidator.js';
import { Logger } from '../../core/logger.js';

/**
 * Built-in layouts
 *
 * BTree layout format:
 * - Simple grid: [rows, cols]
 * - BTree split: { split: 'horizontal'|'vertical', ratio: 0.0-1.0, children: [...] }
 */
const BUILTIN_LAYOUTS = {
    // Simple grids
    'grid-1x1': {
        id: 'grid-1x1',
        name: 'Full',
        description: 'Single zone, full screen',
        layout: [1, 1],
        builtin: true
    },
    'grid-2x2': {
        id: 'grid-2x2',
        name: '2x2 Grid',
        description: 'Four equal zones in 2x2 grid',
        layout: [2, 2],
        builtin: true
    },
    'grid-3x3': {
        id: 'grid-3x3',
        name: '3x3 Grid',
        description: 'Nine zones in 3x3 grid',
        layout: [3, 3],
        builtin: true
    },

    // Windows 11 style layouts (BTree format: {tree: {direction, ratio, left, right}})
    'half-split': {
        id: 'half-split',
        name: 'Half Split',
        description: 'Two equal vertical zones (left/right)',
        layout: {
            tree: {
                direction: 'vertical',
                ratio: 0.5,
                left: { zone: 0 },
                right: { zone: 1 }
            }
        },
        builtin: true
    },
    'half-horizontal': {
        id: 'half-horizontal',
        name: 'Half Horizontal',
        description: 'Two equal horizontal zones (top/bottom)',
        layout: {
            tree: {
                direction: 'horizontal',
                ratio: 0.5,
                left: { zone: 0 },
                right: { zone: 1 }
            }
        },
        builtin: true
    },
    'quarters': {
        id: 'quarters',
        name: 'Quarters',
        description: 'Four equal zones',
        layout: {
            tree: {
                direction: 'vertical',
                ratio: 0.5,
                left: {
                    direction: 'horizontal',
                    ratio: 0.5,
                    left: { zone: 0 },
                    right: { zone: 1 }
                },
                right: {
                    direction: 'horizontal',
                    ratio: 0.5,
                    left: { zone: 2 },
                    right: { zone: 3 }
                }
            }
        },
        builtin: true
    },
    'thirds-vertical': {
        id: 'thirds-vertical',
        name: 'Thirds Vertical',
        description: 'Three equal vertical zones',
        layout: {
            tree: {
                direction: 'vertical',
                ratio: 0.333,
                left: { zone: 0 },
                right: {
                    direction: 'vertical',
                    ratio: 0.5,
                    left: { zone: 1 },
                    right: { zone: 2 }
                }
            }
        },
        builtin: true
    },
    'thirds-horizontal': {
        id: 'thirds-horizontal',
        name: 'Thirds Horizontal',
        description: 'Three equal horizontal zones',
        layout: {
            tree: {
                direction: 'horizontal',
                ratio: 0.333,
                left: { zone: 0 },
                right: {
                    direction: 'horizontal',
                    ratio: 0.5,
                    left: { zone: 1 },
                    right: { zone: 2 }
                }
            }
        },
        builtin: true
    },
    'left-focus': {
        id: 'left-focus',
        name: 'Left Focus',
        description: 'Large left zone with two stacked right zones',
        layout: {
            tree: {
                direction: 'vertical',
                ratio: 0.6,
                left: { zone: 0 },
                right: {
                    direction: 'horizontal',
                    ratio: 0.5,
                    left: { zone: 1 },
                    right: { zone: 2 }
                }
            }
        },
        builtin: true
    },
    'right-focus': {
        id: 'right-focus',
        name: 'Right Focus',
        description: 'Two stacked left zones with large right zone',
        layout: {
            tree: {
                direction: 'vertical',
                ratio: 0.4,
                left: {
                    direction: 'horizontal',
                    ratio: 0.5,
                    left: { zone: 0 },
                    right: { zone: 1 }
                },
                right: { zone: 2 }
            }
        },
        builtin: true
    },
    'top-focus': {
        id: 'top-focus',
        name: 'Top Focus',
        description: 'Large top zone with two side-by-side bottom zones',
        layout: {
            tree: {
                direction: 'horizontal',
                ratio: 0.6,
                left: { zone: 0 },
                right: {
                    direction: 'vertical',
                    ratio: 0.5,
                    left: { zone: 1 },
                    right: { zone: 2 }
                }
            }
        },
        builtin: true
    },
    'bottom-focus': {
        id: 'bottom-focus',
        name: 'Bottom Focus',
        description: 'Two side-by-side top zones with large bottom zone',
        layout: {
            tree: {
                direction: 'horizontal',
                ratio: 0.4,
                left: {
                    direction: 'vertical',
                    ratio: 0.5,
                    left: { zone: 0 },
                    right: { zone: 1 }
                },
                right: { zone: 2 }
            }
        },
        builtin: true
    },
    'center-focus': {
        id: 'center-focus',
        name: 'Center Focus',
        description: 'Large center zone with side panels',
        layout: {
            tree: {
                direction: 'vertical',
                ratio: 0.25,
                left: { zone: 0 },
                right: {
                    direction: 'vertical',
                    ratio: 0.667,
                    left: { zone: 1 },
                    right: { zone: 2 }
                }
            }
        },
        builtin: true
    },
    'triple-columns': {
        id: 'triple-columns',
        name: 'Triple Columns',
        description: 'Three equal width columns',
        layout: [1, 3],
        builtin: true
    },
    'triple-rows': {
        id: 'triple-rows',
        name: 'Triple Rows',
        description: 'Three equal height rows',
        layout: [3, 1],
        builtin: true
    }
};

export class LayoutManager {
    constructor() {
        this._layouts = new Map();
        this._validator = new LayoutValidator();
        this._logger = new Logger('LayoutManager');

        // Register built-in layouts
        this._registerBuiltinLayouts();
    }

    /**
     * Register built-in layouts
     * @private
     */
    _registerBuiltinLayouts() {
        for (const [id, layoutDef] of Object.entries(BUILTIN_LAYOUTS)) {
            this._layouts.set(id, layoutDef);
        }
        this._logger.info(`Registered ${this._layouts.size} built-in layouts`);
    }

    /**
     * Get layout by ID
     * @param {string} layoutId
     * @returns {Object|null} Layout definition
     */
    getLayout(layoutId) {
        return this._layouts.get(layoutId) || null;
    }

    /**
     * Check if layout exists
     * @param {string} layoutId
     * @returns {boolean}
     */
    hasLayout(layoutId) {
        return this._layouts.has(layoutId);
    }

    /**
     * Get all layout IDs
     * @returns {string[]}
     */
    getLayoutIds() {
        return Array.from(this._layouts.keys());
    }

    /**
     * Get all layouts
     * @returns {Array<Object>} Array of layout definitions
     */
    getAllLayouts() {
        return Array.from(this._layouts.values());
    }

    /**
     * Get built-in layouts
     * @returns {Array<Object>}
     */
    getBuiltinLayouts() {
        return this.getAllLayouts().filter(l => l.builtin);
    }

    /**
     * Get custom layouts
     * @returns {Array<Object>}
     */
    getCustomLayouts() {
        return this.getAllLayouts().filter(l => !l.builtin);
    }

    /**
     * Register a custom layout
     * @param {string} id - Unique layout ID
     * @param {Object} layoutDef - Layout definition {name, description, layout}
     * @returns {boolean} True if registered successfully
     */
    registerLayout(id, layoutDef) {
        // Check if ID already exists
        if (this._layouts.has(id)) {
            this._logger.warn(`Layout ID already exists: ${id}`);
            return false;
        }

        // Validate layout
        const validation = this._validator.validate(layoutDef.layout);
        if (!validation.isValid()) {
            this._logger.error('Invalid layout', {
                id,
                errors: validation.getErrors()
            });
            return false;
        }

        // Add layout
        this._layouts.set(id, {
            id,
            name: layoutDef.name || id,
            description: layoutDef.description || '',
            layout: layoutDef.layout,
            builtin: false
        });

        this._logger.info(`Registered custom layout: ${id}`);
        return true;
    }

    /**
     * Update a custom layout
     * @param {string} id
     * @param {Object} layoutDef
     * @returns {boolean}
     */
    updateLayout(id, layoutDef) {
        const existing = this._layouts.get(id);

        // Check if exists
        if (!existing) {
            this._logger.warn(`Layout not found: ${id}`);
            return false;
        }

        // Cannot update built-in layouts
        if (existing.builtin) {
            this._logger.warn(`Cannot update built-in layout: ${id}`);
            return false;
        }

        // Validate new layout
        const validation = this._validator.validate(layoutDef.layout);
        if (!validation.isValid()) {
            this._logger.error('Invalid layout', {
                id,
                errors: validation.getErrors()
            });
            return false;
        }

        // Update
        this._layouts.set(id, {
            id,
            name: layoutDef.name || existing.name,
            description: layoutDef.description || existing.description,
            layout: layoutDef.layout,
            builtin: false
        });

        this._logger.info(`Updated layout: ${id}`);
        return true;
    }

    /**
     * Delete a custom layout
     * @param {string} id
     * @returns {boolean}
     */
    deleteLayout(id) {
        const existing = this._layouts.get(id);

        if (!existing) {
            return false;
        }

        // Cannot delete built-in layouts
        if (existing.builtin) {
            this._logger.warn(`Cannot delete built-in layout: ${id}`);
            return false;
        }

        this._layouts.delete(id);
        this._logger.info(`Deleted layout: ${id}`);
        return true;
    }

    /**
     * Export layout to JSON
     * @param {string} id
     * @returns {string|null} JSON string
     */
    exportLayout(id) {
        const layout = this._layouts.get(id);
        if (!layout) {
            return null;
        }

        try {
            return JSON.stringify(layout, null, 2);
        } catch (e) {
            this._logger.error('Failed to export layout', { id, error: e });
            return null;
        }
    }

    /**
     * Import layout from JSON
     * @param {string} json - JSON string
     * @returns {string|null} Layout ID if successful
     */
    importLayout(json) {
        try {
            const layoutDef = JSON.parse(json);

            // Validate has required fields
            if (!layoutDef.id || !layoutDef.layout) {
                this._logger.error('Invalid layout JSON: missing id or layout');
                return null;
            }

            // Register (will validate)
            const success = this.registerLayout(layoutDef.id, layoutDef);
            return success ? layoutDef.id : null;
        } catch (e) {
            this._logger.error('Failed to import layout', { error: e });
            return null;
        }
    }

    /**
     * Export all custom layouts
     * @returns {string} JSON string
     */
    exportAllCustomLayouts() {
        const customLayouts = this.getCustomLayouts();
        try {
            return JSON.stringify(customLayouts, null, 2);
        } catch (e) {
            this._logger.error('Failed to export custom layouts', { error: e });
            return '[]';
        }
    }

    /**
     * Import multiple layouts from JSON
     * @param {string} json - JSON array string
     * @returns {number} Number of layouts imported
     */
    importMultipleLayouts(json) {
        try {
            const layouts = JSON.parse(json);
            if (!Array.isArray(layouts)) {
                this._logger.error('Invalid JSON: expected array');
                return 0;
            }

            let count = 0;
            for (const layoutDef of layouts) {
                if (this.registerLayout(layoutDef.id, layoutDef)) {
                    count++;
                }
            }

            this._logger.info(`Imported ${count} layouts`);
            return count;
        } catch (e) {
            this._logger.error('Failed to import layouts', { error: e });
            return 0;
        }
    }

    /**
     * Get layout count
     * @returns {{total: number, builtin: number, custom: number}}
     */
    getLayoutCount() {
        const all = this.getAllLayouts();
        return {
            total: all.length,
            builtin: all.filter(l => l.builtin).length,
            custom: all.filter(l => !l.builtin).length
        };
    }
}
