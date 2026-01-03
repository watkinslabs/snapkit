/**
 * Layout Editor State Management
 *
 * Manages the state of the layout being edited, including:
 * - Current layout JSON object
 * - Selected node path
 * - Dirty flag (unsaved changes)
 * - Validation errors
 *
 * All operations are immutable - they return new layout objects.
 */

import { validateLayout } from './layoutValidator.js';
import { getLeafIds } from './layoutValidator.js';

/**
 * Create a default empty layout
 * @param {string} name - Layout name
 * @returns {object}
 */
export function createEmptyLayout(name = 'New Layout') {
    return {
        schema_version: 1,
        name: name,
        defaults: {
            gap_inner: 0,
            gap_outer: 0,
            leaf_insets: 0
        },
        root: {
            type: 'leaf',
            id: 'main'
        }
    };
}

/**
 * Create a layout from a template
 * @param {string} template - Template name
 * @param {string} name - Layout name
 * @returns {object}
 */
export function createFromTemplate(template, name = 'New Layout') {
    switch (template) {
        case 'two-columns':
            return {
                schema_version: 1,
                name: name,
                defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
                root: {
                    type: 'split',
                    dir: 'col',
                    children: [
                        { type: 'leaf', id: 'left', size: { kind: 'frac', value: 1 } },
                        { type: 'leaf', id: 'right', size: { kind: 'frac', value: 1 } }
                    ]
                }
            };

        case 'three-columns':
            return {
                schema_version: 1,
                name: name,
                defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
                root: {
                    type: 'split',
                    dir: 'col',
                    children: [
                        { type: 'leaf', id: 'left', size: { kind: 'frac', value: 1 } },
                        { type: 'leaf', id: 'center', size: { kind: 'frac', value: 1 } },
                        { type: 'leaf', id: 'right', size: { kind: 'frac', value: 1 } }
                    ]
                }
            };

        case 'two-rows':
            return {
                schema_version: 1,
                name: name,
                defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
                root: {
                    type: 'split',
                    dir: 'row',
                    children: [
                        { type: 'leaf', id: 'top', size: { kind: 'frac', value: 1 } },
                        { type: 'leaf', id: 'bottom', size: { kind: 'frac', value: 1 } }
                    ]
                }
            };

        case 'grid-2x2':
            return {
                schema_version: 1,
                name: name,
                defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
                root: {
                    type: 'split',
                    dir: 'col',
                    children: [
                        {
                            type: 'split',
                            dir: 'row',
                            children: [
                                { type: 'leaf', id: 'top-left', size: { kind: 'frac', value: 1 } },
                                { type: 'leaf', id: 'bottom-left', size: { kind: 'frac', value: 1 } }
                            ]
                        },
                        {
                            type: 'split',
                            dir: 'row',
                            children: [
                                { type: 'leaf', id: 'top-right', size: { kind: 'frac', value: 1 } },
                                { type: 'leaf', id: 'bottom-right', size: { kind: 'frac', value: 1 } }
                            ]
                        }
                    ]
                }
            };

        case 'main-sidebar':
            return {
                schema_version: 1,
                name: name,
                defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
                root: {
                    type: 'split',
                    dir: 'col',
                    children: [
                        { type: 'leaf', id: 'main', size: { kind: 'frac', value: 2 } },
                        { type: 'leaf', id: 'sidebar', size: { kind: 'frac', value: 1 } }
                    ]
                }
            };

        default:
            return createEmptyLayout(name);
    }
}

/**
 * Deep clone a layout object
 * @param {object} layout
 * @returns {object}
 */
export function cloneLayout(layout) {
    return JSON.parse(JSON.stringify(layout));
}

/**
 * Get a node at the specified path
 * @param {object} layout
 * @param {number[]} path - Array of child indices
 * @returns {object|null}
 */
export function getNodeAtPath(layout, path) {
    let node = layout.root;
    for (const index of path) {
        if (node.type !== 'split' || !node.children[index]) {
            return null;
        }
        node = node.children[index];
    }
    return node;
}

/**
 * Update a node at the specified path (immutable)
 * @param {object} layout
 * @param {number[]} path
 * @param {object} updates - Properties to merge
 * @returns {object} - New layout object
 */
export function updateNodeAtPath(layout, path, updates) {
    const newLayout = cloneLayout(layout);

    if (path.length === 0) {
        // Updating root
        Object.assign(newLayout.root, updates);
        return newLayout;
    }

    // Navigate to parent
    let parent = newLayout.root;
    for (let i = 0; i < path.length - 1; i++) {
        parent = parent.children[path[i]];
    }

    // Update the target node
    const lastIndex = path[path.length - 1];
    Object.assign(parent.children[lastIndex], updates);

    return newLayout;
}

/**
 * Split a leaf node into two children
 * @param {object} layout
 * @param {number[]} path - Path to the leaf to split
 * @param {string} direction - 'row' or 'col'
 * @returns {object} - New layout object
 */
