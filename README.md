# SnapKit - BTree Window Manager for GNOME

A GNOME Shell extension for advanced window snapping and tiling with visual zone overlays.

## Spec

Canonical product and engineering spec: `docs/SPEC.md`

## Architecture

- BTree-based space partitioning for layouts
- Event-driven (no polling)
- Layered design: Core -> BTree -> Tiling -> Overlay -> Interaction -> UI
- Dependency injection via ServiceContainer
- Event-driven communication via EventBus

## Installation

```bash
cd snapkit
make install
make enable
```

Then restart GNOME Shell (Alt+F2 -> r on X11, or log out/in on Wayland).

## Development

```bash
# Test in nested GNOME Shell
make dev
# or
make launch

# Reinstall and reload
make reload

# Check status
make status
```

## Building for Release

```bash
make build    # Create zip package
make release  # Bump version and create zip
```

## Supported GNOME Shell Versions

- 45, 46, 47, 48

## Author

Chris Watkins <chris@watkinslabs.com>
