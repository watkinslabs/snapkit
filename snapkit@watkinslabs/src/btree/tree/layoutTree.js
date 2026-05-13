/**
 * LayoutTree - Binary Tree for Space Partitioning
 *
 * The core data structure of SnapKit. Represents how screen space is divided.
 *
 * Tree Structure:
 * - Branch nodes: Have left/right children, split direction, split ratio
 * - Leaf nodes: Represent zones where windows can be placed
 *
 * Example: 2x2 grid
 *       [H:0.5]           Horizontal split at 50%
 *       /     \
 *   [V:0.5] [V:0.5]      Vertical splits at 50%
 *   /  \     /  \
 *  Z0  Z1   Z2  Z3       Zones 0, 1, 2, 3
 */

export const SplitDirection = {
    HORIZONTAL: 'horizontal',
    VERTICAL: 'vertical'
};

/**
 * TreeNode - Base class for tree nodes
 */
export class TreeNode {
    constructor() {
        this.parent = null;
    }

    /**
     * Check if this is a leaf node (zone)
     * @returns {boolean}
     */
    isLeaf() {
        return this instanceof LeafNode;
    }

    /**
     * Check if this is a branch node (split)
     * @returns {boolean}
     */
    isBranch() {
        return this instanceof BranchNode;
    }
}

/**
 * LeafNode - Represents a zone
 */
export class LeafNode extends TreeNode {
    /**
     * @param {number} zoneIndex - Zone index
     */
    constructor(zoneIndex) {
        super();
        this.zoneIndex = zoneIndex;
    }
}

/**
 * BranchNode - Represents a split
 */
export class BranchNode extends TreeNode {
    /**
     * @param {string} direction - Split direction (horizontal or vertical)
     * @param {number} ratio - Split ratio (0.0 to 1.0, default 0.5)
     * @param {TreeNode} left - Left child
     * @param {TreeNode} right - Right child
     */
    constructor(direction, ratio, left, right) {
        super();
        this.direction = direction;
        this.ratio = ratio;
        this.left = left;
        this.right = right;

        // Set parent references
        if (this.left) {
            this.left.parent = this;
        }
        if (this.right) {
            this.right.parent = this;
        }
    }
}

/**
 * LayoutTree - Binary tree representing a layout
 */
export class LayoutTree {
    /**
     * @param {TreeNode} root - Root node of the tree
     */
    constructor(root) {
        this.root = root;
    }

    /**
     * Traverse tree in-order and collect leaf nodes
     * @returns {LeafNode[]}
     */
    getLeaves() {
        const leaves = [];
        this._traverseInOrder(this.root, leaves);
        return leaves;
    }

    /**
     * In-order traversal
     * @private
     * @param {TreeNode} node
     * @param {LeafNode[]} leaves
     */
    _traverseInOrder(node, leaves) {
        if (!node) {
            return;
        }

        if (node.isLeaf()) {
            leaves.push(node);
            return;
        }

        // Traverse left, then right
        if (node.left) {
            this._traverseInOrder(node.left, leaves);
        }
        if (node.right) {
            this._traverseInOrder(node.right, leaves);
        }
    }

    /**
     * Get total number of zones (leaf nodes)
     * @returns {number}
     */
    getZoneCount() {
        return this.getLeaves().length;
    }

    /**
     * Find leaf node by zone index
     * @param {number} zoneIndex
     * @returns {LeafNode|null}
     */
    findLeafByZone(zoneIndex) {
        return this._findLeaf(this.root, zoneIndex);
    }

    /**
     * Find leaf node
     * @private
     * @param {TreeNode} node
     * @param {number} zoneIndex
     * @returns {LeafNode|null}
     */
    _findLeaf(node, zoneIndex) {
        if (!node) {
            return null;
        }

        if (node.isLeaf()) {
            return node.zoneIndex === zoneIndex ? node : null;
        }

        // Search left and right
        const leftResult = this._findLeaf(node.left, zoneIndex);
        if (leftResult) {
            return leftResult;
        }

        return this._findLeaf(node.right, zoneIndex);
    }

    /**
     * Split a leaf node into two zones
     * Creates a new branch node with two leaf children
     *
     * @param {number} zoneIndex - Zone to split
     * @param {string} direction - Split direction (horizontal or vertical)
     * @param {number} ratio - Split ratio (default 0.5)
     * @returns {boolean} True if split successful
     */
    splitZone(zoneIndex, direction, ratio = 0.5) {
        const leaf = this.findLeafByZone(zoneIndex);
        if (!leaf) {
            return false;
        }

        // Get next zone indices
        const maxZoneIndex = Math.max(...this.getLeaves().map(l => l.zoneIndex));
        const newZone1 = maxZoneIndex + 1;
        const newZone2 = maxZoneIndex + 2;

        // Create new leaves
        const left = new LeafNode(newZone1);
        const right = new LeafNode(newZone2);

        // Create branch node
        const branch = new BranchNode(direction, ratio, left, right);

        // Replace leaf with branch
        if (leaf.parent) {
            if (leaf.parent.left === leaf) {
                leaf.parent.left = branch;
            } else {
                leaf.parent.right = branch;
            }
            branch.parent = leaf.parent;
        } else {
            // Leaf was root
            this.root = branch;
        }

        return true;
    }