export function splitNode(layout, path, direction) {
    const newLayout = cloneLayout(layout);
    const node = getNodeAtPath(newLayout, path);

    if (!node || node.type !== 'leaf') {
        return layout; // Can only split leaves
    }

    // Generate unique IDs for new children
    const existingIds = new Set(getLeafIds(newLayout));
    const baseId = node.id;
    let id1 = direction === 'col' ? `${baseId}-left` : `${baseId}-top`;
    let id2 = direction === 'col' ? `${baseId}-right` : `${baseId}-bottom`;

    // Ensure uniqueness
    let counter = 1;
    while (existingIds.has(id1)) {
        id1 = `${baseId}-${counter++}`;
    }
    existingIds.add(id1);
    while (existingIds.has(id2)) {
        id2 = `${baseId}-${counter++}`;
    }

    // Create the new split node
    const newSplit = {
        type: 'split',
        dir: direction,
        children: [
            { type: 'leaf', id: id1, size: { kind: 'frac', value: 1 } },
            { type: 'leaf', id: id2, size: { kind: 'frac', value: 1 } }
        ]
    };

    // Preserve the size spec if it exists
    if (node.size) {
        newSplit.size = node.size;
    }

    // Replace the node
    if (path.length === 0) {
        newLayout.root = newSplit;
    } else {
        let parent = newLayout.root;
        for (let i = 0; i < path.length - 1; i++) {
            parent = parent.children[path[i]];
        }
        parent.children[path[path.length - 1]] = newSplit;
    }

    return newLayout;
}

/**
 * Delete a node (merge with sibling)
 * @param {object} layout
 * @param {number[]} path - Path to the node to delete
 * @returns {object} - New layout object
 */
export function deleteNode(layout, path) {
    if (path.length === 0) {
        // Cannot delete root
        return layout;
    }

    const newLayout = cloneLayout(layout);

    // Navigate to parent
    let parent = newLayout.root;
    let grandparent = null;
    let parentIndex = -1;

    for (let i = 0; i < path.length - 1; i++) {
        grandparent = parent;
        parentIndex = path[i];
        parent = parent.children[path[i]];
    }

    if (parent.type !== 'split') {
        return layout;
    }

    const deleteIndex = path[path.length - 1];

    // Remove the child
    parent.children.splice(deleteIndex, 1);

    // If only one child left, replace parent with that child
    if (parent.children.length === 1) {
        const remainingChild = parent.children[0];

        // Preserve parent's size if it had one
        if (parent.size && !remainingChild.size) {
            remainingChild.size = parent.size;
        }

        if (grandparent) {
            grandparent.children[parentIndex] = remainingChild;
        } else {
            newLayout.root = remainingChild;
        }
    }

    return newLayout;
}

/**
 * Add a sibling node next to the selected node
 * @param {object} layout
 * @param {number[]} path - Path to the node to add sibling to
 * @param {boolean} after - Add after (true) or before (false)
 * @returns {object} - New layout object
 */
export function addSibling(layout, path, after = true) {
    if (path.length === 0) {
        // Cannot add sibling to root - need to split it first
        return layout;
    }

    const newLayout = cloneLayout(layout);

    // Navigate to parent
    let parent = newLayout.root;
    for (let i = 0; i < path.length - 1; i++) {
        parent = parent.children[path[i]];
    }

    if (parent.type !== 'split') {
        return layout;
    }

    // Generate unique ID
    const existingIds = new Set(getLeafIds(newLayout));
    let newId = 'zone';
    let counter = 1;
    while (existingIds.has(newId)) {
        newId = `zone-${counter++}`;
    }

    // Create new leaf
    const newLeaf = {
        type: 'leaf',
        id: newId,
        size: { kind: 'frac', value: 1 }
    };

    // Insert at position
    const insertIndex = path[path.length - 1] + (after ? 1 : 0);
    parent.children.splice(insertIndex, 0, newLeaf);

    return newLayout;
}

/**
 * Rename a leaf node
 * @param {object} layout
 * @param {number[]} path
 * @param {string} newId
 * @returns {object}
 */
export function renameLeaf(layout, path, newId) {
    const node = getNodeAtPath(layout, path);
    if (!node || node.type !== 'leaf') {
        return layout;
    }

    // Check uniqueness
    const existingIds = new Set(getLeafIds(layout));
    existingIds.delete(node.id);
    if (existingIds.has(newId)) {
        return layout; // ID already exists
    }

    return updateNodeAtPath(layout, path, { id: newId });
}

/**
 * Update layout defaults
 * @param {object} layout
 * @param {object} defaults
 * @returns {object}
 */
export function updateDefaults(layout, defaults) {
    const newLayout = cloneLayout(layout);
    newLayout.defaults = { ...newLayout.defaults, ...defaults };
    return newLayout;
}

/**
 * Update layout name
 * @param {object} layout
 * @param {string} name
 * @returns {object}
 */
export function updateLayoutName(layout, name) {
    const newLayout = cloneLayout(layout);
    newLayout.name = name;
    return newLayout;
}

/**
 * Validate a layout and return errors
 * @param {object} layout
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validate(layout) {
    return validateLayout(layout);
}

/**
 * Get a summary of the layout for display
 * @param {object} layout
 * @returns {{name: string, zoneCount: number}}
 */
export function getLayoutSummary(layout) {
    const leafIds = getLeafIds(layout);
    return {
        name: layout.name || 'Unnamed',
        zoneCount: leafIds.length
    };
}
