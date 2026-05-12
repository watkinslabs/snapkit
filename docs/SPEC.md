# SnapKit Product + Engineering Specification

This file is the authoritative build contract for SnapKit.  
If implementation disagrees with this document, this document wins.

## 1. Product goal

SnapKit provides Windows-style zone snapping for GNOME Shell:

1. User drags a window to the configured trigger edge.
2. Layout picker appears.
3. User drops into a specific zone.
4. Dropped window is placed into that zone.
5. Existing snapped windows are rearranged predictably.
6. Resizing one snapped window updates the layout and reflows all snapped windows in that layout without jitter.

## 2. Required UX behavior

### 2.1 Drag-to-zone flow (primary flow)

1. Snap target is the **actively dragged window**, not `focus_window`.
2. Layout picker must support **drop semantics** (not click-only semantics).
3. Zone under pointer is highlighted continuously during drag.
4. On drop, SnapKit snaps to highlighted zone on the **drop monitor**.
5. If no valid zone is highlighted on drop, no snap occurs.
6. During active drag, entering configured trigger edge must open/show the overlay reliably (not only when not dragging).
7. Once opened by drag, overlay remains visible for the entire drag lifecycle and only closes on successful drop or explicit cancel.
8. Overlay must visibly indicate the monitor's currently active layout template (selected template state), independent of transient hover highlights.

### 2.2 Zone occupancy + rearrangement

When dropping into an occupied zone, behavior is deterministic:

1. If source window was already snapped in same monitor/layout:
   - perform **strict zone swap** between source zone and target zone.
2. If source window was unsnapped or from another layout/monitor:
   - target zone gets dragged window;
   - displaced window goes to nearest available zone by index order;
   - if no free zone exists, use stable rotation starting at target zone+1.

There must never be two windows tracked for the same `(monitor, layoutId, zoneIndex)`.
Stacked windows from overlapping zone assignments are forbidden.

### 2.2.1 Drop population priority (required)

When a window is dropped into a template zone, zone assignment order is:

1. Dropped window goes to target zone.
2. Remaining zones are filled by other windows that are already snapped on that monitor (priority set).
3. If zones still remain, fill with other eligible normal windows on that monitor.
4. Stop when zones are full; windows beyond zone capacity are not assigned to a zone.

This priority rule applies to drag-drop template assignment and must never create stacked windows.

### 2.3 Divider resize behavior

1. Divider drag mode is configurable by `live-resize-updates`:
   - `true`: update divider ratios continuously while dragging.
   - `false`: update divider ratios only when drag stops (on release).
2. After ratio update, all windows in that `(monitor, layout)` are resnapped from the same resolved zone set.
3. During a single grab operation, SnapKit must use one authoritative resize engine.
4. Visual jitter is forbidden:
    - no conflicting resnap loops;
    - no repeated back-and-forth frame changes from competing handlers.

### 2.4 Keyboard behavior

1. Keyboard snap (`Super+Arrows`, etc.) snaps focused window to mapped zone.
2. Keyboard cycle layout updates monitor layout and resnaps all tracked windows on that monitor/layout.
3. Keyboard path and drag path must share the same snap/rearrangement invariants.

### 2.5 Keyboard zone movement (required, currently missing)

SnapKit must support moving a snapped/focused window between zones without using the mouse.

Required commands:

1. `move-window-zone-left`
2. `move-window-zone-right`
3. `move-window-zone-up`
4. `move-window-zone-down`
5. `move-window-zone-next`
6. `move-window-zone-prev`
7. `move-window-zone-1..9` (direct zone index where valid)

Behavior contract:

1. Works on focused normal window.
2. If window is already tracked in active `(monitor, layout)`, movement reassigns it to target zone using rearrangement policy in 2.2.
3. If window is not tracked, it is first snapped into active layout, then moved.
4. If target zone does not exist, command is a no-op with warning.
5. Keyboard zone movement must never create duplicate occupancy for same zone.

### 2.6 Dock edge configuration (required)

SnapKit edge trigger location is user-configurable:

1. `top`
2. `bottom`
3. `left`
4. `right`

Configuration contract:

1. Updating edge config recreates hot-edge actors immediately.
2. Picker docking position follows configured edge.
3. Trigger zone geometry updates for every monitor.
4. Config persists in GSettings and is restored on next session.
5. Defaults must be explicitly defined (see section 9.2).

