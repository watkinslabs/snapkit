# SnapKit

A GNOME Shell extension that brings Windows 11-style snap layouts to Linux.

## Overview

SnapKit provides a window snapping experience similar to Windows 11's Snap Layouts feature. Move your mouse to the top edge of the screen to reveal a layout picker, select a zone, and snap windows into predefined arrangements.

This is an early implementation. The goal is to replicate the intuitive window management that Windows 11 introduced, making it available for GNOME desktop users.

## Features

- **Snap Layouts**: 8 preset layouts including half-split, quarters, thirds, and focus layouts
- **Zone Selection**: Hover at screen edge to reveal layout picker, click a zone to enter snap mode
- **Window Selector**: Visual overlay showing available windows with thumbnails
- **Multi-Monitor Support**: Works with primary, current, or all monitors
- **Tiled Resize**: Windows snapped together resize as a group - drag a shared border and adjacent windows adjust automatically
- **Minimized Window Support**: Snap minimized windows directly from the selector
- **Configurable Trigger**: Adjustable trigger zone size, position, and push delay

## Installation

### From Source

```bash
git clone https://github.com/user/snapkit.git
cd snapkit
make install
make enable
```

Then restart GNOME Shell:
- X11: Press Alt+F2, type `r`, press Enter
- Wayland: Log out and log back in

### Development

To test changes in a nested GNOME Shell session (recommended for Wayland):

```bash
make dev
```

This opens a sandboxed GNOME Shell window where you can test the extension without affecting your main session.

## Usage

1. Move your mouse to the top edge of the screen (or configured trigger edge)
2. After a brief delay, the layout picker appears
3. Click on a layout zone to enter snap mode
4. Click on a window thumbnail to snap it to that zone
5. Repeat for additional zones, or click "Skip This Zone" to leave a zone empty
6. Press ESC or click the background to cancel

### Tiled Resize

Once windows are snapped to a layout, they behave as a tile group:
- Drag a shared border between windows to resize them together
- The resize cascades: if window A's edge affects window B, and B shares an edge with C, then C also adjusts
- Drag a window to move it, which removes it from the tile group

## Configuration

Right-click the trigger zone to open preferences, or run:

```bash
gnome-extensions prefs snapkit@watkinslabs
```

Available settings:
- Trigger edge position (top, bottom, left, right)
- Trigger zone height
- Push delay before opening
- Auto-hide behavior
- Monitor mode (primary, current, all)
- Debug mode for troubleshooting

## Layouts

| Layout | Description |
|--------|-------------|
| Half Split | Two equal columns |
| Quarters | Four equal quadrants |
| Thirds (Vertical) | Three equal columns |
| Thirds (Horizontal) | Three equal rows |
| Left Focus | Large left zone, two stacked right zones |
| Right Focus | Two stacked left zones, large right zone |
| Top Focus | Large top zone, two bottom zones |
| Bottom Focus | Two top zones, large bottom zone |

## Requirements

- GNOME Shell 45 or later
- GLib, Clutter, St (included with GNOME)

## Known Limitations

- Custom layout creation is not yet implemented
- Keyboard shortcuts for direct zone snapping are planned
- Some applications with minimum size constraints may not fit in smaller zones (indicated with a warning badge)

## Building

```bash
make help          # Show available targets
make install       # Install to user directory
make uninstall     # Remove from user directory
make enable        # Enable the extension
make disable       # Disable the extension
make reload        # Reinstall and reload
make dev           # Test in nested GNOME Shell
make deploy        # Create distributable zip
make clean         # Remove build artifacts
```

## License

This project is open source. See LICENSE file for details.

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request.
