# SnapKit Terminology and Naming Conventions

**Version:** 1.0
**Purpose:** Define exact terms used throughout SnapKit codebase for consistency

---

## Core Concepts

### Layout
**A BTree-based definition of how to divide screen space.**

- Simple format: `[2, 2]` = 2x2 grid
- Full-spec format: Tree structure with dividers

Examples:
- `[2, 2]` - 2x2 grid (4 zones)
- `[3, 1]` - 3 columns (3 zones)
- Full tree structure with horizontal/vertical splits

**Code:** `layout`, `layoutDefinition`, `layoutSpec`

### Zone
**A leaf node in the layout BTree - a rectangular area where a window can be placed.**

Each zone has:
- Index (e.g., zone 0, zone 1)
- Geometry (x, y, width, height)
- Parent layout

**Code:** `zone`, `zoneIndex`, `zoneRect`, `zoneGeometry`

### BTree / Layout Tree
**The binary tree data structure representing the layout.**

Nodes can be:
- **Branch Node**: Has left/right children, has split direction (horizontal/vertical)
- **Leaf Node**: Represents a zone

**Code:** `layoutTree`, `btree`, `treeNode`, `leafNode`, `branchNode`

### Divider
**The split point between two zones (edge in the BTree).**

Properties:
- Position (0.0 to 1.0, where 0.5 = middle)
- Direction (horizontal or vertical)
- Can be dragged to resize zones

**Code:** `divider`, `dividerPosition`, `splitRatio`

### Override
**A user-adjusted divider position that persists across sessions.**

When a user drags a divider, the new position is stored as an override.

**Code:** `override`, `dividerOverride`, `persistedOverride`

---

## Extension States

### CLOSED
**The overlay is not visible. Default state.**

User is working normally. Extension is idle, waiting for trigger.

**Code:** `State.CLOSED`, `ExtensionState.CLOSED`

### OPEN
**The overlay is showing, user can select a zone.**

Triggered by:
- Mouse to screen edge/corner
- Keyboard shortcut

User can:
- Click a zone to open SELECT_WINDOW mode
- Hover zones (they highlight)
- Press Esc to close

**Code:** `State.OPEN`, `ExtensionState.OPEN`

### SELECT_WINDOW
**A zone was selected, now showing window selector.**

User sees list of windows with thumbnails.
User selects which window to snap to the zone.

**Code:** `State.SELECT_WINDOW`, `ExtensionState.SELECT_WINDOW`

### DRAG_MODE
**User is dragging a window, showing snap preview.**

When user starts dragging a window:
- Show snap preview overlay
- Highlight zone under cursor
- Show preview of where window will land

**NOT the same as SELECT_WINDOW mode!**

**Code:** `State.DRAG_MODE`, `ExtensionState.DRAG_MODE`

---

## Features and Workflows

### Snap (verb)
**To position a window into a zone.**

Process:
1. Select zone
2. Select window
3. Calculate window geometry from zone rectangle
4. Move/resize window to fit zone

**Code:** `snap()`, `snapWindow()`, `snapToZone()`

### Drag to Snap
**Drag a window onto the overlay to snap it to a zone.**

1. User starts dragging window → Enter DRAG_MODE
2. Show snap preview overlay
3. Cursor moves over zones → Highlight target zone
4. User drops window → Snap to zone
5. Exit DRAG_MODE

**Code:** `dragToSnap`, `isDragging`, `draggedWindow`

### Interactive Select (formerly "Snap Mode")
**Open overlay, select zone, select window - all via mouse/keyboard.**

Better name: **INTERACTIVE_SELECT** or **ZONE_SELECT_MODE**

Workflow:
1. User triggers overlay (edge/corner/shortcut) → OPEN state
2. User clicks zone (or arrows + enter) → SELECT_WINDOW state
3. User selects window → Snap window to zone
4. Return to OPEN state or close

**Code:** `InteractiveSelectMode`, `zoneSelectMode`

### Tile Group
**A set of windows snapped to zones from the same layout.**

When windows in a tile group are resized:
- Synchronize resize across group
- Update divider positions
- Save new overrides

**Code:** `tileGroup`, `TileGroup`

### Resize Sync
**Synchronizing window sizes when dividers are dragged.**

When user drags a divider between two windows:
1. Detect divider drag
2. Calculate new zone sizes
3. Resize windows in sync
4. Save override position

**Code:** `resizeSync`, `synchronizeResize()`

---

## UI Components

### Overlay
**Generic term for any fullscreen UI layer.**

Types:
- Layout Overlay (shows zones)
- Snap Preview Overlay (shows preview during drag)
- Zone Positioning Overlay (highlights specific zones)

**Code:** `overlay`, `BaseOverlay`

### Layout Overlay
**The main overlay showing all zones in the layout.**

Displays:
- Zone rectangles
- Zone numbers
- Zone labels
- Highlight on hover

**Code:** `layoutOverlay`, `LayoutOverlay`

### Snap Preview Overlay
**Overlay shown during drag, previews where window will land.**

Shows:
- Highlighted target zone
- Window preview in zone
- Current cursor position affects target

**Code:** `snapPreviewOverlay`, `SnapPreviewOverlay`

### Zone Positioning Overlay
**Simple overlay highlighting specific zones.**

Used in interactive select mode to show current zone.

**Code:** `zonePositioningOverlay`, `ZonePositioningOverlay`

### Window Selector
**Dialog showing windows for user to select.**

Displays:
- Window list
- Thumbnails
- Window titles
- Search/filter

**Code:** `windowSelector`, `WindowSelector`

### Layout Editor
**UI for creating/editing custom layouts.**

