/**
 * Layout Validator - Validates layout JSON against LAYOUT.md spec
 *
 * Implements Section 11 validation rules.
 */

/**
 * Validate a layout object
 * @param {object} layout
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateLayout(layout) {
    const errors = [];

    // Check required fields
    if (!layout) {
        return { valid: false, errors: ['Layout is null or undefined'] };
    }

    // schema_version
    if (layout.schema_version !== 1) {
        errors.push(`Invalid or missing schema_version: expected 1, got ${layout.schema_version}`);
    }

    // name
    if (!layout.name || typeof layout.name !== 'string' || layout.name.trim() === '') {
        errors.push('Layout name is required and must be a non-empty string');
    }

    // root node
    if (!layout.root) {
        errors.push('Layout root node is required');
        return { valid: false, errors };
    }

    // Validate defaults if present
    if (layout.defaults) {
        validateDefaults(layout.defaults, errors);
    }

    // Validate root node and collect leaf IDs
    const leafIds = new Set();
    validateNode(layout.root, [], leafIds, errors);

    // Check for at least one leaf
    if (leafIds.size === 0) {
        errors.push('Layout must have at least one leaf node');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate layout defaults
 * @param {object} defaults
 * @param {string[]} errors
 */
function validateDefaults(defaults, errors) {
    if (defaults.gap_inner !== undefined) {
        if (typeof defaults.gap_inner !== 'number' || defaults.gap_inner < 0) {
            errors.push('defaults.gap_inner must be a non-negative number');
        }
    }

    if (defaults.gap_outer !== undefined) {
        validateInsets(defaults.gap_outer, 'defaults.gap_outer', errors);
    }

    if (defaults.leaf_insets !== undefined) {
        validateInsets(defaults.leaf_insets, 'defaults.leaf_insets', errors);
    }

    if (defaults.aspect_policy !== undefined) {
        if (!['fit', 'none'].includes(defaults.aspect_policy)) {
            errors.push(`defaults.aspect_policy must be 'fit' or 'none', got '${defaults.aspect_policy}'`);
        }
    }
}

/**
 * Validate insets value
 * @param {number|object} insets
 * @param {string} path
 * @param {string[]} errors
 */
function validateInsets(insets, path, errors) {
    if (typeof insets === 'number') {
        if (insets < 0) {
            errors.push(`${path} must be non-negative, got ${insets}`);
        }
    } else if (typeof insets === 'object' && insets !== null) {
        for (const key of ['l', 'r', 't', 'b']) {
            if (insets[key] !== undefined) {
                if (typeof insets[key] !== 'number' || insets[key] < 0) {
                    errors.push(`${path}.${key} must be a non-negative number`);
                }
            }
        }
    } else {
        errors.push(`${path} must be a number or {l, r, t, b} object`);
    }
}

/**
 * Validate a node recursively
 * @param {object} node
 * @param {number[]} path - Current path for error messages
 * @param {Set<string>} leafIds - Collected leaf IDs (mutated)
 * @param {string[]} errors
 */
function validateNode(node, path, leafIds, errors) {
    const pathStr = path.length > 0 ? `root.${path.join('.')}` : 'root';

    if (!node || typeof node !== 'object') {
        errors.push(`${pathStr}: Node must be an object`);
        return;
    }

    if (node.type === 'leaf') {
        validateLeaf(node, pathStr, leafIds, errors);
    } else if (node.type === 'split') {
        validateSplit(node, pathStr, path, leafIds, errors);
    } else {
        errors.push(`${pathStr}: Invalid node type '${node.type}', must be 'leaf' or 'split'`);
    }
}

/**
 * Validate a leaf node
 * @param {object} node
 * @param {string} pathStr
 * @param {Set<string>} leafIds
 * @param {string[]} errors
 */
