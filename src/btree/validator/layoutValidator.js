/**
 * LayoutValidator - Validates layout definitions
 *
 * Validates two layout formats:
 * 1. Simple format: [rows, cols] - e.g., [2, 2] for 2x2 grid
 * 2. Full-spec format: {tree: {...}, name: "...", ...}
 *
 * See docs/LAYOUT.md for complete schema
 */

import { SplitDirection } from '../tree/layoutTree.js';

/**
 * Validation result
 */
export class ValidationResult {
    constructor(valid, errors = []) {
        this.valid = valid;
        this.errors = errors;
    }

    /**
     * Add an error
     * @param {string} error
     */
    addError(error) {
        this.valid = false;
        this.errors.push(error);
    }

    /**
     * Check if valid
     * @returns {boolean}
     */
    isValid() {
        return this.valid;
    }

    /**
     * Get error messages
     * @returns {string[]}
     */
    getErrors() {
        return [...this.errors];
    }

    /**
     * Get formatted error message
     * @returns {string}
     */
    getErrorMessage() {
        return this.errors.join('; ');
    }
}

export class LayoutValidator {
    /**
     * Validate a layout definition
     * @param {*} layout - Layout definition (simple or full-spec)
     * @returns {ValidationResult}
     */
    validate(layout) {
        if (!layout) {
            return new ValidationResult(false, ['Layout is null or undefined']);
        }

        // Check if simple format
        if (Array.isArray(layout)) {
            return this.validateSimple(layout);
        }

        // Check if full-spec format
        if (typeof layout === 'object') {
            return this.validateFullSpec(layout);
        }

        return new ValidationResult(false, ['Layout must be an array or object']);
    }

    /**
     * Validate simple layout format: [rows, cols]
     * @param {Array} layout
     * @returns {ValidationResult}
     */
    validateSimple(layout) {
        const result = new ValidationResult(true);

        // Must be array of length 2
        if (!Array.isArray(layout) || layout.length !== 2) {
            result.addError('Simple layout must be [rows, cols]');
            return result;
        }

        const [rows, cols] = layout;

        // Both must be positive integers
        if (!Number.isInteger(rows) || rows < 1) {
            result.addError(`rows must be positive integer, got: ${rows}`);
        }

        if (!Number.isInteger(cols) || cols < 1) {
            result.addError(`cols must be positive integer, got: ${cols}`);
        }

        // Reasonable limits
        if (rows > 10) {
            result.addError(`rows too large (max 10), got: ${rows}`);
        }

        if (cols > 10) {
            result.addError(`cols too large (max 10), got: ${cols}`);
        }

        return result;
    }

    /**
     * Validate full-spec layout format
     * @param {Object} layout
     * @returns {ValidationResult}
     */
    validateFullSpec(layout) {
        const result = new ValidationResult(true);

        // Must have tree property
        if (!layout.tree) {
            result.addError('Full-spec layout must have "tree" property');
            return result;
        }

        // Validate tree structure
        this._validateTree(layout.tree, result, 'tree');

        // Optional: validate name
        if (layout.name !== undefined && typeof layout.name !== 'string') {
            result.addError('Layout name must be a string');
        }

        // Optional: validate description
        if (layout.description !== undefined && typeof layout.description !== 'string') {
            result.addError('Layout description must be a string');
        }

        return result;
    }

    /**
     * Validate tree structure recursively
     * @private
     * @param {Object} node - Tree node
     * @param {ValidationResult} result
     * @param {string} path - Path for error messages
     */
    _validateTree(node, result, path) {
        if (!node) {
            result.addError(`${path}: node is null or undefined`);
            return;
        }

        if (typeof node !== 'object') {
            result.addError(`${path}: node must be an object`);
            return;
        }

        // Check if leaf node (has zone property)
        if (node.zone !== undefined) {
            this._validateLeafNode(node, result, path);
            return;
        }

        // Otherwise, must be branch node
        this._validateBranchNode(node, result, path);
    }

    /**
     * Validate leaf node
     * @private
     * @param {Object} node
     * @param {ValidationResult} result
     * @param {string} path
     */
    _validateLeafNode(node, result, path) {
        // Must have zone property
        if (!Number.isInteger(node.zone) || node.zone < 0) {
            result.addError(`${path}: zone must be non-negative integer, got: ${node.zone}`);
        }

        // Should not have children
        if (node.left !== undefined || node.right !== undefined) {
            result.addError(`${path}: leaf node should not have left/right children`);
        }
    }

    /**
     * Validate branch node
     * @private
     * @param {Object} node
     * @param {ValidationResult} result
     * @param {string} path
     */
    _validateBranchNode(node, result, path) {
        // Must have direction
        if (!node.direction) {
            result.addError(`${path}: branch node must have "direction"`);
        } else if (node.direction !== SplitDirection.HORIZONTAL &&
                   node.direction !== SplitDirection.VERTICAL) {
            result.addError(
                `${path}: direction must be "${SplitDirection.HORIZONTAL}" or "${SplitDirection.VERTICAL}", ` +
                `got: ${node.direction}`
            );
        }

        // Must have ratio
        if (node.ratio === undefined) {
            result.addError(`${path}: branch node must have "ratio"`);
        } else if (typeof node.ratio !== 'number' || node.ratio <= 0 || node.ratio >= 1) {
            result.addError(`${path}: ratio must be between 0 and 1 (exclusive), got: ${node.ratio}`);
        }

        // Must have left and right children
        if (!node.left) {
            result.addError(`${path}: branch node must have "left" child`);
        } else {
            this._validateTree(node.left, result, `${path}.left`);
        }

        if (!node.right) {
            result.addError(`${path}: branch node must have "right" child`);
        } else {
            this._validateTree(node.right, result, `${path}.right`);
        }
    }

    /**
     * Check if layout is simple format
     * @param {*} layout
     * @returns {boolean}
     */
    isSimpleLayout(layout) {
        return Array.isArray(layout) && layout.length === 2;
    }

    /**
     * Check if layout is full-spec format
     * @param {*} layout
     * @returns {boolean}
     */
    isFullSpecLayout(layout) {
        return typeof layout === 'object' && !Array.isArray(layout) && layout.tree !== undefined;
    }
}
