# Custom Layout Editor - Implementation Plan

**Decision**: Full spec editor (hierarchical splits per LAYOUT.md) in a modal dialog within prefs.

---

## Overview

This plan implements a visual layout editor that allows users to create custom layouts following the full `LAYOUT.md` schema specification. The editor will be accessible from the GNOME extension preferences dialog.

---

## Phase 1: Schema & Infrastructure

### 1.1 Verify GSettings Schema
- Ensure `custom-layouts` key exists in `schemas/org.gnome.shell.extensions.snapkit.gschema.xml`
- Type: string (JSON array)
- Default: `'[]'`

### 1.2 Create Layout Validator (`lib/layoutValidator.js`)
```javascript
// Validates layout objects against LAYOUT.md schema v1
export function validateLayout(layout) {
    // Returns { valid: boolean, errors: string[] }
}

export function validateNode(node, path, leafIds) {
    // Recursive node validation
}
```

**Validation rules from LAYOUT.md:**
- `schema_version` = 1
- `name` non-empty, unique
- `root` is valid node
- Leaf `id`s unique within layout
- Split `children.length >= 2`
- Gap values >= 0
- `min_px <= max_px` if both exist
- Aspect ratio > 0

### 1.3 Create Layout Resolver (`lib/layoutResolver.js`)
```javascript
// Implements Section 6 of LAYOUT.md
export function resolveLayout(layout, workArea) {
    // Returns Map<leafId, { tileRect, windowRect }>
}
```

**Resolution algorithm:**
1. Apply outer gaps to get usable rect
2. Calculate inner gaps between children
3. Distribute space by size specs (frac/px/auto)
4. Handle min/max constraints
5. Apply deterministic rounding
6. Recurse into children

### 1.4 Update LayoutManager (`lib/layoutManager.js`)
- Add method: `_loadCustomLayoutsV2()` - load full spec layouts
- Add method: `resolveLayoutSpec(layoutSpec, workArea)` - use new resolver
- Keep backward compatibility with simple zone format
- Auto-detect format: if `root` exists, use full spec; else use simple zones

---

## Phase 2: Prefs UI - Layout List

### 2.1 Add Custom Layouts Section to `prefs.js`

After the existing "Layouts" toggle group, add:

```javascript
// Custom Layouts Group
const customLayoutsGroup = new Adw.PreferencesGroup({
    title: 'Custom Layouts',
    description: 'Create and manage your own layouts'
});

// [+ Create New Layout] button
// List of custom layouts with edit/delete buttons
// Import/Export buttons
```

### 2.2 Custom Layout List Widget
- Show each custom layout as an ActionRow
- Subtitle: zone count, e.g., "3 zones"
- Suffix: Edit button, Delete button
- Enable/disable toggle (adds to `enabled-layouts`)

### 2.3 Import/Export
- Export: Download layout JSON file
- Import: Load layout JSON file, validate, add to list

---

## Phase 3: Layout Editor Dialog

### 3.1 Create `lib/layoutEditorDialog.js`

Main Adwaita dialog with:
- Header bar: title, Cancel, Save buttons
- Content area split into:
  - Canvas (left, 60%): visual layout preview
  - Properties panel (right, 40%): edit selected node

### 3.2 Dialog Structure

```
┌──────────────────────────────────────────────────────────┐
│  [Cancel]     Create Layout                    [Save]    │
├──────────────────────────────────────────────────────────┤
│  Name: [___________________________________]             │
│  Description: [_____________________________]            │
├────────────────────────────────┬─────────────────────────┤
│                                │  Layout Settings        │
│   ┌────────────────────────┐   │  ─────────────────────  │
│   │                        │   │  Gap Inner: [12] px     │
│   │   VISUAL CANVAS        │   │  Gap Outer: [12] px     │
│   │   (interactive)        │   │  Leaf Insets: [8] px    │
│   │                        │   │                         │
│   └────────────────────────┘   ├─────────────────────────┤
│                                │  Selected: Split (root) │
│   Toolbar:                     │  ─────────────────────  │
│   [Split H] [Split V] [Delete] │  Direction: [Row ▼]     │
│                                │  Children: 2            │
│                                │                         │
├────────────────────────────────┴─────────────────────────┤
│  Tree View (optional): root > left | right              │
└──────────────────────────────────────────────────────────┘
```

### 3.3 Create `lib/layoutEditorCanvas.js`

GTK4 DrawingArea-based widget for visual editing:

**Display:**
- Draw workspace rectangle (scaled to fit)
- Render layout tree as nested rectangles
- Show gaps visually
- Highlight selected node
- Show leaf IDs as labels

**Interaction:**
- Click leaf: select it
- Click split: select it
- Drag dividers between siblings to adjust sizes
- Double-click leaf: open rename dialog