### 2.7 Shake-to-cancel drag mode (required)

While dragging a window with snap preview active, user can shake horizontally to cancel snap mode.

Behavior contract:

1. Shake detection only applies during active drag preview.
2. When threshold is met, SnapKit immediately hides preview and returns to normal drag.
3. Cancel must not move or resize any window.
4. Cancel must leave state machine in `CLOSED` (or neutral drag state) with no leaked preview actors.
5. Feature is configurable and can be disabled.

Configuration contract:

1. `shake-enabled` (bool)
2. `shake-window-ms` (int, detection window)
3. `shake-min-delta` (int px)
4. `shake-direction-changes` (int count)

### 2.8 Window size-constraint handling (required)

Snap behavior must explicitly distinguish between windows that can resize and windows that cannot satisfy a target zone.

Classification:

1. **Non-resizable window**: window cannot be resized on one or both required axes for target zone fit.
2. **Resizable but constrained window**: window can resize, but minimum size hints prevent full fit inside target zone.

Behavior contract:

1. For non-resizable windows:
   - do not force geometry loops;
   - keep original window size;
   - place window deterministically at zone origin (top-left in logical coordinates);
   - mark placement as constrained and emit warning/event.
2. For resizable-but-constrained windows:
   - resize as close as possible to zone bounds while respecting size constraints;
   - if resulting size exceeds zone, allow deterministic overflow clipped by work area;
   - never jitter between competing sizes.
3. Constraint handling must be identical for drag, keyboard snap, and resnap-after-divider paths.
4. Constraint decisions must never crash shell or leave tracker maps inconsistent.

## 3. State machine contract

Extension states:

1. `CLOSED`
2. `OPEN`
3. `SELECT_WINDOW`
4. `DRAG_MODE`

Rules:

1. Invalid transitions are ignored with warning (never crash shell).
2. `DRAG_MODE` owns drag-preview lifecycle.
3. On drag end/cancel, preview is fully cleaned and state returns to `CLOSED`.

## 4. Monitor + layout resolution contract

1. Monitor for drag/drop operations is computed from pointer position at decision time (drop time), not cached from drag start.
2. Layout resolution always uses:
   - active layout for monitor (`LayoutState`),
   - current overrides for `(layoutId, monitor)`,
   - current monitor work area.
3. Any missing layout/monitor condition must fail safely with warning, never exception propagation to shell.

## 5. Data model and invariants

### 5.1 Tracking invariants

`WindowTracker` must maintain a bijection between:

1. `window -> {monitor, layoutId, zoneIndex}`
2. `(monitor, layoutId, zoneIndex) -> window`

On any new track assignment:

1. old mapping for that window is removed,
2. old mapping for that target zone is removed/reassigned,
3. maps remain consistent.

### 5.2 Persisted settings

Schema: `org.gnome.shell.extensions.snapkit`

Required persisted keys:

1. appearance keys
2. behavior keys (including trigger edge/docking, drag behavior flags, shake config)
3. keybindings (`as`), including zone movement commands
4. `default-layout`, `per-monitor-layouts`
5. `custom-layouts`
6. `divider-overrides`
7. shake config keys (`shake-enabled`, `shake-window-ms`, `shake-min-delta`, `shake-direction-changes`)
8. `migrated-from-turtle` (internal migration guard)

### 5.3 Migration

1. On first SnapKit run only, migrate matching keys from `org.gnome.shell.extensions.turtle`.
2. Set `migrated-from-turtle=true` after migration attempt.
3. Migration must be idempotent and safe if legacy schema is absent.

## 6. Architecture + ownership

Layers:

1. Core: `EventBus`, `ServiceContainer`, `ComponentManager`, `Logger`
2. State: extension + drag/select state
3. Layout: validator/resolver/manager/overrides
4. Tiling: monitor tracking, window tracking, snap + resize sync
5. Overlay/UI: picker + preview + editors
6. Controller: lifecycle and event wiring

Ownership rules:

1. One component owns divider sync logic (single source of truth).
2. Controller wires events only; core geometry logic lives in tiling/layout components.
3. Runtime debug output goes through `Logger`, not ad-hoc `console.log`.
4. Preferences must have one canonical write path to GSettings; duplicate preference subsystems are forbidden unless one is explicitly read-only.
5. Preference key names used by UI, schema, controller, and runtime handlers must match exactly (no alias drift).