Allows:
- Visual BTree editing
- Split zones
- Merge zones
- Adjust dividers
- Preview layout

**Code:** `layoutEditor`, `LayoutEditor`

---

## Technical Terms

### Resolution
**Converting a layout BTree into zone rectangles.**

Input: Layout definition, work area, overrides
Output: Array of zone rectangles

This is **THE CORE ALGORITHM**.

**Code:** `resolve()`, `resolveLayout()`, `layoutResolver`

### Work Area
**The usable screen area (screen minus panels).**

Provided by GNOME Shell. Excludes top bar, docks, etc.

**Code:** `workArea`, `monitorWorkArea`

### Monitor
**A physical display.**

SnapKit supports multiple monitors.
Each monitor can have different layouts.

**Code:** `monitor`, `monitorIndex`, `primaryMonitor`

### Trigger Zone
**Screen edges/corners that trigger overlay when cursor enters.**

Examples:
- Top-left corner
- Right edge
- Bottom-right corner

**Code:** `triggerZone`, `TriggerZone.TOP_LEFT`

### Grab Operation (grab-op)
**GNOME Shell term for window drag/resize operation.**

We use grab-op signals to detect window dragging.

**Code:** `grabOp`, `grab-op-begin`, `grab-op-end`

---

## Deprecated Terms (DO NOT USE)

### ❌ "Snap Mode"
**Too ambiguous. Could mean drag-to-snap OR interactive select.**

Use instead:
- `DRAG_MODE` for dragging
- `INTERACTIVE_SELECT` for overlay + zone selection

### ❌ "Grid"
**Implies only simple grids, but we support any BTree layout.**

Use instead: `layout`, `zone`

### ❌ "Cell"
**Could be confused with table cells.**

Use instead: `zone`

### ❌ "Region"
**Too generic.**

Use instead: `zone`, `workArea`

### ❌ "Tile" (as verb)
**"Tile" is ambiguous - could mean snap OR layout arrangement.**

Use instead: `snap` (verb), `tileGroup` (noun for grouped windows)

---

## Naming Conventions

### States
```javascript
// GOOD
State.CLOSED
State.OPEN
State.SELECT_WINDOW
State.DRAG_MODE

// BAD
State.closed
State.showing
State.snapMode
```

### Methods
```javascript
// GOOD
snapToZone(window, zoneIndex)
resolveLayout(layout, workArea, overrides)
showLayoutOverlay()
enterDragMode(window)

// BAD
tileWindow(window, cell)
calculateGrid(rows, cols)
showSnapMode()
```

### Variables
```javascript
// GOOD
const zoneIndex = 2;
const draggedWindow = getFocusWindow();
const layoutOverlay = new LayoutOverlay();
const selectedZone = zones[zoneIndex];

// BAD
const cellIdx = 2;
const window_being_dragged = getFocusWindow();
const overlay = new LayoutOverlay();
const zone = zones[index];
```

### File Names
```javascript
// GOOD
layoutResolver.js
snapHandler.js
layoutOverlay.js
dragDetector.js

// BAD
gridCalculator.js
snapMode.js
overlay.js
drag.js
```

---

## State Transition Diagram

```
         ┌─────────┐
         │ CLOSED  │ ←──────────────────┐
         └────┬────┘                    │
              │ (trigger)               │
              ↓                         │
         ┌─────────┐                    │
    ┌──→ │  OPEN   │ ───(click zone)───┤
    │    └────┬────┘                    │
    │         │                         │
    │    (click zone)              (complete)
    │         │                         │
    │         ↓                         │
    │    ┌──────────────┐               │
    └────┤SELECT_WINDOW ├───────────────┘
         └──────────────┘

Parallel:
         ┌─────────┐
         │ CLOSED  │
         └────┬────┘
              │ (start drag)
              ↓
         ┌───────────┐
         │DRAG_MODE  │
         └────┬──────┘
              │ (drop)
              ↓
         ┌─────────┐
         │ CLOSED  │
         └─────────┘
```

---

## Usage Examples

### Good Code
```javascript
// Clear state name
if (this._state === State.OPEN) {
    this._layoutOverlay.show();
}

// Clear method name
snapToZone(window, zoneIndex) {
    const zone = this._zones[zoneIndex];
    const rect = this._layoutResolver.resolve(layout, workArea)[zoneIndex];
    window.move_resize_frame(rect.x, rect.y, rect.width, rect.height);
}

// Clear variable names
const draggedWindow = this._getDraggedWindow();
const targetZone = this._getZoneAtCursor();
const zoneRect = this._zones[targetZone];
```

### Bad Code
```javascript
// Ambiguous state
if (this._snapMode) { // What kind of snap mode?
    this._overlay.show();
}

// Unclear method
tile(win, cell) { // Tile or snap? Cell or zone?
    // ...
}

// Confusing variables
const w = this._getWindow();
const c = this._getCellAtPos();
const r = this._cells[c];
```

---

## Summary

**Use these exact terms consistently throughout the codebase:**

| Concept | Use This | Not This |
|---------|----------|----------|
| Screen division | Layout | Grid, Template |
| Rectangular area | Zone | Cell, Region, Tile |
| Tree structure | BTree, Layout Tree | Grid |
| Split point | Divider | Separator, Border |
| Positioning window | Snap | Tile (verb) |
| Dragging to snap | Drag Mode | Snap Mode |
| Interactive selection | Interactive Select | Snap Mode |
| Grouped windows | Tile Group | Grid Group |
| Fullscreen UI | Overlay | Popup, Dialog |

---

**Last Updated:** 2026-01-05
**Applies To:** All new code in `src/` directory
