# Keyboard Shortcuts Implementation TODO

**Goal**: Add keyboard shortcuts for snapping windows to common layout zones, enabling quick window management without mouse interaction (similar to Windows 11's Win+Arrow functionality).

---

## Overview

This feature will allow users to:
- Snap the focused window to predefined zones using keyboard shortcuts
- Cycle through layouts using keyboard
- Configure custom keybindings via preferences
- Use shortcuts that intelligently map to the active layout's zones

---

## Phase 1: Schema & Infrastructure

### 1.1 Update GSettings Schema

**File**: `schemas/org.gnome.shell.extensions.snapkit.gschema.xml`

Add the following keys:

```xml
<!-- Keyboard Shortcuts Settings -->
<key name="keyboard-shortcuts-enabled" type="b">
  <default>true</default>
  <summary>Enable keyboard shortcuts</summary>
  <description>Enable or disable all keyboard shortcuts for window snapping</description>
</key>

<!-- Basic Snap Shortcuts -->
<key name="snap-left" type="as">
  <default>['&lt;Super&gt;Left']</default>
  <summary>Snap window to left half</summary>
</key>

<key name="snap-right" type="as">
  <default>['&lt;Super&gt;Right']</default>
  <summary>Snap window to right half</summary>
</key>

<key name="snap-up" type="as">
  <default>['&lt;Super&gt;Up']</default>
  <summary>Maximize or snap to top half</summary>
</key>

<key name="snap-down" type="as">
  <default>['&lt;Super&gt;Down']</default>
  <summary>Unmaximize or snap to bottom half</summary>
</key>

<!-- Quarter Snap Shortcuts -->
<key name="snap-top-left" type="as">
  <default>['&lt;Super&gt;&lt;Ctrl&gt;Left']</default>
  <summary>Snap window to top-left quarter</summary>
</key>

<key name="snap-top-right" type="as">
  <default>['&lt;Super&gt;&lt;Ctrl&gt;Right']</default>
  <summary>Snap window to top-right quarter</summary>
</key>

<key name="snap-bottom-left" type="as">
  <default>['&lt;Super&gt;&lt;Shift&gt;Left']</default>
  <summary>Snap window to bottom-left quarter</summary>
</key>

<key name="snap-bottom-right" type="as">
  <default>['&lt;Super&gt;&lt;Shift&gt;Right']</default>
  <summary>Snap window to bottom-right quarter</summary>
</key>

<!-- Third Snap Shortcuts -->
<key name="snap-left-third" type="as">
  <default>['&lt;Super&gt;&lt;Alt&gt;Left']</default>
  <summary>Snap window to left third</summary>
</key>

<key name="snap-center-third" type="as">
  <default>['&lt;Super&gt;&lt;Alt&gt;Down']</default>
  <summary>Snap window to center third</summary>
</key>

<key name="snap-right-third" type="as">
  <default>['&lt;Super&gt;&lt;Alt&gt;Right']</default>
  <summary>Snap window to right third</summary>
</key>

<!-- Layout Cycling -->
<key name="cycle-layout-next" type="as">
  <default>['&lt;Super&gt;&lt;Alt&gt;Page_Down']</default>
  <summary>Switch to next layout</summary>
</key>

<key name="cycle-layout-previous" type="as">
  <default>['&lt;Super&gt;&lt;Alt&gt;Page_Up']</default>
  <summary>Switch to previous layout</summary>
</key>

<!-- Advanced -->
<key name="keyboard-snap-animation-duration" type="i">
  <default>150</default>
  <range min="0" max="500"/>
  <summary>Keyboard snap animation duration</summary>
  <description>Duration of animation when snapping via keyboard (milliseconds)</description>
</key>

<key name="show-snap-indicator" type="b">
  <default>true</default>
  <summary>Show visual indicator when snapping</summary>
  <description>Flash the target zone briefly when snapping via keyboard</description>
</key>

<key name="cycle-on-repeat" type="b">
  <default>true</default>
  <summary>Cycle through zones on repeat press</summary>
  <description>Repeatedly pressing the same snap key cycles through compatible zones</description>
</key>
```

### 1.2 Create Keybinding Manager

**New File**: `lib/keybindingManager.js`

**Purpose**: Handle GNOME Shell keybinding registration and callbacks.

```javascript
/**
 * KeybindingManager
 * 
 * Manages keyboard shortcuts for window snapping operations.
 * Integrates with GNOME Shell's keybinding system.
 */

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class KeybindingManager {
    constructor(settings, snapHandler) {
        this._settings = settings;
        this._snapHandler = snapHandler;
        this._boundKeys = new Set();
        this._enabled = false;
        this._lastSnapAction = null;
        this._lastSnapTime = 0;
        this._cycleTimeout = 800; // ms between presses to consider as "cycling"
    }

    /**
     * Enable all configured keyboard shortcuts
     */
    enable() {
        if (this._enabled) return;

        const enabled = this._settings.get_boolean('keyboard-shortcuts-enabled');
        if (!enabled) {
            console.log('SnapKit: Keyboard shortcuts disabled in settings');
            return;
        }

        // Register all keybindings
        this._registerKeybinding('snap-left', this._onSnapLeft.bind(this));
        this._registerKeybinding('snap-right', this._onSnapRight.bind(this));
        this._registerKeybinding('snap-up', this._onSnapUp.bind(this));
        this._registerKeybinding('snap-down', this._onSnapDown.bind(this));
        
        this._registerKeybinding('snap-top-left', this._onSnapTopLeft.bind(this));
        this._registerKeybinding('snap-top-right', this._onSnapTopRight.bind(this));
        this._registerKeybinding('snap-bottom-left', this._onSnapBottomLeft.bind(this));
        this._registerKeybinding('snap-bottom-right', this._onSnapBottomRight.bind(this));
        
        this._registerKeybinding('snap-left-third', this._onSnapLeftThird.bind(this));
        this._registerKeybinding('snap-center-third', this._onSnapCenterThird.bind(this));
        this._registerKeybinding('snap-right-third', this._onSnapRightThird.bind(this));
        
        this._registerKeybinding('cycle-layout-next', this._onCycleLayoutNext.bind(this));
        this._registerKeybinding('cycle-layout-previous', this._onCycleLayoutPrevious.bind(this));

        this._enabled = true;
        console.log('SnapKit: Keyboard shortcuts enabled');
    }

    /**
     * Disable all keyboard shortcuts
     */
    disable() {
        if (!this._enabled) return;

        for (const key of this._boundKeys) {
            Main.wm.removeKeybinding(key);
        }
        this._boundKeys.clear();
        this._enabled = false;
        console.log('SnapKit: Keyboard shortcuts disabled');
    }

    /**
     * Register a keybinding with GNOME Shell
     */
    _registerKeybinding(name, handler) {
        try {
            Main.wm.addKeybinding(
                name,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL,
                handler
            );
            this._boundKeys.add(name);
        } catch (e) {
            console.error(`SnapKit: Failed to register keybinding ${name}: ${e.message}`);
        }
    }

    /**
     * Get the currently focused window
     */
    _getFocusedWindow() {
        const display = global.display;
        const focus = display.get_focus_window();
        
        if (!focus) {
            console.log('SnapKit: No focused window');
            return null;
        }

        // Only handle normal windows
        if (focus.window_type !== Meta.WindowType.NORMAL) {
            console.log('SnapKit: Focused window is not a normal window');
            return null;
        }

        return focus;
    }

    /**
     * Check if this is a repeated press of the same action (for cycling)
     */
    _isRepeatedAction(action) {
        const cycleEnabled = this._settings.get_boolean('cycle-on-repeat');
        if (!cycleEnabled) return false;

        const now = Date.now();
        const isRepeated = (
            this._lastSnapAction === action &&
            (now - this._lastSnapTime) < this._cycleTimeout
        );

        this._lastSnapAction = action;
        this._lastSnapTime = now;

        return isRepeated;
    }

    // ===== Snap Action Handlers =====

    _onSnapLeft() {
        const window = this._getFocusedWindow();
        if (!window) return;

        const isRepeat = this._isRepeatedAction('snap-left');
        // TODO: Implement snap logic with cycling support
        // If repeat: cycle through left, left-third, left-focus zones
        console.log(`SnapKit: Snap left (repeat: ${isRepeat})`);
    }

    _onSnapRight() {
        const window = this._getFocusedWindow();
        if (!window) return;

        const isRepeat = this._isRepeatedAction('snap-right');
        console.log(`SnapKit: Snap right (repeat: ${isRepeat})`);
    }

    _onSnapUp() {
        const window = this._getFocusedWindow();
        if (!window) return;

        // If window is already maximized, do nothing or unmaximize
        if (window.get_maximized()) {
            window.unmaximize(Meta.MaximizeFlags.BOTH);
            console.log('SnapKit: Unmaximized window');
        } else {
            window.maximize(Meta.MaximizeFlags.BOTH);
            console.log('SnapKit: Maximized window');
        }
    }

    _onSnapDown() {
        const window = this._getFocusedWindow();
        if (!window) return;

        if (window.get_maximized()) {
            window.unmaximize(Meta.MaximizeFlags.BOTH);
            console.log('SnapKit: Unmaximized window');
        } else {
            // Snap to bottom half if not maximized
            const isRepeat = this._isRepeatedAction('snap-down');
            console.log(`SnapKit: Snap down (repeat: ${isRepeat})`);
        }
    }

    _onSnapTopLeft() {
        const window = this._getFocusedWindow();
        if (!window) return;
        console.log('SnapKit: Snap top-left');
    }

    _onSnapTopRight() {
        const window = this._getFocusedWindow();
        if (!window) return;
        console.log('SnapKit: Snap top-right');
    }

    _onSnapBottomLeft() {
        const window = this._getFocusedWindow();
        if (!window) return;
        console.log('SnapKit: Snap bottom-left');
    }

    _onSnapBottomRight() {
        const window = this._getFocusedWindow();
        if (!window) return;
        console.log('SnapKit: Snap bottom-right');
    }

    _onSnapLeftThird() {
        const window = this._getFocusedWindow();
        if (!window) return;
        console.log('SnapKit: Snap left third');
    }

    _onSnapCenterThird() {
        const window = this._getFocusedWindow();
        if (!window) return;
        console.log('SnapKit: Snap center third');
    }

    _onSnapRightThird() {
        const window = this._getFocusedWindow();
        if (!window) return;
        console.log('SnapKit: Snap right third');
    }

    _onCycleLayoutNext() {
        console.log('SnapKit: Cycle to next layout');
        // TODO: Implement layout cycling
    }

    _onCycleLayoutPrevious() {
        console.log('SnapKit: Cycle to previous layout');
        // TODO: Implement layout cycling
    }

    destroy() {
        this.disable();
    }
}
```

**Implementation Notes**:
- Uses `Main.wm.addKeybinding()` for GNOME Shell integration
- `Shell.ActionMode.NORMAL` ensures shortcuts work in normal mode (not overview, etc.)
- `Meta.KeyBindingFlags.NONE` uses default behavior
- Tracks last action for cycling support

---

## Phase 2: Zone Mapping & Snap Logic

### 2.1 Create Zone Mapper

**New File**: `lib/zoneMapper.js`

**Purpose**: Map keyboard actions to layout zones intelligently.

```javascript
/**
 * ZoneMapper
 * 
 * Maps keyboard snap actions (left, right, top-left, etc.) to actual zones
 * in the current layout. Handles different layout structures gracefully.
 */

export class ZoneMapper {
    constructor(layoutManager) {
        this._layoutManager = layoutManager;
    }

    /**
     * Get the best zone for a snap action on a given monitor
     * 
     * @param {string} action - Action name (e.g., 'snap-left')
     * @param {number} monitorIndex - Monitor index
     * @param {boolean} cycle - Whether this is a cycling request
     * @returns {Object|null} - { layoutId, zoneId, rect } or null
     */
    getZoneForAction(action, monitorIndex, cycle = false) {
        const layout = this._getActiveLayout(monitorIndex);
        if (!layout) return null;

        const workArea = this._getMonitorWorkArea(monitorIndex);
        const zones = this._layoutManager.getLayoutZones(layout.id, workArea);

        // Map action to zone based on layout structure
        switch (action) {
            case 'snap-left':
                return this._findLeftZone(zones, cycle);
            case 'snap-right':
                return this._findRightZone(zones, cycle);
            case 'snap-up':
                return this._findTopZone(zones, cycle);
            case 'snap-down':
                return this._findBottomZone(zones, cycle);
            case 'snap-top-left':
                return this._findQuadrant(zones, 'top-left');
            case 'snap-top-right':
                return this._findQuadrant(zones, 'top-right');
            case 'snap-bottom-left':
                return this._findQuadrant(zones, 'bottom-left');
            case 'snap-bottom-right':
                return this._findQuadrant(zones, 'bottom-right');
            case 'snap-left-third':
                return this._findThird(zones, 'left');
            case 'snap-center-third':
                return this._findThird(zones, 'center');
            case 'snap-right-third':
                return this._findThird(zones, 'right');
            default:
                return null;
        }
    }

    /**
     * Find best "left" zone - supports cycling
     */
    _findLeftZone(zones, cycle) {
        // Priority: zones on the left half of screen
        // If cycling: left-half → left-third → left-focus main
        // TODO: Implement zone finding logic
        return null;
    }

    _findRightZone(zones, cycle) {
        // Similar to left but for right side
        return null;
    }

    _findTopZone(zones, cycle) {
        // Top half or top zones
        return null;
    }

    _findBottomZone(zones, cycle) {
        // Bottom half or bottom zones
        return null;
    }

    _findQuadrant(zones, position) {
        // Find zone in specified quadrant
        // position: 'top-left', 'top-right', 'bottom-left', 'bottom-right'
        return null;
    }

    _findThird(zones, position) {
        // Find zone in specified third
        // position: 'left', 'center', 'right'
        return null;
    }

    _getActiveLayout(monitorIndex) {
        // Get the currently active layout for this monitor
        return null;
    }

    _getMonitorWorkArea(monitorIndex) {
        // Get work area for monitor
        return null;
    }
}
```

**Zone Selection Algorithm**:
1. Get all zones in current layout
2. Calculate zone centers and bounds
3. Classify zones by position (left/right/top/bottom)
4. Match action to best zone based on:
   - Zone position relative to screen
   - Zone size (prefer larger zones for base actions)
   - Zone tags (if layout includes semantic tags)
5. For cycling: keep list of compatible zones, rotate through them

### 2.2 Implement Snap Actions

**New File**: `lib/keyboardSnapHandler.js`

**Purpose**: Execute snap operations triggered by keyboard.

```javascript
/**
 * KeyboardSnapHandler
 * 
 * Handles the actual snapping of windows when triggered by keyboard shortcuts.
 * Coordinates with TileManager to ensure proper tiling behavior.
 */

import Meta from 'gi://Meta';

export class KeyboardSnapHandler {
    constructor(settings, layoutManager, tileManager, zoneMapper) {
        this._settings = settings;
        this._layoutManager = layoutManager;
        this._tileManager = tileManager;
        this._zoneMapper = zoneMapper;
    }

    /**
     * Snap a window based on keyboard action
     */
    snapWindow(window, action, cycle = false) {
        if (!window) return false;

        const monitor = this._getWindowMonitor(window);
        if (monitor === null) return false;

        // Get target zone for this action
        const zone = this._zoneMapper.getZoneForAction(action, monitor, cycle);
        if (!zone) {
            console.log(`SnapKit: No zone found for action ${action}`);
            return false;
        }

        // Show visual indicator if enabled
        if (this._settings.get_boolean('show-snap-indicator')) {
            this._showSnapIndicator(zone.rect, monitor);
        }

        // Calculate window rect (zone rect with insets applied)
        const windowRect = this._calculateWindowRect(zone.rect);

        // Animate to target position
        const duration = this._settings.get_int('keyboard-snap-animation-duration');
        this._animateWindowToRect(window, windowRect, duration);

        // Register with TileManager for enforced tiling
        this._tileManager.addTiledWindow(window, zone.layoutId, zone.zoneId, monitor);

        console.log(`SnapKit: Snapped window to ${zone.zoneId} in layout ${zone.layoutId}`);
        return true;
    }

    /**
     * Show brief visual indicator of target zone
     */
    _showSnapIndicator(rect, monitorIndex) {
        // TODO: Create temporary overlay showing the target zone
        // Flash briefly then fade out
    }

    /**
     * Animate window to target rectangle
     */
    _animateWindowToRect(window, rect, duration) {
        // TODO: Implement smooth animation
        // For now: immediate move/resize
        window.move_resize_frame(true, rect.x, rect.y, rect.w, rect.h);
    }

    _calculateWindowRect(zoneRect) {
        // Apply insets to zone rect to get window rect
        // TODO: Get insets from layout or settings
        const insets = 8;
        return {
            x: zoneRect.x + insets,
            y: zoneRect.y + insets,
            w: zoneRect.w - (insets * 2),
            h: zoneRect.h - (insets * 2)
        };
    }

    _getWindowMonitor(window) {
        return window.get_monitor();
    }

    destroy() {
        // Cleanup
    }
}
```

---

## Phase 3: Layout Cycling

### 3.1 Add Layout Cycling to LayoutManager

**Modify**: `lib/layoutManager.js`

Add methods:
```javascript
/**
 * Cycle to the next enabled layout for a monitor
 */
cycleLayoutNext(monitorIndex) {
    const enabledLayouts = this.getEnabledLayouts();
    const currentLayoutId = this._getActiveLayoutForMonitor(monitorIndex);
    
    const currentIndex = enabledLayouts.findIndex(l => l.id === currentLayoutId);
    const nextIndex = (currentIndex + 1) % enabledLayouts.length;
    const nextLayout = enabledLayouts[nextIndex];
    
    this._setActiveLayoutForMonitor(monitorIndex, nextLayout.id);
    return nextLayout;
}

/**
 * Cycle to the previous enabled layout for a monitor
 */
cycleLayoutPrevious(monitorIndex) {
    const enabledLayouts = this.getEnabledLayouts();
    const currentLayoutId = this._getActiveLayoutForMonitor(monitorIndex);
    
    const currentIndex = enabledLayouts.findIndex(l => l.id === currentLayoutId);
    const prevIndex = (currentIndex - 1 + enabledLayouts.length) % enabledLayouts.length;
    const prevLayout = enabledLayouts[prevIndex];
    
    this._setActiveLayoutForMonitor(monitorIndex, prevLayout.id);
    return prevLayout;
}
```

### 3.2 Layout Change Indicator

**New File**: `lib/layoutIndicator.js`

**Purpose**: Show brief on-screen indicator when layout changes.

```javascript
/**
 * LayoutIndicator
 * 
 * Displays a brief notification when the layout changes via keyboard.
 * Shows layout name and preview thumbnail.
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class LayoutIndicator {
    constructor() {
        this._container = null;
        this._timeoutId = null;
    }

    /**
     * Show layout change indicator
     */
    show(layoutName, monitorIndex) {
        this._hide(); // Hide any existing indicator

        // Create indicator UI
        this._container = new St.BoxLayout({
            style_class: 'snapkit-layout-indicator',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        const label = new St.Label({
            text: layoutName,
            style_class: 'snapkit-layout-indicator-label'
        });

        this._container.add_child(label);

        // Position on monitor
        const monitor = Main.layoutManager.monitors[monitorIndex];
        this._container.set_position(
            monitor.x + (monitor.width - 200) / 2,
            monitor.y + (monitor.height - 100) / 2
        );
        this._container.set_size(200, 100);

        Main.uiGroup.add_child(this._container);

        // Fade in
        this._container.opacity = 0;
        this._container.ease({
            opacity: 255,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });

        // Auto-hide after 1.5 seconds
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._hide();
            this._timeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _hide() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._container) {
            this._container.ease({
                opacity: 0,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    this._container.destroy();
                    this._container = null;
                }
            });
        }
    }

    destroy() {
        this._hide();
    }
}
```

---

## Phase 4: Preferences UI

### 4.1 Add Keyboard Shortcuts Section

**Modify**: `prefs.js`

Add new preferences group after the existing settings:

```javascript
// ===== KEYBOARD SHORTCUTS =====
const keyboardGroup = new Adw.PreferencesGroup({
    title: 'Keyboard Shortcuts',
    description: 'Configure keyboard shortcuts for window snapping'
});

// Global enable toggle
const enableShortcuts = new Adw.SwitchRow({
    title: 'Enable Keyboard Shortcuts',
    subtitle: 'Use keyboard to snap windows to zones'
});
this._settings.bind('keyboard-shortcuts-enabled', enableShortcuts, 'active',
    Gio.SettingsBindFlags.DEFAULT);
keyboardGroup.add(enableShortcuts);

// Shortcut configuration rows
const shortcuts = [
    { key: 'snap-left', title: 'Snap Left', subtitle: 'Snap window to left side' },
    { key: 'snap-right', title: 'Snap Right', subtitle: 'Snap window to right side' },
    { key: 'snap-up', title: 'Snap Up / Maximize', subtitle: 'Maximize or snap to top' },
    { key: 'snap-down', title: 'Snap Down / Restore', subtitle: 'Restore or snap to bottom' },
    { key: 'snap-top-left', title: 'Snap Top-Left', subtitle: 'Snap to top-left quarter' },
    { key: 'snap-top-right', title: 'Snap Top-Right', subtitle: 'Snap to top-right quarter' },
    { key: 'snap-bottom-left', title: 'Snap Bottom-Left', subtitle: 'Snap to bottom-left quarter' },
    { key: 'snap-bottom-right', title: 'Snap Bottom-Right', subtitle: 'Snap to bottom-right quarter' },
    { key: 'snap-left-third', title: 'Snap Left Third', subtitle: 'Snap to left third' },
    { key: 'snap-center-third', title: 'Snap Center', subtitle: 'Snap to center third' },
    { key: 'snap-right-third', title: 'Snap Right Third', subtitle: 'Snap to right third' },
    { key: 'cycle-layout-next', title: 'Next Layout', subtitle: 'Switch to next layout' },
    { key: 'cycle-layout-previous', title: 'Previous Layout', subtitle: 'Switch to previous layout' }
];

for (const shortcut of shortcuts) {
    const row = new Adw.ActionRow({
        title: shortcut.title,
        subtitle: shortcut.subtitle
    });

    const button = new Gtk.Button({
        label: this._getShortcutLabel(shortcut.key),
        valign: Gtk.Align.CENTER
    });
    button.connect('clicked', () => this._openShortcutDialog(shortcut.key, button));
    
    row.add_suffix(button);
    row.activatable_widget = button;
    keyboardGroup.add(row);
}

// Additional options
const cycleOnRepeat = new Adw.SwitchRow({
    title: 'Cycle Through Zones',
    subtitle: 'Repeatedly pressing a snap key cycles through compatible zones'
});
this._settings.bind('cycle-on-repeat', cycleOnRepeat, 'active',
    Gio.SettingsBindFlags.DEFAULT);
keyboardGroup.add(cycleOnRepeat);

const showIndicator = new Adw.SwitchRow({
    title: 'Show Snap Indicator',
    subtitle: 'Flash target zone when snapping via keyboard'
});
this._settings.bind('show-snap-indicator', showIndicator, 'active',
    Gio.SettingsBindFlags.DEFAULT);
keyboardGroup.add(showIndicator);

// Reset button
const resetButton = new Gtk.Button({
    label: 'Reset All Shortcuts to Defaults',
    halign: Gtk.Align.CENTER,
    css_classes: ['destructive-action']
});
resetButton.connect('clicked', () => this._resetAllShortcuts());
keyboardGroup.add(resetButton);

behaviorPage.add(keyboardGroup);
```

### 4.2 Shortcut Dialog

Implement `_openShortcutDialog()` method to allow users to capture new keybindings:

```javascript
_openShortcutDialog(settingsKey, button) {
    const dialog = new Gtk.Dialog({
        title: 'Set Keyboard Shortcut',
        modal: true,
        transient_for: this.get_root()
    });

    const content = dialog.get_content_area();
    const label = new Gtk.Label({
        label: 'Press the new shortcut keys...\n\nPress Escape to cancel\nPress Backspace to clear',
        margin_top: 20,
        margin_bottom: 20,
        margin_start: 20,
        margin_end: 20
    });
    content.append(label);

    // Capture key press
    const controller = new Gtk.EventControllerKey();
    controller.connect('key-pressed', (ctrl, keyval, keycode, state) => {
        // Handle Escape (cancel)
        if (keyval === Gdk.KEY_Escape) {
            dialog.close();
            return true;
        }

        // Handle Backspace (clear binding)
        if (keyval === Gdk.KEY_BackSpace) {
            this._settings.set_strv(settingsKey, []);
            button.set_label('Disabled');
            dialog.close();
            return true;
        }

        // Capture the shortcut
        const binding = Gtk.accelerator_name(keyval, state);
        if (binding) {
            this._settings.set_strv(settingsKey, [binding]);
            button.set_label(Gtk.accelerator_get_label(keyval, state));
            dialog.close();
            return true;
        }

        return false;
    });
    dialog.add_controller(controller);

    dialog.present();
}

_getShortcutLabel(settingsKey) {
    const bindings = this._settings.get_strv(settingsKey);
    if (bindings.length === 0) return 'Disabled';
    
    const [key, mods] = Gtk.accelerator_parse(bindings[0]);
    return Gtk.accelerator_get_label(key, mods);
}

_resetAllShortcuts() {
    const shortcuts = [
        'snap-left', 'snap-right', 'snap-up', 'snap-down',
        'snap-top-left', 'snap-top-right', 'snap-bottom-left', 'snap-bottom-right',
        'snap-left-third', 'snap-center-third', 'snap-right-third',
        'cycle-layout-next', 'cycle-layout-previous'
    ];

    for (const key of shortcuts) {
        this._settings.reset(key);
    }

    // Reload UI to show default values
    // (In practice, would need to update button labels)
}
```

---

## Phase 5: Integration

### 5.1 Update Main Extension

**Modify**: `extension.js`

```javascript
// Add imports
import {KeybindingManager} from './lib/keybindingManager.js';
import {ZoneMapper} from './lib/zoneMapper.js';
import {KeyboardSnapHandler} from './lib/keyboardSnapHandler.js';
import {LayoutIndicator} from './lib/layoutIndicator.js';

// In constructor, add:
this._keybindingManager = null;
this._zoneMapper = null;
this._keyboardSnapHandler = null;
this._layoutIndicator = null;

// In enable(), add:
this._zoneMapper = new ZoneMapper(this._layoutManager);
this._keyboardSnapHandler = new KeyboardSnapHandler(
    this._settings,
    this._layoutManager,
    this._tileManager,
    this._zoneMapper
);
this._keybindingManager = new KeybindingManager(
    this._settings,
    this._keyboardSnapHandler
);
this._layoutIndicator = new LayoutIndicator();

this._keybindingManager.enable();

// In disable(), add:
if (this._keybindingManager) {
    this._keybindingManager.disable();
    this._keybindingManager = null;
}
if (this._layoutIndicator) {
    this._layoutIndicator.destroy();
    this._layoutIndicator = null;
}
this._keyboardSnapHandler = null;
this._zoneMapper = null;
```

### 5.2 Connect Layout Cycling

In `KeybindingManager`, implement layout cycling handlers:

```javascript
_onCycleLayoutNext() {
    // Get focused window's monitor or primary monitor
    const window = this._getFocusedWindow();
    const monitorIndex = window ? window.get_monitor() : Main.layoutManager.primaryIndex;
    
    // Cycle layout
    const newLayout = this._layoutManager.cycleLayoutNext(monitorIndex);
    
    // Show indicator
    this._layoutIndicator.show(newLayout.name, monitorIndex);
    
    // Re-apply tiled windows to new layout
    this._tileManager.reapplyLayoutForMonitor(monitorIndex, newLayout.id);
    
    console.log(`SnapKit: Switched to layout ${newLayout.name} on monitor ${monitorIndex}`);
}

_onCycleLayoutPrevious() {
    // Similar to above but cycle previous
}
```

---

## Phase 6: Testing & Validation

### 6.1 Test Cases

Create test plan covering:

1. **Basic Snap Operations**
   - [ ] Snap left with default key works
   - [ ] Snap right with default key works
   - [ ] Snap to each quarter works
   - [ ] Snap to thirds works
   - [ ] Maximize/restore works

2. **Cycling Behavior**
   - [ ] Repeated left key cycles through left zones
   - [ ] Cycle timeout works correctly
   - [ ] Cycling disabled setting works

3. **Layout Cycling**
   - [ ] Next layout shortcut works
   - [ ] Previous layout shortcut works
   - [ ] Indicator shows correct layout name
   - [ ] Tiled windows re-snap to new layout

4. **Multi-Monitor**
   - [ ] Shortcuts work on primary monitor
   - [ ] Shortcuts work on secondary monitor
   - [ ] Focused window's monitor is used
   - [ ] Layout per-monitor works

5. **Custom Keybindings**
   - [ ] Can change keybinding in prefs
   - [ ] New keybinding works after change
   - [ ] Can disable individual shortcuts
   - [ ] Reset to defaults works

6. **Edge Cases**
   - [ ] No focused window: no crash
   - [ ] Dialog window focused: no snap
   - [ ] Maximized window: appropriate behavior
   - [ ] Window at edge: stays within bounds
   - [ ] Layout with no matching zone: graceful fallback

7. **Conflicts**
   - [ ] No conflicts with GNOME defaults
   - [ ] Works with different keyboard layouts
   - [ ] Works in X11 and Wayland

### 6.2 Performance Testing

- [ ] No lag when triggering shortcuts
- [ ] Animation is smooth
- [ ] No memory leaks from keybinding registration
- [ ] Proper cleanup on disable

---

## Phase 7: Documentation

### 7.1 Update README.md

Add section after "Usage":

```markdown
### Keyboard Shortcuts

SnapKit supports keyboard shortcuts for quick window snapping without using the mouse.

#### Default Shortcuts

**Basic Snapping**
- `Super + ←` - Snap to left half
- `Super + →` - Snap to right half
- `Super + ↑` - Maximize window
- `Super + ↓` - Restore window (or snap to bottom half)

**Quarter Snapping**
- `Super + Ctrl + ←` - Snap to top-left quarter
- `Super + Ctrl + →` - Snap to top-right quarter
- `Super + Shift + ←` - Snap to bottom-left quarter
- `Super + Shift + →` - Snap to bottom-right quarter

**Third Snapping**
- `Super + Alt + ←` - Snap to left third
- `Super + Alt + ↓` - Snap to center third
- `Super + Alt + →` - Snap to right third

**Layout Management**
- `Super + Alt + Page Down` - Switch to next layout
- `Super + Alt + Page Up` - Switch to previous layout

#### Cycling Behavior

Repeatedly pressing the same snap key (e.g., `Super + ←`) will cycle through compatible zones in the current layout. For example:
- First press: Snap to left half
- Second press: Snap to left third (if available)
- Third press: Snap to left focus zone (if available)
- Fourth press: Return to left half

Disable this behavior in preferences if you prefer fixed destinations.

#### Customizing Shortcuts

All keyboard shortcuts can be customized:
1. Open preferences: `gnome-extensions prefs snapkit@watkinslabs`
2. Go to "Keyboard Shortcuts" section
3. Click on a shortcut button
4. Press your desired key combination
5. Press Backspace to disable a shortcut
6. Click "Reset All Shortcuts to Defaults" to restore defaults

#### Conflicts with GNOME Defaults

Some default GNOME shortcuts may conflict (e.g., `Super + ←/→` for workspace switching). SnapKit will take priority when enabled. You can customize either SnapKit's or GNOME's shortcuts to avoid conflicts.
```

### 7.2 Update Known Limitations

Remove the line:
```
- Keyboard shortcuts for direct zone snapping are planned
```

### 7.3 Create Keyboard Shortcuts Guide

**New File**: `docs/KEYBOARD_SHORTCUTS.md`

Detailed guide covering:
- All available shortcuts
- Customization instructions
- Troubleshooting keybinding issues
- Platform-specific notes (X11 vs Wayland)
- Conflict resolution strategies

---

## Phase 8: Polish & Advanced Features

### 8.1 Visual Feedback

**Snap Indicator Animation**:
- Brief highlight of target zone (150ms)
- Subtle scale animation (zoom in/out)
- Color matches zone highlight color from settings

**Window Animation**:
- Smooth easing (not linear)
- Respect animation duration setting
- Cancel animation if user interferes

### 8.2 Smart Zone Selection

**Algorithm Improvements**:
- Consider current window position (snap to nearest compatible zone)
- Remember last used zone per-action per-session
- Prefer larger zones for initial snaps
- Prefer smaller/specific zones for repeated snaps

### 8.3 Conflict Handling

**Detect and Warn**:
- Check for conflicts with GNOME native shortcuts on enable
- Show warning in preferences if conflicts detected
- Offer to disable conflicting GNOME shortcuts
- Add option to disable native edge tiling when SnapKit shortcuts are enabled

### 8.4 Accessibility

- Ensure shortcuts work with assistive technologies
- Support high contrast mode for indicators
- Respect reduced motion preferences
- Add option for sound feedback (optional)

---

## Implementation Timeline Estimate

| Phase | Tasks | Estimated Time | Priority |
|-------|-------|----------------|----------|
| 1 | Schema & Infrastructure | 3-4 hours | Critical |
| 2 | Zone Mapping & Snap Logic | 4-5 hours | Critical |
| 3 | Layout Cycling | 2-3 hours | High |
| 4 | Preferences UI | 3-4 hours | High |
| 5 | Integration | 2-3 hours | Critical |
| 6 | Testing & Validation | 3-4 hours | High |
| 7 | Documentation | 2-3 hours | Medium |
| 8 | Polish & Advanced Features | 3-4 hours | Low |
| **Total** | | **22-30 hours** | |

---

## Success Criteria

✅ **Minimum Viable Product (MVP)**:
1. Basic snap shortcuts (left, right, up, down) work
2. Quarter snap shortcuts work
3. Shortcuts snap focused window to appropriate zone
4. Integration with TileManager for enforced tiling
5. Preferences UI to customize shortcuts
6. Documentation updated

✅ **Full Feature Set**:
1. All planned shortcuts implemented
2. Cycling through zones works
3. Layout cycling with visual indicator
4. Smart zone selection algorithm
5. Animation and visual feedback
6. Comprehensive testing completed
7. Conflict detection and handling

✅ **Quality Standards**:
1. No crashes or errors
2. Smooth performance (no lag)
3. Proper resource cleanup
4. Works on X11 and Wayland
5. Works with multiple monitors
6. Intuitive and discoverable behavior
7. Clear and complete documentation

---

## Known Challenges & Solutions

### Challenge 1: Zone Mapping Complexity
**Problem**: Different layouts have different zone structures. Mapping "left" to a zone is ambiguous.

**Solution**: 
- Use zone position analysis (center point, bounds)
- Prioritize zones by size and position
- Maintain fallback logic for edge cases
- Allow cycle-through for multi-zone layouts

### Challenge 2: Keybinding Conflicts
**Problem**: Default shortcuts may conflict with GNOME or other extensions.

**Solution**:
- Use Meta.KeyBindingFlags to handle conflicts
- Detect conflicts and show warnings
- Make all shortcuts customizable
- Provide sensible defaults that minimize conflicts

### Challenge 3: Animation Smoothness
**Problem**: Window animation may be choppy or feel unresponsive.

**Solution**:
- Use Clutter.Actor.ease() for smooth easing
- Keep duration short (150ms default)
- Allow disabling animation (0ms duration)
- Test on various hardware

### Challenge 4: Multi-Monitor Complexity
**Problem**: Which monitor to snap on? Which layout to use?

**Solution**:
- Use focused window's monitor
- Fall back to primary if no focused window
- Each monitor can have different active layout
- Layout cycling is per-monitor

---

## Future Enhancements (Out of Scope for v1)

1. **Zone Picker Mode**
   - Press shortcut to enter "zone picker" overlay
   - Press number keys (1-9) to snap to that zone
   - ESC to cancel

2. **Custom Action Sequences**
   - Define multi-step actions (e.g., "snap left, then resize 60%")
   - Macro recording for complex window arrangements

3. **Window History Navigation**
   - Navigate through window's previous positions
   - Undo/redo for window moves

4. **Voice Commands** (accessibility)
   - "Snap window left"
   - Integration with GNOME accessibility tools

5. **Gesture Support**
   - Touchpad gestures for snapping
   - Complement keyboard shortcuts

---

## References

- GNOME Shell Keybinding API: `Meta.KeyBindingFlags`, `Main.wm.addKeybinding()`
- GTK4 Shortcut Widgets: `Gtk.ShortcutController`, `Gtk.accelerator_parse()`
- Windows 11 Snap Layouts: User interaction patterns
- GNOME HIG: Keyboard accessibility guidelines

---

**Document Status**: Planning Complete - Ready for Implementation
**Created**: 2026-01-05
**Last Updated**: 2026-01-05