## 7. Event contract

Required events (minimum):

1. `request-open-overlay`, `request-close-overlay`
2. `request-snap-preview`, `update-snap-preview`, `request-snap-to-zone`
3. `cancel-snap-preview`, `window-drag-shake`
4. `zone-snapped`, `layout-switched`, `divider-moved`
5. `keyboard-snap-window`, `keyboard-cycle-layout`, `keyboard-move-window-zone`

Event payloads must include monitor/layout/zone/window fields needed to avoid implicit global lookups.

Required payload schemas:

1. `request-snap-to-zone`: `{ window, monitorIndex, position }`
2. `zone-snapped`: `{ window, monitorIndex, layoutId, zoneIndex }`
3. `divider-moved`: `{ monitorIndex, layoutId, path, ratio }`
4. `keyboard-move-window-zone`: `{ window, monitorIndex, layoutId, command, targetZoneIndex? }`
5. `window-drag-shake`: `{ window, position, timestamp }`

## 8. Reliability + performance requirements

1. No uncaught exceptions in signal handlers.
2. All connected signals/sources/actors are disconnected and destroyed on disable/destroy.
3. Resizing 3+ snapped windows must feel continuous (no oscillation).
4. No polling loops except bounded drag pointer sampling needed for GNOME API gaps.
5. All fallback behavior must log explicit warnings.

## 9. Build, install, launch interface

Canonical commands:

1. `make build` → release zip
2. `make install` → install extension locally
3. `make enable` / `make disable`
4. `make dev` or `make launch` → nested manual test shell

Package format:

`build/snapkit@watkinslabs.v<version>.shell-extension.zip`

## 9.1 Rebuild-from-scratch implementation map

A clean-room reimplementation must include these modules and responsibilities:

1. **Extension entrypoint**: GNOME lifecycle (`enable/disable`), fatal-error guard.
2. **Controller**: DI wiring, event subscriptions, state orchestration, settings load/save.
3. **State**: extension state machine + drag/select/layout state stores.
4. **Layout system**: built-in registry, custom layout import/export, BTree resolver, validator.
5. **Tracking system**: window/zone bijection store with strict invariant enforcement.
6. **Snap engine**: resolve zones, apply geometry, track assignments, resnap groups.
7. **Divider engine**: convert resize gestures to ratio overrides; single resize authority.
8. **Interaction**: drag detector, keyboard manager, mouse hot-edge manager.
9. **UI overlays**: picker bar, snap preview, optional editor/switcher surfaces.
10. **Persistence**: GSettings schema + one-time migration from Turtle.

## 9.2 Required default configuration values

Defaults are normative:

1. `trigger-edge = top`
2. `enable-edges = true`
3. `enable-corners = true`
4. `edge-size = 2`
5. `corner-size = 10`
6. `debounce-delay = 100`
7. `default-layout = grid-2x2`
8. `default-margin = 0`
9. `default-padding = 4`
10. `remember-per-workspace = false`
11. `shake-enabled = true`
12. `shake-window-ms = 500`
13. `shake-min-delta = 35`
14. `shake-direction-changes = 4`
15. `live-resize-updates = true`

## 9.3 Keyboard command set (normative)

Global commands:

1. Toggle overlay
2. Snap left/right/up/down
3. Snap top-left/top-right/bottom-left/bottom-right
4. Cycle layout
5. Move window zone left/right/up/down
6. Move window zone next/prev
7. Move window to zone N (1..9 where zone exists)

## 9.4 GSettings schema specification (normative)

All keys are required unless marked optional.  
Type, default, and constraints are part of the contract.

