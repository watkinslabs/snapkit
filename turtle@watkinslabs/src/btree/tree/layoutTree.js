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

    /**
     * Clone this node
     * @returns {LeafNode}
     */
    clone() {
        const node = new LeafNode(this.zoneIndex);
        return node;
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

    /**
     * Clone this node and its subtree
     * @returns {BranchNode}
     */
    clone() {
        const left = this.left ? this.left.clone() : null;
        const right = this.right ? this.right.clone() : null;
        return new BranchNode(this.direction, this.ratio, left, right);
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
     * Get tree depth
     * @returns {number}
     */
    getDepth() {
        return this._getNodeDepth(this.root);
    }

    /**
     * Get depth of a node
     * @private
     * @param {TreeNode} node
     * @returns {number}
     */
    _getNodeDepth(node) {
        if (!node || node.isLeaf()) {
            return 1;
        }

        const leftDepth = this._getNodeDepth(node.left);
        const rightDepth = this._getNodeDepth(node.right);
        return 1 + Math.max(leftDepth, rightDepth);
    }

    /**
     * Clone this tree
     * @returns {LayoutTree}
     */
    clone() {
        return new LayoutTree(this.root ? this.root.clone() : null);
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
     * Get all branch nodes with their paths
     * Used for finding dividers
     * @returns {Array<{node: BranchNode, path: string}>}
     */
    getBranches() {
        const branches = [];
        this._collectBranches(this.root, '', branches);
        return branches;
    }

    /**
     * Collect branch nodes
     * @private
     * @param {TreeNode} node
     * @param {string} path - Path from root (e.g., 'L', 'R', 'LL', 'LR')
     * @param {Array} branches
     */
    _collectBranches(node, path, branches) {
        if (!node || node.isLeaf()) {
            return;
        }

        branches.push({ node, path });

        if (node.left) {
            this._collectBranches(node.left, path + 'L', branches);
        }
        if (node.right) {
            this._collectBranches(node.right, path + 'R', branches);
        }
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
     * Get all dividers (edges) in the tree
     * Each divider connects two subtrees
     *
     * @returns {Array<{path: string, direction: string, ratio: number}>}
     */
    getDividers() {
        const branches = this.getBranches();
        return branches.map(({ node, path }) => ({
            path,
            direction: node.direction,
            ratio: node.ratio
        }));
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

        return new LayoutTree(buildNode(layoutDef.tree));
    }
}
