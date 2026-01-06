// Built-in layout presets in full-spec format (LAYOUT.md schema v1)
// Full-spec format enables resize-by-window-edge feature

export const PRESET_LAYOUTS = [
    // Layout 1: Half Split (Left/Right)
    {
        schema_version: 1,
        name: 'half-split',
        defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
        root: {
            type: 'split',
            dir: 'col',
            children: [
                { type: 'leaf', id: 'left', size: { kind: 'frac', value: 1 } },
                { type: 'leaf', id: 'right', size: { kind: 'frac', value: 1 } }
            ]
        },
        // Keep zones for backward compatibility with UI
        zones: [
            { id: 'left', x: 0, y: 0, width: 0.5, height: 1 },
            { id: 'right', x: 0.5, y: 0, width: 0.5, height: 1 }
        ]
    },

    // Layout 2: Quarters (Four equal sections)
    {
        schema_version: 1,
        name: 'quarters',
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
        },
        zones: [
            { id: 'top-left', x: 0, y: 0, width: 0.5, height: 0.5 },
            { id: 'top-right', x: 0.5, y: 0, width: 0.5, height: 0.5 },
            { id: 'bottom-left', x: 0, y: 0.5, width: 0.5, height: 0.5 },
            { id: 'bottom-right', x: 0.5, y: 0.5, width: 0.5, height: 0.5 }
        ]
    },

    // Layout 3: Thirds Vertical (Three columns)
    {
        schema_version: 1,
        name: 'thirds-vertical',
        defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
        root: {
            type: 'split',
            dir: 'col',
            children: [
                { type: 'leaf', id: 'left', size: { kind: 'frac', value: 1 } },
                { type: 'leaf', id: 'center', size: { kind: 'frac', value: 1 } },
                { type: 'leaf', id: 'right', size: { kind: 'frac', value: 1 } }
            ]
        },
        zones: [
            { id: 'left', x: 0, y: 0, width: 0.333, height: 1 },
            { id: 'center', x: 0.333, y: 0, width: 0.334, height: 1 },
            { id: 'right', x: 0.667, y: 0, width: 0.333, height: 1 }
        ]
    },

    // Layout 4: Thirds Horizontal (Three rows)
    {
        schema_version: 1,
        name: 'thirds-horizontal',
        defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
        root: {
            type: 'split',
            dir: 'row',
            children: [
                { type: 'leaf', id: 'top', size: { kind: 'frac', value: 1 } },
                { type: 'leaf', id: 'middle', size: { kind: 'frac', value: 1 } },
                { type: 'leaf', id: 'bottom', size: { kind: 'frac', value: 1 } }
            ]
        },
        zones: [
            { id: 'top', x: 0, y: 0, width: 1, height: 0.333 },
            { id: 'middle', x: 0, y: 0.333, width: 1, height: 0.334 },
            { id: 'bottom', x: 0, y: 0.667, width: 1, height: 0.333 }
        ]
    },

    // Layout 5: Left Focus (Large left, split right)
    {
        schema_version: 1,
        name: 'left-focus',
        defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
        root: {
            type: 'split',
            dir: 'col',
            children: [
                { type: 'leaf', id: 'left', size: { kind: 'frac', value: 2 } },
                {
                    type: 'split',
                    dir: 'row',
                    size: { kind: 'frac', value: 1 },
                    children: [
                        { type: 'leaf', id: 'top-right', size: { kind: 'frac', value: 1 } },
                        { type: 'leaf', id: 'bottom-right', size: { kind: 'frac', value: 1 } }
                    ]
                }
            ]
        },
        zones: [
            { id: 'left', x: 0, y: 0, width: 0.667, height: 1 },
            { id: 'top-right', x: 0.667, y: 0, width: 0.333, height: 0.5 },
            { id: 'bottom-right', x: 0.667, y: 0.5, width: 0.333, height: 0.5 }
        ]
    },

    // Layout 6: Right Focus (Split left, large right)
    {
        schema_version: 1,
        name: 'right-focus',
        defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
        root: {
            type: 'split',
            dir: 'col',
            children: [
                {
                    type: 'split',
                    dir: 'row',
                    size: { kind: 'frac', value: 1 },
                    children: [
                        { type: 'leaf', id: 'top-left', size: { kind: 'frac', value: 1 } },
                        { type: 'leaf', id: 'bottom-left', size: { kind: 'frac', value: 1 } }
                    ]
                },
                { type: 'leaf', id: 'right', size: { kind: 'frac', value: 2 } }
            ]
        },
        zones: [
            { id: 'top-left', x: 0, y: 0, width: 0.333, height: 0.5 },
            { id: 'bottom-left', x: 0, y: 0.5, width: 0.333, height: 0.5 },
            { id: 'right', x: 0.333, y: 0, width: 0.667, height: 1 }
        ]
    },

    // Layout 7: Top Focus (Large top, split bottom)
    {
        schema_version: 1,
        name: 'top-focus',
        defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
        root: {
            type: 'split',
            dir: 'row',
            children: [
                { type: 'leaf', id: 'top', size: { kind: 'frac', value: 2 } },
                {
                    type: 'split',
                    dir: 'col',
                    size: { kind: 'frac', value: 1 },
                    children: [
                        { type: 'leaf', id: 'bottom-left', size: { kind: 'frac', value: 1 } },
                        { type: 'leaf', id: 'bottom-right', size: { kind: 'frac', value: 1 } }
                    ]
                }
            ]
        },
        zones: [
            { id: 'top', x: 0, y: 0, width: 1, height: 0.667 },
            { id: 'bottom-left', x: 0, y: 0.667, width: 0.5, height: 0.333 },
            { id: 'bottom-right', x: 0.5, y: 0.667, width: 0.5, height: 0.333 }
        ]
    },

    // Layout 8: Bottom Focus (Split top, large bottom)
    {
        schema_version: 1,
        name: 'bottom-focus',
        defaults: { gap_inner: 0, gap_outer: 0, leaf_insets: 0 },
        root: {
            type: 'split',
            dir: 'row',
            children: [
                {
                    type: 'split',
                    dir: 'col',
                    size: { kind: 'frac', value: 1 },
                    children: [
                        { type: 'leaf', id: 'top-left', size: { kind: 'frac', value: 1 } },
                        { type: 'leaf', id: 'top-right', size: { kind: 'frac', value: 1 } }
                    ]
                },
                { type: 'leaf', id: 'bottom', size: { kind: 'frac', value: 2 } }
            ]
        },
        zones: [
            { id: 'top-left', x: 0, y: 0, width: 0.5, height: 0.333 },
            { id: 'top-right', x: 0.5, y: 0, width: 0.5, height: 0.333 },
            { id: 'bottom', x: 0, y: 0.333, width: 1, height: 0.667 }
        ]
    }
];