| Key | Type | Default | Constraints / Notes |
|---|---|---|---|
| `trigger-edge` | `s` | `top` | one of: `top`, `bottom`, `left`, `right` |
| `enable-edges` | `b` | `true` | enables hot-edge triggers |
| `enable-corners` | `b` | `true` | enables corner triggers |
| `edge-size` | `i` | `2` | range `1..10` |
| `corner-size` | `i` | `10` | range `5..30` |
| `debounce-delay` | `i` | `100` | range `0..300` ms |
| `auto-snap-on-drag` | `b` | `true` | drag drop snaps on release |
| `focus-window-on-snap` | `b` | `true` | focus target after snap |
| `restore-on-unsnap` | `b` | `true` | restore prior window size |
| `drag-zone-modifier-disables-zones` | `b` | `true` | `true` = modifier temporarily disables zones, `false` = zones are inactive unless modifier is held |
| `drag-zone-modifier-key` | `s` | `control` | one of: `control`, `shift`, `alt`, `super` |
| `live-resize-updates` | `b` | `true` | `true` = live updates while dragging, `false` = apply on release |
| `shake-enabled` | `b` | `true` | enables shake-to-cancel during drag |
| `shake-window-ms` | `i` | `500` | shake detection window (ms) |
| `shake-min-delta` | `i` | `35` | minimum horizontal delta per shake sample (px) |
| `shake-direction-changes` | `i` | `4` | direction changes required to trigger cancel |
| `toggle-overlay` | `as` | `['<Super>space']` | array of accel strings |
| `snap-left/right/up/down` | `as` | schema defaults | accel strings |
| `snap-topleft/topright/bottomleft/bottomright` | `as` | schema defaults | accel strings |
| `cycle-layout` | `as` | `['<Super><Control>space']` | accel strings |
| `navigate-up/down/left/right` | `s` | `Up/Down/Left/Right` | overlay navigation keys in shipped schema |
| `select-zone` | `s` | `Return` | overlay select key in shipped schema |
| `cancel` | `s` | `Escape` | overlay cancel key in shipped schema |
| `move-window-zone-left/right/up/down` | `as` | required | target contract; currently not present in shipped schema v1 |
| `move-window-zone-next/prev` | `as` | required | target contract; currently not present in shipped schema v1 |
| `move-window-zone-1..9` | `as` | optional recommended | target contract; currently not present in shipped schema v1 |
| `default-layout` | `s` | `grid-2x2` | must map to existing layout ID |
| `default-margin` | `i` | `0` | range `0..20` |
| `default-padding` | `i` | `4` | range `0..20` |
| `remember-per-workspace` | `b` | `false` | workspace-specific layout memory |
| `per-monitor-layouts` | `s` | `'{}'` | JSON object: `monitorIndex -> layoutId` |
| `custom-layouts` | `s` | `'{}'` | JSON object/array of custom layouts |
| `divider-overrides` | `s` | `'{}'` | JSON overrides keyed by layout+monitor |
| `zone-bg-color` | `s` | schema default | parseable RGBA string |
| `zone-border-color` | `s` | schema default | parseable RGBA string |
| `zone-highlight-color` | `s` | schema default | parseable RGBA string |
| `active-layout-border-color` | `s` | schema default | active template outline color in picker |
| `active-layout-text-color` | `s` | schema default | active template label color in picker |
| `border-width` | `i` | `2` | range `1..5` |
| `zone-label-size` | `i` | `24` | range `16..48` |
| `show-zone-numbers` | `b` | `true` | toggle zone labels in overlay |
| `overlay-opacity` | `d` | `0.95` | range `0.5..1.0` |
| `enable-animations` | `b` | `true` | animation toggle |
| `animation-speed` | `i` | `200` | range `100..500` ms |
| `migrated-from-turtle` | `b` | `false` | internal one-time migration flag |

Validation rules:

1. Invalid enum/range values must be clamped/reset to schema-safe values.
2. Invalid JSON in string keys must be rejected with warning and replaced by safe empty structure.
3. Unknown layout IDs in persisted state must fall back to `default-layout`.
4. Keybinding keys must always be read/written as `strv` (`as`), never plain string APIs.

### 9.4.1 Current extension settings inventory (implemented today)

Source of truth for shipped keys is:

1. `snapkit@watkinslabs/schemas/org.gnome.shell.extensions.snapkit.gschema.xml`
2. `snapkit@watkinslabs/prefs.js` (GNOME Settings app bindings)

In-shell preference modules currently maintain an additional runtime settings model (camelCase) that is not yet fully persisted via GSettings:

