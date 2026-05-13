# SnapKit

![SnapKit icon preview](snapkit@watkinslabs/src/assets/icon_preview.png)

SnapKit is a GNOME Shell extension that gives you Windows-style window snapping with a configurable layout picker, visual zones, and a binary-tree layout model that handles arbitrary splits.

The point is to make window placement quick. Drag a window toward your trigger edge, hover the zone you want, drop. Or focus a window and tap a Super-arrow shortcut. Or click a layout in the picker with no window focused, and SnapKit will use that layout for the next thing you snap on that monitor.

## What's in the box

- A GNOME Shell extension named `snapkit@watkinslabs`.
- A layout picker bar that docks to a configurable edge (`top`, `bottom`, `left`, or `right`).
- Drag-to-zone snapping for normal application windows.
- Click-to-snap from the picker for the focused window. With no focused window, clicking a layout makes it the active layout for that monitor.
- Global keyboard shortcuts for halves, quarters, layout cycling, and zone-to-zone movement.
- Built-in layouts: full screen, 2x2, 3x3, halves, quarters, thirds, focus layouts, triple columns, and triple rows.
- A real Adw modal layout editor in the preferences window. Click a zone in the canvas, split it horizontally or vertically, drag (or type) the zone-size percentage, merge zones back, save. Layouts persist as JSON in GSettings and reload live.
- Per-monitor layout assignments and an enable/disable switch on every layout (built-in or custom) so you can hide the layouts you don't use.
- BTree layout resolution with persisted divider overrides for windows that get manually resized after snapping.

## Requirements

- GNOME Shell 45, 46, 47, or 48.
- `gnome-extensions`
- `glib-compile-schemas`
- `zip` for release packages

Verify the build host has them all:

```bash
make check-deps
```

## Install

From the repository root:

```bash
make install
make enable
```

Then restart GNOME Shell so the new schema is loaded:

- X11: press `Alt+F2`, type `r`, then Enter.
- Wayland: log out and log back in. (You can avoid this during development with `make dev` — see below.)

Check what's installed:

```bash
make status
```

Remove it:

```bash
make uninstall
```

## Using SnapKit

**Open the picker.** Move your pointer to the trigger edge (top by default), or press `Super+Space`. Layouts appear as small thumbnails; each thumbnail shows its zones.

**Snap by dragging.** Drag a window toward the trigger edge, hover the zone you want inside any layout thumbnail, release. SnapKit snaps the window into that zone and remembers which monitor and layout it belongs to.

**Snap by clicking.** Focus the window you want to move, open the picker, click a zone.

**Switch the active layout.** Open the picker with no window focused (or click a zone with nothing focused) and SnapKit makes that layout the active one for the monitor. Subsequent drags pick up the new layout.

**Edit and create layouts.** Open the extension preferences. The Layouts page lists every layout — built-ins on top, custom layouts below, with an Add button for new ones. The Edit button opens a modal with a live cairo canvas. Click a zone to select it, split it horizontally or vertically, drag the percentage slider (or type the number directly), and merge zones back into their parent if you went too far. Save writes the layout to GSettings; the picker bar picks it up immediately.

**Hide layouts you don't use.** Each row in the layout list has a switch. Turning it off keeps the layout on disk but removes it from the picker bar.

**Per-monitor defaults.** Each detected monitor gets its own combo on the Layouts page so you can assign a different starting layout per screen.

## Default keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Super+Space` | Toggle the picker |
| `Super+Left` | Snap focused window to left half |
| `Super+Right` | Snap focused window to right half |
| `Super+Up` | Snap focused window to top half |
| `Super+Down` | Snap focused window to bottom half |
| `Super+Alt+Left` | Snap focused window top-left |
| `Super+Alt+Right` | Snap focused window top-right |
| `Super+Shift+Left` | Snap focused window bottom-left |
| `Super+Shift+Right` | Snap focused window bottom-right |
| `Super+Control+Space` | Cycle layouts on the focused window's monitor |
| `Super+Control+Arrow` | Move focused window to a neighboring zone |
| `Super+Control+[` / `Super+Control+]` | Move focused window to previous / next zone |
| `Escape` | Close the picker |

