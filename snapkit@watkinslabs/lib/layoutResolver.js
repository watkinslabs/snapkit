/**
 * Layout Resolver - Implements LAYOUT.md Section 6
 *
 * Resolves a hierarchical layout tree into pixel rectangles.
 * This is the core algorithm that converts layout definitions
 * into actual window positions.
 */

/**
 * Normalize insets to {l, r, t, b} format
 * @param {number|object} insets - Integer or {l, r, t, b} object
 * @returns {{l: number, r: number, t: number, b: number}}
 */
function normalizeInsets(insets) {
    if (typeof insets === 'number') {
        return { l: insets, r: insets, t: insets, b: insets };
    }
    return {
        l: insets?.l ?? 0,
        r: insets?.r ?? 0,
        t: insets?.t ?? 0,
        b: insets?.b ?? 0
    };
}

/**
 * Apply insets to a rectangle (shrink it)
 * @param {{x: number, y: number, w: number, h: number}} rect
 * @param {{l: number, r: number, t: number, b: number}} insets
 * @returns {{x: number, y: number, w: number, h: number}}
 */
function applyInsets(rect, insets) {
    return {
        x: rect.x + insets.l,
        y: rect.y + insets.t,
        w: Math.max(0, rect.w - insets.l - insets.r),
        h: Math.max(0, rect.h - insets.t - insets.b)
    };
}

/**
 * Get the default size spec for a node
 * @returns {{kind: string, value: number}}
 */
function defaultSizeSpec() {
    return { kind: 'frac', value: 1 };
}

/**
 * Get size spec from a node, with defaults
 * @param {object} node
 * @returns {object}
 */
function getSizeSpec(node) {
    if (!node.size) return defaultSizeSpec();

    const spec = { ...node.size };
    if (spec.kind === 'auto') {
        spec.kind = 'frac';
        spec.value = 1;
    }
    return spec;
}

/**
 * Resolve a layout to pixel rectangles
 *
 * @param {object} layout - The layout definition (full spec with schema_version, name, root)
 * @param {{x: number, y: number, width: number, height: number}} workArea - Monitor work area
 * @param {object[]} overrides - Array of override objects (optional)
 * @returns {Map<string, {tileRect: object, windowRect: object}>} - Map of leafId to rects
 */
export function resolveLayout(layout, workArea, overrides = []) {
    const results = new Map();

    // Get layout defaults
    const defaults = {
        gap_inner: layout.defaults?.gap_inner ?? 0,
        gap_outer: normalizeInsets(layout.defaults?.gap_outer ?? 0),
        leaf_insets: normalizeInsets(layout.defaults?.leaf_insets ?? 0),
        aspect_policy: layout.defaults?.aspect_policy ?? 'none'
    };

    // Convert workArea to our rect format
    const rootRect = {
        x: workArea.x,
        y: workArea.y,
        w: workArea.width,
        h: workArea.height
    };

    // Apply any overrides to the layout before resolving
    const layoutWithOverrides = applyOverrides(layout, overrides);

    // Resolve the root node (isRoot=true so gap_outer applies only here)
    resolveNode(layoutWithOverrides.root, rootRect, defaults, [], results, true);

    return results;
}

/**
 * Apply overrides to a layout (creates a modified copy)
 * @param {object} layout
 * @param {object[]} overrides
 * @returns {object}
 */
function applyOverrides(layout, overrides) {
    if (!overrides || overrides.length === 0) {
        return layout;
    }

    // Deep clone the layout
    const modified = JSON.parse(JSON.stringify(layout));

    for (const override of overrides) {
        // Only apply overrides for this layout
        if (override.layout_name !== layout.name) continue;

        // Navigate to the split node using split_path
        let node = modified.root;
        for (const childIndex of (override.split_path || [])) {
            if (node.type !== 'split' || !node.children[childIndex]) {
                break;
            }
            node = node.children[childIndex];
        }

        // Apply child size overrides
        if (node.type === 'split' && override.child_sizes) {
            for (const sizeOverride of override.child_sizes) {
                const child = node.children[sizeOverride.child_index];
                if (child) {
                    child.size = sizeOverride.size;
                }
            }
        }
    }

    return modified;
}