**Rendering algorithm:**
1. Take current layout JSON
2. Resolve to pixel rects (using resolver)
3. Draw filled rectangles for leaves
4. Draw gap areas in different color
5. Overlay divider handles at split boundaries

### 3.4 Properties Panel Components

**Layout Defaults Panel:**
```
Gap Inner:    [SpinButton 0-50]
Gap Outer:    [SpinButton 0-50] or [L][R][T][B] spinners
Leaf Insets:  [SpinButton 0-50] or [L][R][T][B] spinners
```

**Selected Node Panel (Split):**
```
Type: Split
Direction: [ComboRow: Row | Column]
Gap Inner Override: [SpinButton] (optional)
Children: N (read-only)
```

**Selected Node Panel (Leaf):**
```
Type: Leaf
ID: [Entry] (editable, validated unique)
Size Spec:
  Kind: [ComboRow: frac | px | auto]
  Value: [SpinButton] (for frac/px)
  Min: [SpinButton] (optional)
  Max: [SpinButton] (optional)
Insets Override: [SpinButton] (optional)
Aspect Ratio: [SpinButton] (optional, 0 = none)
Tags: [Entry] (comma-separated)
```

### 3.5 Toolbar Actions

**Split Horizontal:** Split selected leaf/split into 2 children (row direction)
**Split Vertical:** Split selected leaf/split into 2 children (col direction)
**Delete:**
- If leaf with sibling: remove leaf, sibling takes space
- If split: merge children (requires confirmation)
**Add Leaf:** Add new leaf as sibling to selected node

---

## Phase 4: Data Flow & State Management

### 4.1 Editor State

```javascript
class LayoutEditorState {
    layout;           // Current layout JSON object
    selectedPath;     // Path to selected node, e.g., [0, 1] = root.children[0].children[1]
    isDirty;          // Has unsaved changes
    validationErrors; // Current validation errors
}
```

### 4.2 Operations

```javascript
// All operations return new layout object (immutable updates)
function splitNode(layout, path, direction) { ... }
function deleteNode(layout, path) { ... }
function updateNode(layout, path, updates) { ... }
function addSibling(layout, path) { ... }
```

### 4.3 Undo/Redo (stretch goal)
- History stack of layout states
- Ctrl+Z / Ctrl+Shift+Z bindings

---

## Phase 5: Integration

### 5.1 Save Flow
1. User clicks "Save"
2. Validate layout with `validateLayout()`
3. If invalid: show errors, prevent save
4. If valid:
   - Get current `custom-layouts` from settings
   - Add/update layout in array
   - Serialize to JSON string
   - Write to settings
   - Close dialog

### 5.2 Load Flow (in running extension)
1. Settings change signal fires
2. `LayoutManager.reload()` called
3. Parse `custom-layouts` JSON
4. Validate each layout
5. Add valid layouts to `_layouts` Map
6. Skip invalid with console warning

### 5.3 Live Preview (stretch goal)
- Show actual window thumbnails in canvas
- Preview how current windows would tile

---

## Phase 6: Polish

### 6.1 Preset Templates
When creating new layout, offer starting templates:
- Empty (single leaf)
- Two columns
- Three columns
- 2x2 grid
- Main + sidebar

### 6.2 Duplicate Layout
- Copy existing (preset or custom) as starting point
- Assign new unique ID/name

### 6.3 Keyboard Shortcuts
- Delete: Delete selected node
- H: Split horizontal
- V: Split vertical
- Escape: Cancel/close
- Ctrl+S: Save

### 6.4 Error Feedback
- Red border on invalid fields
- Error banner at top of dialog
- Tooltip with specific error message

---

## File Structure

```
snapkit@watkinslabs/
├── prefs.js                      # Modified: add custom layouts section
├── lib/
│   ├── layoutManager.js          # Modified: support full spec
│   ├── layoutValidator.js        # NEW: validate layout JSON
│   ├── layoutResolver.js         # NEW: resolve layout to rects
│   ├── layoutEditorDialog.js     # NEW: main editor dialog
│   ├── layoutEditorCanvas.js     # NEW: visual canvas widget
│   └── layoutEditorState.js      # NEW: editor state management
└── schemas/
    └── org.gnome.shell.extensions.snapkit.gschema.xml  # Verify custom-layouts key
```

---

## Implementation Order

1. **layoutValidator.js** - Can test independently
2. **layoutResolver.js** - Can test independently
3. **Update layoutManager.js** - Integrate resolver
4. **layoutEditorState.js** - State management
5. **layoutEditorCanvas.js** - Visual rendering
6. **layoutEditorDialog.js** - Compose components
7. **Update prefs.js** - Add UI to open editor
8. **Polish & testing**

---

## Technical Considerations

### GTK4 Drawing
- Use `Gtk.DrawingArea` with `set_draw_func()`
- Cairo context for drawing
- Handle `motion-notify-event` for hover
- Handle `button-press-event` for clicks