1. `AppearancePreferences`: `zoneBgColor`, `zoneBorderColor`, `zoneHighlightColor`, `activeLayoutBorderColor`, `activeLayoutTextColor`, `borderWidth`, `animationSpeed`, `enableAnimations`, `overlayOpacity`, `zoneLabelSize`, `showZoneNumbers`
2. `BehaviorPreferences`: `edgeSize`, `cornerSize`, `enableEdges`, `enableCorners`, `debounceDelay`, `toggleOverlay`, `navigateUp`, `navigateDown`, `navigateLeft`, `navigateRight`, `selectZone`, `cancel`, `autoSnapOnDrag`, `focusWindowOnSnap`, `restoreOnUnsnap`, `shakeEnabled`, `shakeWindowMs`, `shakeMinDelta`, `shakeDirectionChanges`
3. `LayoutPreferences`: `defaultLayout`, `defaultMargin`, `defaultPadding`, `rememberPerWorkspace`, `perMonitorLayouts`

Parity requirement:

1. Any runtime setting that affects behavior must either map to a persisted schema key or be explicitly documented as session-only.
2. Session-only settings are not release-compliant for core behavior features.

## 9.5 Configuration UX specification (normative)

### 9.5.1 Preferences information architecture

Preferences UI must include these pages:

1. **Behavior**: edge/corner triggers, debounce, snap behavior toggles.
2. **Keyboard**: all global and zone-move keybindings.
3. **Layouts**: default layout, spacing, per-workspace option.
4. **Appearance**: zone colors, border, opacity, labels, animation.
5. **Advanced/Data**: import/export/reset controls with confirmation.

Consistency contract:

1. If both GNOME preferences and in-shell settings UI exist, both must read/write the same canonical keys.
2. A setting changed in either UI must appear in the other without semantic translation differences.
3. If one UI is deprecated, spec and README must explicitly mark supported UI as canonical.

### 9.5.2 User safety and recoverability

1. Every destructive action (reset/import overwrite) requires confirmation.
2. A one-click “Reset to defaults” is required and must restore schema defaults.
3. Import failures must show explicit error text (invalid JSON, unknown fields, schema mismatch).
4. Export must write to a deterministic default folder and show resulting file path.

### 9.5.3 Keybinding editor behavior

1. Captures and writes accelerators in GNOME-compatible format.
2. Detects conflicts between SnapKit shortcuts before saving.
3. Allows clear/unset per command.
4. Shows effective command label for every keybinding.

### 9.5.4 Ease-of-use requirements

1. Out-of-box defaults must work without opening settings.
2. First successful drag/drop should require no prior tutorial.
3. Settings changes affecting triggers/docking apply live (no shell restart required).
4. Controls must have inline descriptions with practical effect, not internal jargon.
5. Invalid user input must never break snapping; app must degrade safely and visibly.
6. Shake-to-cancel sensitivity must be understandable and user-adjustable without editing files.

### 9.5.5 Accessibility and discoverability

1. All actionable controls are keyboard reachable in preferences.
2. Visual focus state is visible for interactive controls.
3. Zone numbering and labels are optional and configurable for clarity.
4. Keyboard commands must be listed in preferences and in README quick reference.
5. Shake-to-cancel toggle and sensitivity controls must be discoverable in Behavior settings.

## 10. Release acceptance criteria (must pass)

1. Drag a window to trigger edge, drop in zone, and window lands in dropped zone.
2. Dropping into occupied zone performs deterministic rearrangement (no overlap/stale mapping).
3. Resizing snapped window updates all linked windows in layout with no jitter.
4. Cross-monitor drag/drop snaps on drop monitor.
5. Keyboard snap and cycle behave consistently with drag flow.
6. Keyboard zone movement works for directional, next/prev, and direct-index commands.
7. Trigger edge docking is configurable to top/bottom/left/right and updates live.
8. Disable/enable cycles do not leak actors/signals or crash shell.
9. Existing Turtle users retain prior settings via one-time migration.
10. Shake gesture cancels drag-preview reliably without unintended snap/move side effects.
11. Non-resizable windows are handled deterministically without snap loops or crashes.
12. Constrained-but-resizable windows settle to stable best-fit geometry without jitter.
13. Resize mode flag works: live updates when enabled, release-only updates when disabled.
14. Dragging a snapped window into an occupied zone swaps the two windows (no stacking).
15. Dragging into trigger edge opens overlay during drag and allows drop-to-zone flow.
16. On drop, zones are populated in priority order: dropped window, then snapped windows, then other windows until full.
17. Overlay always shows the currently active template as a persistent selected state while visible.

Completion gate:

1. No feature, fix, or release item may be marked "done" until the full validation suite passes.
2. "Full validation suite" means:
   - automated checks (unit tests, schema/build validation), and
   - manual UX validation scenarios for drag/drop, resize reflow, cross-monitor behavior, keyboard paths, and settings persistence.