/**
 * Recursively resolve a node
 * @param {object} node - The node to resolve
 * @param {{x: number, y: number, w: number, h: number}} rect - Available rectangle
 * @param {object} defaults - Layout defaults
 * @param {number[]} path - Current path (for debugging)
 * @param {Map} results - Results map to populate
 */
function resolveNode(node, rect, defaults, path, results, isRoot = false) {
    if (node.type === 'leaf') {
        resolveLeaf(node, rect, defaults, results);
    } else if (node.type === 'split') {
        resolveSplit(node, rect, defaults, path, results, isRoot);
    }
}

/**
 * Resolve a leaf node
 * @param {object} node
 * @param {{x: number, y: number, w: number, h: number}} rect
 * @param {object} defaults
 * @param {Map} results
 */
function resolveLeaf(node, rect, defaults, results) {
    // Tile rect is the full rectangle assigned to this leaf
    const tileRect = { ...rect };

    // Get insets for this leaf
    const insets = node.insets !== undefined
        ? normalizeInsets(node.insets)
        : defaults.leaf_insets;

    // Window rect is tile rect with insets applied
    let windowRect = applyInsets(tileRect, insets);

    // Apply aspect ratio fitting if specified
    if (node.aspect && node.aspect.policy === 'fit' && node.aspect.ratio > 0) {
        windowRect = applyAspectFit(windowRect, node.aspect.ratio);
    }

    results.set(node.id, {
        tileRect: {
            x: Math.round(tileRect.x),
            y: Math.round(tileRect.y),
            width: Math.round(tileRect.w),
            height: Math.round(tileRect.h)
        },
        windowRect: {
            x: Math.round(windowRect.x),
            y: Math.round(windowRect.y),
            width: Math.round(windowRect.w),
            height: Math.round(windowRect.h)
        }
    });
}

/**
 * Apply aspect ratio fitting (letterbox/pillarbox)
 * @param {{x: number, y: number, w: number, h: number}} rect
 * @param {number} ratio - width/height ratio
 * @returns {{x: number, y: number, w: number, h: number}}
 */
function applyAspectFit(rect, ratio) {
    const currentRatio = rect.w / rect.h;

    if (currentRatio > ratio) {
        // Too wide - pillarbox (shrink width, center horizontally)
        const newWidth = rect.h * ratio;
        const xOffset = (rect.w - newWidth) / 2;
        return {
            x: rect.x + xOffset,
            y: rect.y,
            w: newWidth,
            h: rect.h
        };
    } else if (currentRatio < ratio) {
        // Too tall - letterbox (shrink height, center vertically)
        const newHeight = rect.w / ratio;
        const yOffset = (rect.h - newHeight) / 2;
        return {
            x: rect.x,
            y: rect.y + yOffset,
            w: rect.w,
            h: newHeight
        };
    }

    return rect;
}

/**
 * Resolve a split node
 * @param {object} node
 * @param {{x: number, y: number, w: number, h: number}} rect
 * @param {object} defaults
 * @param {number[]} path
 * @param {Map} results
 */