    /**
     * Collapse the parent split of a leaf back into a single zone. The
     * sibling subtree is discarded and zone indices are renumbered so the
     * result is still a contiguous 0..N-1 sequence.
     *
     * @param {number} zoneIndex
     * @returns {number|null} The renumbered zone index of the surviving
     *   leaf, or null if the operation isn't possible (no parent / no leaf).
     */
    unsplitZone(zoneIndex) {
        const leaf = this.findLeafByZone(zoneIndex);
        if (!leaf || !leaf.parent) {
            return null;
        }

        const parent = leaf.parent;
        const grandparent = parent.parent;
        const survivor = new LeafNode(0); // zoneIndex set during renumber
        survivor.parent = grandparent;

        if (grandparent) {
            if (grandparent.left === parent) {
                grandparent.left = survivor;
            } else if (grandparent.right === parent) {
                grandparent.right = survivor;
            }
        } else {
            this.root = survivor;
        }

        this._renumberLeaves();
        return survivor.zoneIndex;
    }

    /**
     * Public alias — normalize leaf indices to 0..N-1 in in-order order.
     * `splitZone` intentionally allocates new IDs as `max+1` / `max+2` to
     * avoid clashing with stable runtime references, so callers that
     * persist or hand the tree off to the snap pipeline must normalize
     * first; otherwise `snapHandler` (which array-indexes the resolver
     * output by zoneIndex) silently rejects "invalid zone index".
     */
    normalize() {
        this._renumberLeaves();
    }

    /**
     * Re-number all leaves in in-order traversal so indices are 0..N-1.
     * @private
     */
    _renumberLeaves() {
        let next = 0;
        const walk = (node) => {
            if (!node) return;
            if (node.zoneIndex !== undefined) {
                node.zoneIndex = next++;
                return;
            }
            walk(node.left);
            walk(node.right);
        };
        walk(this.root);
    }

    /**
     * Update split ratio for a branch node
     * Used when dividers are dragged
     *
     * @param {string} path - Path to branch node (e.g., 'L', 'LL', 'LR')
     * @param {number} newRatio - New split ratio
     * @returns {boolean} True if update successful
     */
    updateSplitRatio(path, newRatio) {
        const branch = this._findBranchByPath(path);
        if (!branch) {
            return false;
        }

        // Validate ratio
        if (newRatio <= 0 || newRatio >= 1) {
            return false;
        }

        branch.ratio = newRatio;
        return true;
    }

    /**
     * Find branch node by path
     * @private
     * @param {string} path
     * @returns {BranchNode|null}
     */
    _findBranchByPath(path) {
        if (!path) {
            return this.root.isBranch() ? this.root : null;
        }

        let node = this.root;
        for (const dir of path) {
            if (!node || node.isLeaf()) {
                return null;
            }

            if (dir === 'L') {
                node = node.left;
            } else if (dir === 'R') {
                node = node.right;
            } else {
                return null;
            }
        }

        return node && node.isBranch() ? node : null;
    }

    /**
     * Create a simple grid tree
     * Factory method for common case
     *
     * @param {number} rows
     * @param {number} cols
     * @returns {LayoutTree}
     */
    static createGrid(rows, cols) {
        if (rows === 1 && cols === 1) {
            return new LayoutTree(new LeafNode(0));
        }

        // Build tree recursively
        let zoneIndex = 0;

        /**
         * Build horizontal splits (rows)
         */
        const buildRows = (numRows) => {
            if (numRows === 1) {
                return buildCols(cols);
            }

            const left = buildCols(cols);
            const right = buildRows(numRows - 1);
            return new BranchNode(SplitDirection.HORIZONTAL, 1 / numRows, left, right);
        };

        /**
         * Build vertical splits (columns)
         */
        const buildCols = (numCols) => {
            if (numCols === 1) {
                return new LeafNode(zoneIndex++);
            }

            const left = new LeafNode(zoneIndex++);
            const right = buildCols(numCols - 1);
            return new BranchNode(SplitDirection.VERTICAL, 1 / numCols, left, right);
        };

        return new LayoutTree(buildRows(rows));
    }

    /**
     * Create tree from full-spec layout definition
     *
     * @param {Object} layoutDef - Layout definition with tree property
     * @returns {LayoutTree}
     */
    static fromDefinition(layoutDef) {
        // Accept simple grids in addition to {tree: ...}.
        if (Array.isArray(layoutDef)) {
            return LayoutTree.createGrid(layoutDef[0], layoutDef[1]);
        }
        if (layoutDef && Array.isArray(layoutDef.layout)) {
            return LayoutTree.createGrid(layoutDef.layout[0], layoutDef.layout[1]);
        }

        const root = (layoutDef && layoutDef.tree) ? layoutDef.tree
            : (layoutDef && layoutDef.layout && layoutDef.layout.tree) ? layoutDef.layout.tree
            : layoutDef;

        const buildNode = (nodeDef) => {
            if (nodeDef.zone !== undefined) {
                // Leaf node
                return new LeafNode(nodeDef.zone);
            }

            // Branch node
            const left = buildNode(nodeDef.left);
            const right = buildNode(nodeDef.right);
            return new BranchNode(nodeDef.direction, nodeDef.ratio, left, right);
        };

        return new LayoutTree(buildNode(root));
    }

    /**
     * Serialize the tree back into a full-spec layout definition the
     * resolver/persistence layer understands. Inverse of fromDefinition.
     *
     * @returns {Object} { tree: { direction, ratio, left, right } | { zone } }
     */
    toDefinition() {
        const serialize = (node) => {
            if (!node) {
                return { zone: 0 };
            }
            if (node instanceof LeafNode || node.zoneIndex !== undefined) {
                return { zone: node.zoneIndex };
            }
            return {
                direction: node.direction,
                ratio: node.ratio,
                left: serialize(node.left),
                right: serialize(node.right)
            };
        };
        return { tree: serialize(this.root) };
    }
}