The schema also defines empty direct-zone bindings (`move-window-zone-1` through `-9`) which you can assign through `dconf-editor` or `gsettings` if you want jump-to-zone shortcuts.

## Built-in layouts

- `grid-1x1` – full screen
- `grid-2x2` – four-zone grid
- `grid-3x3` – nine-zone grid
- `half-split` – left/right halves
- `half-horizontal` – top/bottom halves
- `quarters` – four equal quarters
- `thirds-vertical`, `thirds-horizontal`
- `left-focus`, `right-focus`, `top-focus`, `bottom-focus`, `center-focus`
- `triple-columns`, `triple-rows`

Default on first run is `grid-2x2`.

## Development

The extension source is in `snapkit@watkinslabs/`. Useful targets:

```bash
make install          # Install into ~/.local/share/gnome-shell/extensions
make enable           # Enable the extension
make reload           # Reinstall, disable, then enable
make dev              # Run a sandboxed nested GNOME Shell Wayland session
make launch           # Alias for make dev
make restart          # Restart GNOME Shell (X11 only)
make compile-schemas  # Compile GSettings schemas
make clean            # Remove build artifacts
```

`make dev` is the safe way to iterate. It stages the extension into an isolated `XDG_DATA_HOME` under `build/dev-home/` (your live install is never overwritten mid-edit), launches a nested gnome-shell, and patches the nested session bus's activation environment so the prefs window opens inside the nested compositor instead of escaping to your real desktop.

The nested-shell resolution defaults to `1536x832`. Override per run:

```bash
make dev DEV_RESOLUTION=1920x1080
```

To mirror other host-installed extensions into the dev sandbox (useful for testing alongside dash-to-dock, dash-to-panel, etc.):

```bash
make dev DEV_EXTRA_EXTENSIONS="dash-to-dock@micxgx.gmail.com"
```

For runtime logs:

```bash
journalctl --user -f /usr/bin/gnome-shell | grep -i snapkit
```

## Building a release zip

```bash
make build
```

The package is written to `build/snapkit@watkinslabs.v<version>.shell-extension.zip`, laid out the way extensions.gnome.org expects.

To bump the version and build in one step:

```bash
make release
```

## Project layout

- `extension.js` and `prefs.js` are the GNOME Shell entry points (shell process and prefs process respectively).
- `src/core/` — shared infrastructure: event bus, service container, component manager, logger.
- `src/app/` — wiring: dependency graph, component lifecycle, event subscriptions, GSettings lifecycle, the SafeSettings wrapper that schema-checks every read/write so a stale schema can't crash the shell.
- `src/btree/` — layout validation, BTree resolution, built-in layout registration, divider override storage.
- `src/state/` — extension state machine and per-monitor layout state.
- `src/tiling/` — monitor and window tracking, snap geometry, divider sync.
- `src/interaction/` — edge triggers, drag detection, keyboard shortcuts, interaction state machine.
- `src/overlay/` — `baseOverlay` plus the `snapPreviewOverlay` that highlights the target zone during a drag.
- `src/ui/` — the layout picker bar.
- `src/prefs-ui/` — the Adw layout editor that runs in the prefs process.
- `schemas/` — GSettings schema (compiled to `gschemas.compiled` on install).
- `scripts/dev-launch.sh` — the nested-shell launcher used by `make dev`.

The `make test` and `make validate` targets are wired in the Makefile but the corresponding `tests/` directory and `scripts/validate.mjs` are not in this checkout.

## Supported GNOME Shell versions

45, 46, 47, 48.

## Author

Chris Watkins <chris@watkinslabs.com>