### Coordinate System
- Canvas widget has pixel size
- Layout uses 0-1 relative coords (for storage)
- Resolver produces pixel coords (for display)
- Mouse events need: pixel → relative conversion

### Prefs Dialog Limitations
- GNOME prefs run in separate process from extension
- Cannot directly call extension methods
- Communication via GSettings only
- Settings changes trigger extension reload

### Testing
- Test validator with sample JSON
- Test resolver with known layouts
- Manual testing of editor interactions
- Compare resolved rects with expected values

---

## Success Criteria

1. User can create new custom layout from prefs
2. Editor shows visual preview of layout structure
3. User can split zones horizontally/vertically
4. User can adjust zone sizes (frac/px)
5. User can set gaps and insets
6. Layout saves to settings correctly
7. Extension loads and uses custom layouts
8. Invalid layouts show clear error messages
9. Existing preset layouts continue to work

---

## Estimated Complexity

| Component | Complexity | Notes |
|-----------|------------|-------|
| Validator | Medium | Straightforward recursive validation |
| Resolver | High | Complex size distribution algorithm |
| Canvas | High | Custom GTK drawing + interaction |
| State mgmt | Medium | Immutable updates, path navigation |
| Dialog | Medium | Adwaita widgets composition |
| Prefs integration | Low | Add group + button |

---

## Open Questions

1. ~~Should divider positions persist as overrides (per LAYOUT.md 8.x)?~~ **YES - required for resize behavior**
2. Should we support drag-to-resize in the canvas or just property spinners?
3. Import/export: JSON file or clipboard?
4. Should presets be editable (as copies)?

---

## Critical Architecture: Layout-Driven Resize

### The Problem with Current TileManager

The current approach tries to calculate window-to-window edge matching:
```
Window A resized → Calculate delta → Adjust neighbor windows to match
```

This is fragile:
- Complex edge-matching calculations
- Accumulates rounding errors
- Doesn't understand layout structure
- Breaks with complex/nested layouts

### The Correct Approach: Layout as Source of Truth

```
Window A resized
  → Interpret as "divider moved"
  → Update divider position in override layer
  → Re-resolve entire layout
  → Re-snap ALL windows to their zones (including the one being resized)
```

### Why This Works

| Benefit | Explanation |
|---------|-------------|
| Single source of truth | Layout defines all positions, windows just follow |
| No inter-window math | Each window independently snaps to its zone |
| Deterministic | Same layout + overrides → same rects, always |
| Handles complexity | Works for nested splits, multiple neighbors |
| Persists user edits | Override layer stores divider adjustments |
| Self-correcting | Resized window gets snapped back to grid alignment |

### Implementation Flow

```
1. User drags Window A's right edge by +50px

2. TileManager.onWindowResized(windowA, newGeometry):
   - Look up windowA's assigned leaf_id ("left")
   - Find which divider borders that leaf's right edge
   - Calculate divider's new position based on drag delta

3. LayoutManager.updateDividerOverride(layoutId, dividerPath, newPosition):
   - Store in override layer (per LAYOUT.md Section 8)
   - Key: { layout_name, monitor_key, split_path, divider_index }

4. LayoutManager.resolveLayout(layoutId, workArea, overrides):
   - Apply overrides to layout before resolving
   - Return Map<leafId, { tileRect, windowRect }>

5. TileManager.reapplyAllTiledWindows():
   - For EVERY tracked window:
     - Get its leaf_id
     - Get windowRect from resolved layout
     - Apply rect to window (move + resize)
```

### Key Insight

**Don't calculate window-to-window relationships. Update the layout, then re-apply all zones.**

The layout is the schema. Windows are just rendered instances of that schema.

### Changes Required

| Component | Modification |
|-----------|--------------|
| `TileManager` | Map resize events → divider updates, call re-snap on all windows |
| `LayoutManager` | Add override layer, `updateDivider()`, `resolveWithOverrides()` |
| `layoutResolver` | Accept + apply overrides before size distribution |
| `lib/overrideStore.js` | **NEW** - Persist overrides to `~/.config/snapkit/overrides.json` |

### Override Storage (per LAYOUT.md 8.3)

```json
{
  "schema_version": 1,
  "overrides": [
    {
      "layout_name": "two_col",
      "monitor_key": "DP-1:3840x1600@1.0",
      "split_path": [],
      "child_sizes": [
        { "child_index": 0, "size": { "kind": "frac", "value": 1.3 } },
        { "child_index": 1, "size": { "kind": "frac", "value": 0.7 } }
      ]
    }
  ]
}
```

This means dragging a divider on your ultrawide persists, and next time you use that layout on that monitor, windows snap to your preferred split.

---

*Plan created: 2026-01-03*
*Updated: 2026-01-03 - Added layout-driven resize architecture*