function resolveSplit(node, rect, defaults, path, results, isRoot = false) {
    const isRow = node.dir === 'row';  // row = horizontal split (children side by side)

    // Get gaps
    // gap_inner: space between siblings (used at all levels)
    const gapInner = node.gap_inner ?? defaults.gap_inner;

    // gap_outer: margin around the split container
    // ONLY apply defaults.gap_outer at root level to prevent compounding in nested splits
    // Nested splits get gap_outer=0 unless explicitly set on the node
    const gapOuter = node.gap_outer !== undefined
        ? normalizeInsets(node.gap_outer)
        : (isRoot ? defaults.gap_outer : normalizeInsets(0));

    // Apply outer gaps to get usable rect
    const usableRect = applyInsets(rect, gapOuter);

    // Axis length and cross length
    const axisLen = isRow ? usableRect.h : usableRect.w;  // row splits vertically, col splits horizontally
    const crossLen = isRow ? usableRect.w : usableRect.h;

    // Wait, let me reconsider:
    // dir = "row" means children are arranged in a row (horizontally)
    // dir = "col" means children are arranged in a column (vertically)
    // So for "row", we split along the horizontal axis (x), axis length is width
    // For "col", we split along the vertical axis (y), axis length is height

    // Actually re-reading LAYOUT.md more carefully:
    // dir = "col" → columns side by side, split horizontally
    // dir = "row" → rows stacked, split vertically

    const axisLength = isRow ? usableRect.h : usableRect.w;
    const crossLength = isRow ? usableRect.w : usableRect.h;

    const children = node.children;
    const childCount = children.length;
    const totalInnerGaps = gapInner * (childCount - 1);
    const axisAvailable = Math.max(0, axisLength - totalInnerGaps);

    // Classify children and calculate sizes
    const childSizes = allocateChildSizes(children, axisAvailable);

    // Apply deterministic rounding
    const roundedSizes = applyRounding(childSizes, axisAvailable);

    // Calculate child rectangles
    let offset = isRow ? usableRect.y : usableRect.x;

    for (let i = 0; i < childCount; i++) {
        const child = children[i];
        const size = roundedSizes[i];

        let childRect;
        if (isRow) {
            // Row: children stack vertically (top to bottom)
            childRect = {
                x: usableRect.x,
                y: offset,
                w: crossLength,
                h: size
            };
        } else {
            // Col: children are side by side (left to right)
            childRect = {
                x: offset,
                y: usableRect.y,
                w: size,
                h: crossLength
            };
        }

        // Recurse into child
        resolveNode(child, childRect, defaults, [...path, i], results);

        // Move offset for next child
        offset += size + gapInner;
    }
}

/**
 * Allocate sizes to children based on their size specs
 * @param {object[]} children
 * @param {number} available - Available space along axis
 * @returns {number[]} - Allocated sizes (may be fractional)
 */
function allocateChildSizes(children, available) {
    const specs = children.map(c => getSizeSpec(c));
    const sizes = new Array(children.length).fill(0);

    // First pass: allocate fixed (px) sizes
    let pxTotal = 0;
    const fracChildren = [];

    for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        if (spec.kind === 'px') {
            let size = spec.value;
            // Apply min/max constraints
            if (spec.min_px !== undefined) size = Math.max(size, spec.min_px);
            if (spec.max_px !== undefined) size = Math.min(size, spec.max_px);
            sizes[i] = size;
            pxTotal += size;
        } else {
            fracChildren.push(i);
        }
    }

    // Second pass: distribute remaining space to frac children
    let remaining = available - pxTotal;

    if (fracChildren.length > 0 && remaining > 0) {
        // Calculate total weight
        let totalWeight = 0;
        for (const i of fracChildren) {
            totalWeight += specs[i].value;
        }

        // Distribute by weight
        for (const i of fracChildren) {
            const spec = specs[i];
            let size = (remaining * spec.value) / totalWeight;

            // Apply min/max constraints
            if (spec.min_px !== undefined) size = Math.max(size, spec.min_px);
            if (spec.max_px !== undefined) size = Math.min(size, spec.max_px);

            sizes[i] = size;
        }

        // Re-balance if constraints changed totals
        // (simplified: just one pass for now, can iterate if needed)
    }

    return sizes;
}

/**
 * Apply deterministic rounding per LAYOUT.md Section 2.2
 * @param {number[]} sizes - Fractional sizes
 * @param {number} available - Total available space
 * @returns {number[]} - Integer sizes
 */
function applyRounding(sizes, available) {
    // Floor all sizes
    const floored = sizes.map(s => Math.floor(s));

    // Calculate leftover pixels
    const total = floored.reduce((a, b) => a + b, 0);
    let leftover = Math.round(available) - total;

    // Distribute leftover in stable order (left to right / top to bottom)
    const result = [...floored];
    for (let i = 0; i < result.length && leftover > 0; i++) {
        result[i]++;
        leftover--;
    }

    return result;
}

