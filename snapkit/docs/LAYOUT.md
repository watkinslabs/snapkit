# Snap-to-Grid Layout Spec (GNOME Shell Extension)
Version: 1.0 (schema_version = 1)

This document defines the on-disk (and in-memory) spec for "LAYOUTS" ... declarative subdivisions of a monitor/workarea into snap targets ... plus the deterministic rules for resolving layouts into rectangles, snapping windows, and editing divider positions.

The goal is to remove all hardcoded layout structures and make the system data-driven.

---

## 0. Terms

- **work_area**: The usable rectangle for a monitor/workspace after panels, docks, reserved struts, etc.
- **layout**: A declarative tree that subdivides a work_area into **tiles** (leaf nodes).
- **tile**: A leaf rectangle computed by resolving a layout.
- **window_rect**: The rectangle actually applied to a window (tile rect minus insets, plus optional aspect-fit).
- **split**: A container node that divides its rectangle among children.
- **divider**: The boundary between adjacent children in a split ... user can drag it.
- **gap**: Space between siblings and/or around container edges (split-level concept).
- **insets**: Padding inside a tile used when applying window_rect (leaf-level concept).

---

## 1. File Types and Storage

### 1.1 Layout files
- Stored as JSON.
- Recommended path:
  - `~/.config/<project_name>/layouts/*.json`
- Layout name is derived from `layout.name` and must be unique.

### 1.2 Rulesets (optional)
Rulesets map apps to preferred tile ids. They are separate from layout geometry.
- Recommended path:
  - `~/.config/<project_name>/rulesets/*.json`

### 1.3 Profiles (optional)
Profiles select which layout/ruleset to use per monitor/workspace.
- Recommended path:
  - `~/.config/<project_name>/profiles.json`

### 1.4 Runtime overrides (divider edits)
Dragging dividers must not mutate the base layout file by default.
Persist edits as an override layer:
- `~/.config/<project_name>/overrides.json`

Overrides are keyed by:
- `layout_name`
- `monitor_key` (see 8.2)
- optional `workspace_key`

---

## 2. Coordinate System and Rounding

### 2.1 Rect
All rectangles are integer pixel coordinates:

- `x`, `y` are top-left
- `w`, `h` are width and height
- `w >= 0`, `h >= 0`

### 2.2 Rounding
When a split produces fractional sizes, resolve deterministically:
- Compute ideal sizes in float.
- Floor each child size.
- Distribute remaining pixels (due to flooring) to children in stable order (left-to-right or top-to-bottom).

Stable order is the children array order.

---

## 3. Layout JSON Schema (v1)