3. If any required validation scenario is untested or failing, status remains "in progress" or "blocked" (never "done").

## 11. Adversarial gap checklist (must be closed before release)

This section captures high-risk failures identified by spec-vs-code analysis.  
A release is blocked if any item below is unresolved.

1. **Drop semantics gap**: snapping must operate on dragged window at drop-time monitor; focus-based click snapping is non-compliant.
2. **Resize authority gap**: divider updates and resize resnaps must have one owner per grab interaction; competing handlers causing oscillation are non-compliant.
3. **Tracker invariant gap**: reassignment into occupied zones must preserve strict window↔zone bijection with no stale reverse mappings.
4. **Keyboard move-zone gap**: schema keys, keybinding registration, command dispatch, and reassignment behavior must all exist together; partial implementations are non-compliant.
5. **Config parity gap**: settings UI(s), schema, and controller application paths must use the same key set and types (`as`/`strv` correctness required).
6. **Docking config gap**: edge changes must recreate triggers and picker position live on all monitors; restart-only behavior is non-compliant.
7. **Shake cancel gap**: shake detection must be configurable and cancel preview without side effects; hidden hardcoded thresholds are non-compliant.
8. **Lifecycle safety gap**: disable/reenable must not leak signals, actors, timers, or event subscriptions.
9. **Constraint handling gap**: non-resizable vs constrained-resizable windows must follow explicit deterministic placement rules across all snap paths.

## 12. Spec-vs-code audit matrix (current implementation snapshot)

Status legend: **implemented** / **partial** / **missing**.

| Requirement area | Status | Evidence (current code) | Gap to close |
|---|---|---|---|
| Drag target must be actively dragged window (not focus window) | **missing** | `src/ui/layoutPickerBar.js` uses `global.display.focus_window` in `_onZoneClicked` | Replace click/focus path with dragged-window drop binding |
| Drop-time monitor selection | **partial** | Picker uses stored `_monitorIndex` set on `show()` (`src/ui/layoutPickerBar.js`) | Resolve monitor from pointer/window at drop decision time |
| Deterministic zone occupancy + bijection | **partial** | `WindowTracker.trackWindow()` untracks only source window, then overwrites `_zoneToWindow` key (`src/tiling/windowTracker.js`) | Add explicit occupied-zone displacement/reassignment and map consistency enforcement |
| Single resize authority/no jitter | **missing** | `TileManager` listens to `size-changed` (`src/tiling/tileManager.js`) while `DividerSyncManager` handles `grab-op-*` and resnaps (`src/tiling/dividerSyncManager.js`) | Gate resize flow so one owner handles each grab interaction |
| Keyboard move-window-zone commands | **missing** | No move-zone bindings in `KeybindingManager` (`src/interaction/keybindingManager.js`); no handler subscription in `ExtensionController` | Add schema keys + registration + dispatch + reassignment logic |
| Dock edge configurability and live trigger recreation | **implemented** | `MouseHandler.updateConfig()` validates `triggerEdge` and recreates edge actors live (`src/interaction/mouseHandler.js`) | Expose full config controls consistently in canonical prefs UI |
| Shake-to-cancel configurable in persisted settings | **missing** | Runtime behavior prefs model has shake fields (`src/preferences/behaviorPreferences.js`), but schema lacks shake keys (`schemas/*.gschema.xml`) | Add schema keys + persistence + runtime wiring |
| Size-constraint handling (non-resizable vs constrained) | **partial** | `SnapHandler` clamps via min/max size hints (`src/tiling/snapHandler.js`) | Add explicit classification, deterministic placement policy, and emitted constrained-placement signal |
| Settings parity across schema/UI/controller | **partial** | GNOME prefs use GSettings (`prefs.js`), in-shell prefs keep separate runtime models (`src/preferences/*.js`) | Unify canonical key path and remove semantic drift |
| Event contract coverage (`keyboard-move-window-zone`, `window-drag-shake`) | **missing** | `ExtensionController` wires snap/cycle/cancel events only; no move-zone/shake event handling | Add missing events, payload contracts, and handlers |
| Validation gate (unit + validation command) | **partial** | `Makefile` has `test` and `validate` targets | Implement test files and validation script + scenario runner |