/**
 * Find which divider was affected by a resize operation
 * Given a leaf that was resized and which edge moved, find the divider path
 *
 * @param {object} layout - The layout
 * @param {string} leafId - The leaf that was resized
 * @param {string} edge - Which edge moved: 'left', 'right', 'top', 'bottom'
 * @returns {{splitPath: number[], dividerIndex: number, direction: string} | null}
 */
export function findDividerForResize(layout, leafId, edge) {
    // Find the path to the leaf
    const leafPath = findNodePath(layout.root, leafId, []);
    if (!leafPath) return null;

    // Walk up the tree to find the split that contains this edge
    // The edge we're looking for depends on the split direction

    // For 'left' or 'right' edge: need a 'col' split (horizontal arrangement)
    // For 'top' or 'bottom' edge: need a 'row' split (vertical arrangement)
    const needsColSplit = edge === 'left' || edge === 'right';

    let node = layout.root;
    let splitPath = [];
    let dividerIndex = -1;

    for (let i = 0; i < leafPath.length; i++) {
        const childIndex = leafPath[i];

        if (node.type === 'split') {
            const isColSplit = node.dir === 'col';

            if ((needsColSplit && isColSplit) || (!needsColSplit && !isColSplit)) {
                // This split controls the edge we care about
                if (edge === 'right' || edge === 'bottom') {
                    // Right/bottom edge is the divider AFTER this child
                    dividerIndex = childIndex;
                } else {
                    // Left/top edge is the divider BEFORE this child
                    dividerIndex = childIndex - 1;
                }

                // Only valid if divider is between two children
                if (dividerIndex >= 0 && dividerIndex < node.children.length - 1) {
                    return {
                        splitPath,
                        dividerIndex,
                        direction: node.dir
                    };
                }
            }

            splitPath.push(childIndex);
            node = node.children[childIndex];
        }
    }

    return null;
}

/**
 * Find the path to a node by ID
 * @param {object} node
 * @param {string} targetId
 * @param {number[]} currentPath
 * @returns {number[] | null}
 */
function findNodePath(node, targetId, currentPath) {
    if (node.type === 'leaf') {
        return node.id === targetId ? currentPath : null;
    }

    if (node.type === 'split') {
        for (let i = 0; i < node.children.length; i++) {
            const result = findNodePath(node.children[i], targetId, [...currentPath, i]);
            if (result) return result;
        }
    }

    return null;
}

/**
 * Calculate new size specs after a divider drag
 *
 * @param {object} layout - The layout
 * @param {number[]} splitPath - Path to the split node
 * @param {number} dividerIndex - Which divider (between child i and i+1)
 * @param {number} deltaPixels - How many pixels the divider moved
 * @param {number} axisLength - Total length along the split axis
 * @returns {{child_index: number, size: object}[]}
 */