function validateLeaf(node, pathStr, leafIds, errors) {
    // id is required and must be unique
    if (!node.id || typeof node.id !== 'string' || node.id.trim() === '') {
        errors.push(`${pathStr}: Leaf node requires a non-empty string 'id'`);
    } else if (leafIds.has(node.id)) {
        errors.push(`${pathStr}: Duplicate leaf id '${node.id}'`);
    } else {
        leafIds.add(node.id);
    }

    // size spec (optional)
    if (node.size !== undefined) {
        validateSizeSpec(node.size, `${pathStr}.size`, errors);
    }

    // insets (optional)
    if (node.insets !== undefined) {
        validateInsets(node.insets, `${pathStr}.insets`, errors);
    }

    // aspect (optional)
    if (node.aspect !== undefined) {
        validateAspect(node.aspect, `${pathStr}.aspect`, errors);
    }

    // tags (optional)
    if (node.tags !== undefined) {
        if (!Array.isArray(node.tags)) {
            errors.push(`${pathStr}.tags must be an array`);
        } else {
            for (let i = 0; i < node.tags.length; i++) {
                if (typeof node.tags[i] !== 'string') {
                    errors.push(`${pathStr}.tags[${i}] must be a string`);
                }
            }
        }
    }
}

/**
 * Validate a split node
 * @param {object} node
 * @param {string} pathStr
 * @param {number[]} path
 * @param {Set<string>} leafIds
 * @param {string[]} errors
 */
function validateSplit(node, pathStr, path, leafIds, errors) {
    // dir is required
    if (!['row', 'col'].includes(node.dir)) {
        errors.push(`${pathStr}: Split node requires dir 'row' or 'col', got '${node.dir}'`);
    }

    // children is required and must have at least 2
    if (!Array.isArray(node.children)) {
        errors.push(`${pathStr}: Split node requires children array`);
        return;
    }

    if (node.children.length < 2) {
        errors.push(`${pathStr}: Split node must have at least 2 children, got ${node.children.length}`);
    }

    // gap_inner (optional)
    if (node.gap_inner !== undefined) {
        if (typeof node.gap_inner !== 'number' || node.gap_inner < 0) {
            errors.push(`${pathStr}.gap_inner must be a non-negative number`);
        }
    }

    // gap_outer (optional)
    if (node.gap_outer !== undefined) {
        validateInsets(node.gap_outer, `${pathStr}.gap_outer`, errors);
    }

    // Validate children
    for (let i = 0; i < node.children.length; i++) {
        validateNode(node.children[i], [...path, `children[${i}]`], leafIds, errors);
    }
}

/**
 * Validate a size spec
 * @param {object} spec
 * @param {string} pathStr
 * @param {string[]} errors
 */
function validateSizeSpec(spec, pathStr, errors) {
    if (typeof spec !== 'object' || spec === null) {
        errors.push(`${pathStr} must be an object`);
        return;
    }

    const validKinds = ['frac', 'px', 'auto'];
    if (!validKinds.includes(spec.kind)) {
        errors.push(`${pathStr}.kind must be one of ${validKinds.join(', ')}, got '${spec.kind}'`);
    }

    // value required for frac and px
    if (spec.kind === 'frac' || spec.kind === 'px') {
        if (typeof spec.value !== 'number' || spec.value <= 0) {
            errors.push(`${pathStr}.value must be a positive number for kind '${spec.kind}'`);
        }
    }

    // min_px and max_px (optional)
    if (spec.min_px !== undefined) {
        if (typeof spec.min_px !== 'number' || spec.min_px < 0) {
            errors.push(`${pathStr}.min_px must be a non-negative number`);
        }
    }

    if (spec.max_px !== undefined) {
        if (typeof spec.max_px !== 'number' || spec.max_px < 0) {
            errors.push(`${pathStr}.max_px must be a non-negative number`);
        }
    }

    // min_px <= max_px
    if (spec.min_px !== undefined && spec.max_px !== undefined) {
        if (spec.min_px > spec.max_px) {
            errors.push(`${pathStr}: min_px (${spec.min_px}) must be <= max_px (${spec.max_px})`);
        }
    }

    // priority (optional)
    if (spec.priority !== undefined) {
        if (typeof spec.priority !== 'number' || !Number.isInteger(spec.priority)) {
            errors.push(`${pathStr}.priority must be an integer`);
        }
    }
}