### 3.1 Root object
```json
{
  "schema_version": 1,
  "name": "two_col",
  "description": "Optional",
  "defaults": {
    "gap_inner": 12,
    "gap_outer": { "l": 12, "r": 12, "t": 12, "b": 12 },
    "leaf_insets": { "l": 8, "r": 8, "t": 8, "b": 8 },
    "aspect_policy": "fit"
  },
  "root": { "...node..." }
}
````

Required:

* `schema_version` (must be 1)
* `name` (string, unique)
* `root` (node)

Optional:

* `description`
* `defaults`

### 3.2 Insets object

Insets can be integer or per-edge object:

* integer means all edges equal

Valid forms:

```json
12
```

or

```json
{ "l": 12, "r": 12, "t": 12, "b": 12 }
```

### 3.3 Node types

#### 3.3.1 Split node

```json
{
  "type": "split",
  "dir": "row",
  "gap_inner": 12,
  "gap_outer": 8,
  "children": [
    { "...node..." },
    { "...node..." }
  ]
}
```

Required:

* `type` = "split"
* `dir` = "row" | "col"
* `children` array length >= 2

Optional:

* `gap_inner` (int >= 0) ... overrides default
* `gap_outer` (insets) ... overrides default

#### 3.3.2 Leaf node

```json
{
  "type": "leaf",
  "id": "left",
  "size": { "...size_spec..." },
  "insets": 8,
  "aspect": { "ratio": 1.0, "policy": "fit" },
  "tags": ["primary"]
}
```

Required:

* `type` = "leaf"
* `id` (string, unique within layout)

Optional:

* `size` (size_spec) ... only meaningful as a child of a split
* `insets` (insets) ... overrides default leaf_insets
* `aspect` (aspect_spec) ... see 5
* `tags` (array of strings) ... for snapping UI and rulesets

---

## 4. Size Spec (how children share space in a split)

Size spec is attached to a child node via `child.size`.

```json
{ "kind": "frac", "value": 1, "min_px": 200, "max_px": 900, "priority": 0 }
```

### 4.1 kind

* `frac` ... weighted fraction of remaining space
* `px` ... fixed pixels along the split axis
* `auto` ... synonym for `frac` with value = 1

### 4.2 fields

* `value`:

  * for `frac`: weight (int or float > 0)
  * for `px`: pixel size (int >= 0)
* `min_px` (int >= 0) ... clamp along split axis
* `max_px` (int >= 0) ... clamp along split axis
* `priority` (int) ... lower priority shrinks first when over-constrained

If a child has no `size`, treat as `{ "kind": "frac", "value": 1 }`.

---

## 5. Aspect Spec (leaf-level, affects window_rect)

```json
{ "ratio": 1.0, "policy": "fit" }
```

* `ratio` = width / height (float > 0)
* `policy`:

  * `fit` ... keep tile bounds fixed, shrink window_rect inside to match ratio (letterbox)
  * `none` ... ignore ratio

Only `fit` and `none` are required for v1.

---

## 6. Layout Resolution Algorithm

Input:

* work_area rect (x, y, w, h)
* layout root node
* optional override layer (see 8)

Output:

* map: `leaf_id -> tile_rect`
* map: `leaf_id -> window_rect`

### 6.1 Resolve node(rect, node)

#### 6.1.1 If node is leaf

* tile_rect = rect
* window_rect = apply_insets(tile_rect, leaf_insets)
* window_rect = apply_aspect_fit(window_rect, aspect_spec) if policy == "fit"
* return (tile_rect, window_rect)

#### 6.1.2 If node is split

Given split_rect = rect:

1. outer = split.gap_outer if present else layout.defaults.gap_outer else 0
2. inner = split.gap_inner if present else layout.defaults.gap_inner else 0
3. usable_rect = apply_insets(split_rect, outer)
4. axis_len = usable_rect.w if dir == "col" else usable_rect.h
5. cross_len = usable_rect.h if dir == "col" else usable_rect.w
6. total_inner_gaps = inner * (child_count - 1)
7. axis_available = max(0, axis_len - total_inner_gaps)

Allocate child axis sizes:

* classify children into px_children and frac_children

Allocation steps (deterministic):
A) Initialize desired sizes:

* px child: desired = size.value
* frac child: desired = proportional later

B) Clamp px children:

* clamp desired by min_px/max_px if present

C) Compute remaining:

* remaining = axis_available - sum(px_desired)

D) Distribute remaining among frac children:

* if no frac children:

  * remaining is ignored (all leftover becomes extra whitespace at the end)
* else:

  * weight_sum = sum(frac.value)
  * for each frac: desired = remaining * (value / weight_sum)

E) Clamp frac children by min_px/max_px:

* clamp each frac desired
* if clamping changes totals, re-balance remaining among unclamped frac children
* iterate at most child_count times

F) Over-constraint handling (when sum(desired) > axis_available):

* shrink order:

  1. shrink frac children first (respect min_px, priority)
  2. then shrink px children if allowed (respect min_px, priority)
* if still impossible, allow violating min_px by truncating in stable order (last resort)

G) Rounding:

* floor all desired sizes
* distribute leftover pixels due to rounding in stable order

Finally compute child rects:

* walk children in order, accumulating offset along axis
* between children add inner gap

Recurse into each child with its rect.

---

## 7. Snapping Behavior

### 7.1 Snap targets

Snap targets are leaf tile_rects (not window_rects). This keeps snapping stable even if insets/aspect-fit change.

### 7.2 Snap selection

Given a moving window_rect (or pointer position), choose a leaf id using one strategy (implement at least one):

Strategy A: pointer-based

* choose leaf whose tile_rect contains the pointer
* if none, choose closest by distance to rect center

Strategy B: overlap-based

* compute intersection area between current window rect and each tile_rect
* choose max intersection
* tie-break by distance to tile center

### 7.3 Applying snap

When snapping a window to a leaf:

* compute current resolved window_rect for that leaf
* apply move/resize to that window_rect

---

## 8. Divider Dragging and Overrides

Dragging modifies sibling sizing within a split instance.

### 8.1 Divider identity

A divider is identified by:

* path to split node (array of child indices from root)
* divider_index = i (divider between children i and i+1)

Example path:

* `split_path`: [0, 1] means root.children[0].children[1] is the split being edited.

### 8.2 Monitor key

Use a stable monitor_key for overrides:

* prefer GNOME monitor connector + vendor/model + serial if available
* fallback to geometry: `widthxheight@scale` plus position

Example:

* `monitor_key`: "DP-1:3840x1600@1.0"

### 8.3 Override JSON

```json
{
  "schema_version": 1,
  "overrides": [
    {
      "layout_name": "two_col",
      "monitor_key": "DP-1:3840x1600@1.0",
      "workspace_key": "any",
      "split_path": [ ],
      "child_sizes": [
        { "child_index": 0, "size": { "kind": "frac", "value": 1.3 } },
        { "child_index": 1, "size": { "kind": "frac", "value": 0.7 } }
      ]
    }
  ]
}
```

Apply overrides before resolution:

* locate split node by split_path
* update specified children.size entries

### 8.4 Drag rules (edit policy)

When dragging divider between child A and B:

* compute delta in pixels along axis
* update sizes according to kinds:

Case 1: both frac

* convert both to a temporary pixel basis:

  * px_a = resolved_size_a
  * px_b = resolved_size_b
  * px_a += delta
  * px_b -= delta
  * clamp by min/max
* convert back to frac weights:

  * new_weight_a = max(eps, px_a)
  * new_weight_b = max(eps, px_b)
  * store as frac weights (optionally normalized)

Case 2: A is px, B is frac (or auto)

* px_a += delta (clamp)
* store A as px, B unchanged

Case 3: both px

* px_a += delta (clamp)
* px_b -= delta (clamp)
* if conflict, clamp one then clamp the other

Always:

* after editing, re-resolve the layout and re-apply affected window rects if you support live preview.

---

## 9. Rulesets (optional, separate from layouts)

Ruleset schema:

```json
{
  "schema_version": 1,
  "name": "dev_rules",
  "rules": [
    { "match": { "app_id": "org.gnome.Terminal" }, "prefer_leaf": "left" },
    { "match": { "wm_class": "code" }, "prefer_leaf": "right" }
  ],
  "fallback": { "strategy": "first_available" }
}
```

Match fields (support any subset):

* `app_id` (Wayland stable app id)
* `wm_class` (X11 / XWayland class)
* `title_regex`
* `role`

Rule evaluation:

* first match wins
* if prefer_leaf not present or leaf missing, fallback applies

Fallback strategies:

* `first_available` ... first leaf in layout traversal order
* `largest` ... leaf with largest area
* `last_used` ... last leaf used on this monitor/workspace

---

## 10. Profiles (optional)

Profile selects layout and ruleset per monitor/workspace:

```json
{
  "schema_version": 1,
  "profiles": [
    {
      "name": "default",
      "monitor_match": { "primary": true, "min_width": 2500 },
      "workspace_match": { "any": true },
      "layout_name": "two_col",
      "ruleset_name": "dev_rules"
    }
  ]
}
```

Matching:

* profiles are evaluated in order
* first match wins
* if none match, use a compiled-in safe default layout name

---

## 11. Validation Rules

On load, validate:

* schema_version supported
* layout.name non-empty, unique
* leaf ids unique within a layout
* split children length >= 2
* gap values >= 0
* size kinds valid
* min_px <= max_px if both exist
* aspect ratio > 0

If invalid:

* log error
* skip file
* continue loading others
* if no valid layouts, fall back to a minimal built-in layout:

  * one leaf filling work_area

---

## 12. Examples

### 12.1 Two equal columns with gaps

```json
{
  "schema_version": 1,
  "name": "two_col",
  "defaults": { "gap_inner": 12, "gap_outer": 12, "leaf_insets": 8 },
  "root": {
    "type": "split",
    "dir": "col",
    "children": [
      { "type": "leaf", "id": "left",  "size": { "kind": "frac", "value": 1 } },
      { "type": "leaf", "id": "right", "size": { "kind": "frac", "value": 1 } }
    ]
  }
}
```

### 12.2 Sidebar fixed px, main auto

```json
{
  "schema_version": 1,
  "name": "sidebar_main",
  "defaults": { "gap_inner": 12, "gap_outer": 12, "leaf_insets": 8 },
  "root": {
    "type": "split",
    "dir": "col",
    "children": [
      { "type": "leaf", "id": "sidebar", "size": { "kind": "px", "value": 420, "min_px": 300, "max_px": 520 } },
      { "type": "leaf", "id": "main",    "size": { "kind": "auto" } }
    ]
  }
}
```

### 12.3 Four tiles, windows fit to squares

```json
{
  "schema_version": 1,
  "name": "four_square_fit",
  "defaults": { "gap_inner": 12, "gap_outer": 12, "leaf_insets": 8 },
  "root": {
    "type": "split",
    "dir": "col",
    "children": [
      {
        "type": "split",
        "dir": "row",
        "children": [
          { "type": "leaf", "id": "tl", "aspect": { "ratio": 1.0, "policy": "fit" } },
          { "type": "leaf", "id": "bl", "aspect": { "ratio": 1.0, "policy": "fit" } }
        ]
      },
      {
        "type": "split",
        "dir": "row",
        "children": [
          { "type": "leaf", "id": "tr", "aspect": { "ratio": 1.0, "policy": "fit" } },
          { "type": "leaf", "id": "br", "aspect": { "ratio": 1.0, "policy": "fit" } }
        ]
      }
    ]
  }
}
```

---

## 13. Implementation Notes (GNOME Shell Extension)

* Resolve layouts using the monitor's work_area (not full monitor geometry).
* Cache resolved leaf rects per (monitor, workspace, layout_name) and invalidate on:

  * monitor config change
  * work_area change (panel/dock)
  * layout file change
  * override change
* Snapping should operate on tile_rect, application should use window_rect.

---

## 14. Required Deliverables for the Agent Building This

1. JSON loader + validator for layouts, rulesets, profiles, overrides.
2. Deterministic resolver that outputs:

   * leaf_id -> tile_rect
   * leaf_id -> window_rect
3. Snapping function:

   * pick leaf_id given pointer or window rect
   * apply resize/move to window_rect
4. Divider drag handler:

   * identify split + siblings
   * update override sizes
   * live re-resolve preview
   * persist override

---

## 15. Non-Goals for v1

* Global constraint solving where aspect constraints push siblings (grow policy)
* Arbitrary polygon tiles
* Nested tab/stack container semantics (can be added later as new node type)

End.

```