export function calculateDividerDrag(layout, splitPath, dividerIndex, deltaPixels, axisLength) {
    // Navigate to the split
    let node = layout.root;
    for (const idx of splitPath) {
        node = node.children[idx];
    }

    if (node.type !== 'split') return [];

    const childA = node.children[dividerIndex];
    const childB = node.children[dividerIndex + 1];

    const specA = getSizeSpec(childA);
    const specB = getSizeSpec(childB);

    // Convert current sizes to pixels (approximate)
    // For frac specs, estimate based on current resolution
    // This is simplified - a full implementation would track resolved sizes

    if (specA.kind === 'frac' && specB.kind === 'frac') {
        // Both are fractional - adjust weights
        const totalWeight = specA.value + specB.value;
        const pixelsPerWeight = axisLength / totalWeight;

        const currentPixelsA = specA.value * pixelsPerWeight;
        const currentPixelsB = specB.value * pixelsPerWeight;

        const newPixelsA = Math.max(50, currentPixelsA + deltaPixels);
        const newPixelsB = Math.max(50, currentPixelsB - deltaPixels);

        // Convert back to weights (normalized to original total)
        const newWeightA = (newPixelsA / (newPixelsA + newPixelsB)) * totalWeight;
        const newWeightB = (newPixelsB / (newPixelsA + newPixelsB)) * totalWeight;

        return [
            { child_index: dividerIndex, size: { kind: 'frac', value: newWeightA } },
            { child_index: dividerIndex + 1, size: { kind: 'frac', value: newWeightB } }
        ];
    }

    if (specA.kind === 'px') {
        // A is fixed, adjust it
        const newValue = Math.max(specA.min_px ?? 50, (specA.value ?? 0) + deltaPixels);
        return [
            { child_index: dividerIndex, size: { ...specA, value: newValue } }
        ];
    }

    if (specB.kind === 'px') {
        // B is fixed, adjust it
        const newValue = Math.max(specB.min_px ?? 50, (specB.value ?? 0) - deltaPixels);
        return [
            { child_index: dividerIndex + 1, size: { ...specB, value: newValue } }
        ];
    }

    return [];
}

/**
 * Convert a simple zone-based layout to full spec format
 * This allows backward compatibility with existing presets
 *
 * @param {object} simpleLayout - {id, name, zones: [{id, x, y, width, height}]}
 * @returns {object} - Full spec layout
 */
export function convertSimpleLayout(simpleLayout) {
    // For simple layouts, we create a single leaf for each zone
    // This doesn't create a proper tree structure but works for flat layouts

    // Sort zones to try to infer structure
    const zones = [...simpleLayout.zones].sort((a, b) => {
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
    });

    // For now, create a simple flat structure
    // A more sophisticated version would try to infer splits

    if (zones.length === 1) {
        return {
            schema_version: 1,
            name: simpleLayout.id,
            root: {
                type: 'leaf',
                id: zones[0].id
            }
        };
    }

    // Check if all zones are in a single row or column
    const allSameY = zones.every(z => z.y === zones[0].y);
    const allSameX = zones.every(z => z.x === zones[0].x);

    if (allSameY) {
        // Horizontal arrangement (col split)
        return {
            schema_version: 1,
            name: simpleLayout.id,
            defaults: { gap_inner: 0, gap_outer: 0 },
            root: {
                type: 'split',
                dir: 'col',
                children: zones.map(z => ({
                    type: 'leaf',
                    id: z.id,
                    size: { kind: 'frac', value: z.width }
                }))
            }
        };
    }

    if (allSameX) {
        // Vertical arrangement (row split)
        return {
            schema_version: 1,
            name: simpleLayout.id,
            defaults: { gap_inner: 0, gap_outer: 0 },
            root: {
                type: 'split',
                dir: 'row',
                children: zones.map(z => ({
                    type: 'leaf',
                    id: z.id,
                    size: { kind: 'frac', value: z.height }
                }))
            }
        };
    }

    // Complex layout - for now, just use zones directly with absolute positioning
    // The resolver will handle these as "virtual" leaves
    return {
        schema_version: 1,
        name: simpleLayout.id,
        _isSimpleLayout: true,  // Flag for special handling
        _zones: simpleLayout.zones
    };
}

/**
 * Resolve a simple zone-based layout (backward compatibility)
 * @param {object} simpleLayout
 * @param {{x: number, y: number, width: number, height: number}} workArea
 * @returns {Map<string, {tileRect: object, windowRect: object}>}
 */
export function resolveSimpleLayout(simpleLayout, workArea) {
    const results = new Map();

    for (const zone of simpleLayout.zones) {
        const tileRect = {
            x: Math.round(workArea.x + zone.x * workArea.width),
            y: Math.round(workArea.y + zone.y * workArea.height),
            width: Math.round(zone.width * workArea.width),
            height: Math.round(zone.height * workArea.height)
        };

        // For simple layouts, window rect = tile rect (no insets)
        results.set(zone.id, {
            tileRect,
            windowRect: { ...tileRect }
        });
    }

    return results;
}