/**
 * Validate an aspect spec
 * @param {object} aspect
 * @param {string} pathStr
 * @param {string[]} errors
 */
function validateAspect(aspect, pathStr, errors) {
    if (typeof aspect !== 'object' || aspect === null) {
        errors.push(`${pathStr} must be an object`);
        return;
    }

    // ratio
    if (aspect.ratio !== undefined) {
        if (typeof aspect.ratio !== 'number' || aspect.ratio <= 0) {
            errors.push(`${pathStr}.ratio must be a positive number`);
        }
    }

    // policy
    if (aspect.policy !== undefined) {
        if (!['fit', 'none'].includes(aspect.policy)) {
            errors.push(`${pathStr}.policy must be 'fit' or 'none', got '${aspect.policy}'`);
        }
    }
}

/**
 * Validate a simple layout (backward compatibility format)
 * @param {object} layout - {id, name, zones: [{id, x, y, width, height}]}
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateSimpleLayout(layout) {
    const errors = [];

    if (!layout) {
        return { valid: false, errors: ['Layout is null or undefined'] };
    }

    if (!layout.id || typeof layout.id !== 'string') {
        errors.push('Layout id is required and must be a string');
    }

    if (!layout.name || typeof layout.name !== 'string') {
        errors.push('Layout name is required and must be a string');
    }

    if (!Array.isArray(layout.zones) || layout.zones.length === 0) {
        errors.push('Layout must have at least one zone');
        return { valid: errors.length === 0, errors };
    }

    const zoneIds = new Set();

    for (let i = 0; i < layout.zones.length; i++) {
        const zone = layout.zones[i];
        const zPath = `zones[${i}]`;

        if (!zone.id || typeof zone.id !== 'string') {
            errors.push(`${zPath}: Zone id is required`);
        } else if (zoneIds.has(zone.id)) {
            errors.push(`${zPath}: Duplicate zone id '${zone.id}'`);
        } else {
            zoneIds.add(zone.id);
        }

        // Validate coordinates
        for (const prop of ['x', 'y', 'width', 'height']) {
            if (typeof zone[prop] !== 'number') {
                errors.push(`${zPath}.${prop} must be a number`);
            }
        }

        // Validate ranges
        if (typeof zone.x === 'number' && (zone.x < 0 || zone.x > 1)) {
            errors.push(`${zPath}.x must be between 0 and 1`);
        }
        if (typeof zone.y === 'number' && (zone.y < 0 || zone.y > 1)) {
            errors.push(`${zPath}.y must be between 0 and 1`);
        }
        if (typeof zone.width === 'number' && (zone.width <= 0 || zone.width > 1)) {
            errors.push(`${zPath}.width must be between 0 (exclusive) and 1`);
        }
        if (typeof zone.height === 'number' && (zone.height <= 0 || zone.height > 1)) {
            errors.push(`${zPath}.height must be between 0 (exclusive) and 1`);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Check if a layout is in simple format or full spec format
 * @param {object} layout
 * @returns {boolean} - true if full spec, false if simple
 */
export function isFullSpecLayout(layout) {
    return layout && layout.schema_version === 1 && layout.root !== undefined;
}

/**
 * Get all leaf IDs from a layout
 * @param {object} layout
 * @returns {string[]}
 */
export function getLeafIds(layout) {
    if (isFullSpecLayout(layout)) {
        const ids = [];
        collectLeafIds(layout.root, ids);
        return ids;
    } else if (layout.zones) {
        return layout.zones.map(z => z.id);
    }
    return [];
}

/**
 * Recursively collect leaf IDs
 * @param {object} node
 * @param {string[]} ids
 */
function collectLeafIds(node, ids) {
    if (node.type === 'leaf') {
        ids.push(node.id);
    } else if (node.type === 'split' && node.children) {
        for (const child of node.children) {
            collectLeafIds(child, ids);
        }
    }
}
