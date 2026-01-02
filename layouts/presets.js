// Built-in layout presets matching Windows 11 snap layouts

export const PRESET_LAYOUTS = [
    // Layout 1: Half Split (Left/Right)
    {
        id: 'half-split',
        name: 'Half Split',
        zones: [
            { id: 'left', x: 0, y: 0, width: 0.5, height: 1 },
            { id: 'right', x: 0.5, y: 0, width: 0.5, height: 1 }
        ]
    },

    // Layout 2: Quarters (Four equal sections)
    {
        id: 'quarters',
        name: 'Quarters',
        zones: [
            { id: 'top-left', x: 0, y: 0, width: 0.5, height: 0.5 },
            { id: 'top-right', x: 0.5, y: 0, width: 0.5, height: 0.5 },
            { id: 'bottom-left', x: 0, y: 0.5, width: 0.5, height: 0.5 },
            { id: 'bottom-right', x: 0.5, y: 0.5, width: 0.5, height: 0.5 }
        ]
    },

    // Layout 3: Thirds Vertical (Three columns)
    {
        id: 'thirds-vertical',
        name: 'Thirds (Vertical)',
        zones: [
            { id: 'left', x: 0, y: 0, width: 0.333, height: 1 },
            { id: 'center', x: 0.333, y: 0, width: 0.334, height: 1 },
            { id: 'right', x: 0.667, y: 0, width: 0.333, height: 1 }
        ]
    },

    // Layout 4: Thirds Horizontal (Three rows)
    {
        id: 'thirds-horizontal',
        name: 'Thirds (Horizontal)',
        zones: [
            { id: 'top', x: 0, y: 0, width: 1, height: 0.333 },
            { id: 'middle', x: 0, y: 0.333, width: 1, height: 0.334 },
            { id: 'bottom', x: 0, y: 0.667, width: 1, height: 0.333 }
        ]
    },

    // Layout 5: Left Focus (Large left, split right)
    {
        id: 'left-focus',
        name: 'Left Focus',
        zones: [
            { id: 'left', x: 0, y: 0, width: 0.667, height: 1 },
            { id: 'top-right', x: 0.667, y: 0, width: 0.333, height: 0.5 },
            { id: 'bottom-right', x: 0.667, y: 0.5, width: 0.333, height: 0.5 }
        ]
    },

    // Layout 6: Right Focus (Split left, large right)
    {
        id: 'right-focus',
        name: 'Right Focus',
        zones: [
            { id: 'top-left', x: 0, y: 0, width: 0.333, height: 0.5 },
            { id: 'bottom-left', x: 0, y: 0.5, width: 0.333, height: 0.5 },
            { id: 'right', x: 0.333, y: 0, width: 0.667, height: 1 }
        ]
    },

    // Layout 7: Top Focus (Large top, split bottom)
    {
        id: 'top-focus',
        name: 'Top Focus',
        zones: [
            { id: 'top', x: 0, y: 0, width: 1, height: 0.667 },
            { id: 'bottom-left', x: 0, y: 0.667, width: 0.5, height: 0.333 },
            { id: 'bottom-right', x: 0.5, y: 0.667, width: 0.5, height: 0.333 }
        ]
    },

    // Layout 8: Bottom Focus (Split top, large bottom)
    {
        id: 'bottom-focus',
        name: 'Bottom Focus',
        zones: [
            { id: 'top-left', x: 0, y: 0, width: 0.5, height: 0.333 },
            { id: 'top-right', x: 0.5, y: 0, width: 0.5, height: 0.333 },
            { id: 'bottom', x: 0, y: 0.333, width: 1, height: 0.667 }
        ]
    }
];
