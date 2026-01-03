import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * WindowSelector - Shows zone preview and window thumbnails for snap mode
 */
export const WindowSelector = GObject.registerClass({
    Signals: {
        'window-selected': {param_types: [Meta.Window.$gtype]},
        'window-deselected': {param_types: [Meta.Window.$gtype]},
        'skip-zone': {},
        'cancelled': {}
    }
}, class WindowSelector extends St.Widget {
    _init(settings, positionedWindows = null, layout = null, currentZoneIndex = 0) {
        super._init({
            reactive: true,
            can_focus: true,
            track_hover: false,
            layout_manager: new Clutter.BinLayout(),
            style: 'background-color: rgba(0, 0, 0, 0.9);'
        });

        this._settings = settings;
        this._windowButtons = [];
        this._signalIds = [];  // Track signal IDs for cleanup
        this._windowDestroyIds = new Map();  // Track window destroy handlers
        this._positionedWindows = positionedWindows || new Set();
        this._layout = layout;
        this._currentZoneIndex = currentZoneIndex;
        this._zoneWidgets = [];

        // Add to chrome and position fullscreen
        Main.layoutManager.addChrome(this);
        this._positionFullscreen();

        // Build the selector UI
        this._buildUI();

        // Handle ESC key
        this._signalIds.push(this.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Escape) {
                this.emit('cancelled');
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }));

        // Handle background clicks - cancel if not clicking a button
        this._signalIds.push(this.connect('button-press-event', (actor, event) => {
            const [x, y] = event.get_coords();
            const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);

            // Only cancel if clicking on background (this widget), not on buttons
            if (target === this) {
                this.emit('cancelled');
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }));

        // Grab keyboard focus
        this.grab_key_focus();
    }

    _debug(message) {
        if (this._settings && this._settings.get_boolean('debug-mode')) {
            console.log(`SnapKit WindowSelector: ${message}`);
        }
    }

    _positionFullscreen() {
        // Get the monitor where the pointer currently is (active monitor)
        const currentMonitorIndex = global.display.get_current_monitor();
        const monitor = Main.layoutManager.monitors[currentMonitorIndex];
        if (!monitor) {
            this._debug('No current monitor found, cannot show window selector');
            this.emit('cancelled');
            return;
        }
        this._monitor = monitor;
        this._monitorIndex = currentMonitorIndex;

        // Get work area for zone calculations
        this._workArea = Main.layoutManager.getWorkAreaForMonitor(currentMonitorIndex);

        this._debug(`Positioning window selector on monitor ${currentMonitorIndex}: ${monitor.x},${monitor.y} ${monitor.width}x${monitor.height}`);
        this.set_position(monitor.x, monitor.y);
        this.set_size(monitor.width, monitor.height);
    }

    /**
     * Get current zone dimensions
     */
    getCurrentZoneDimensions() {
        if (!this._layout || !this._workArea || this._currentZoneIndex >= this._layout.zones.length) {
            return null;
        }
        const zone = this._layout.zones[this._currentZoneIndex];
        return {
            width: Math.round(zone.width * this._workArea.width),
            height: Math.round(zone.height * this._workArea.height)
        };
    }

    /**
     * Estimate minimum size for a window
     */
    _getWindowMinSize(window) {
        let minWidth = 100;
        let minHeight = 100;

        try {
            const frameRect = window.get_frame_rect();
            // If window is already small, that's likely near its minimum
            if (frameRect.width < 400) {
                minWidth = Math.max(minWidth, frameRect.width);
            }
            if (frameRect.height < 300) {
                minHeight = Math.max(minHeight, frameRect.height);
            }
        } catch (e) {
            this._debug(`Error getting min size: ${e.message}`);
        }

        return { width: minWidth, height: minHeight };
    }

    /**
     * Check if a window can fit in the current zone
     */
    _canWindowFitCurrentZone(window) {
        const zoneDims = this.getCurrentZoneDimensions();
        if (!zoneDims) {
            return { fits: true }; // Can't determine, assume it fits
        }

        const minSize = this._getWindowMinSize(window);
        return {
            fits: zoneDims.width >= minSize.width && zoneDims.height >= minSize.height,
            zoneWidth: zoneDims.width,
            zoneHeight: zoneDims.height,
            minWidth: minSize.width,
            minHeight: minSize.height
        };
    }

    _buildUI() {
        // Container for centering content
        this._container = new St.Bin({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            style: 'padding-top: 40px;'
        });
        this.add_child(this._container);

        // Content box - vertically stacks zone preview, title, grid, and controls
        this._contentBox = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER
        });
        this._container.set_child(this._contentBox);

        // Zone preview at top (if layout provided)
        if (this._layout) {
            this._buildZonePreview();
        }

        // Title
        const title = new St.Label({
            text: 'Select a window to snap',
            style: 'font-size: 24px; font-weight: bold; color: white; margin-top: 30px; margin-bottom: 20px;'
        });
        this._contentBox.add_child(title);

        // Grid of window thumbnails - horizontal row
        this._windowGrid = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 16px;'
        });
        this._contentBox.add_child(this._windowGrid);

        // Get all snapable windows and create buttons
        this._populateWindows();

        // Bottom section with instructions and button
        const bottomSection = new St.BoxLayout({
            vertical: true,
            style: 'margin-top: 40px;'
        });
        this._contentBox.add_child(bottomSection);

        // Subtitle instruction
        const subtitle = new St.Label({
            text: 'Click a window to snap it, or press ESC to cancel',
            style: 'font-size: 14px; color: rgba(255, 255, 255, 0.6); margin-bottom: 16px;'
        });
        bottomSection.add_child(subtitle);

        // Skip button
        const skipButton = new St.Button({
            label: 'Skip This Zone'
        });
        skipButton.set_style(`
            background-color: rgba(230, 126, 34, 0.9);
            border: none;
            border-radius: 6px;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: bold;
            color: white;
        `);
        skipButton.connect('clicked', () => {
            this._debug('Skip zone clicked');
            this.emit('skip-zone');
        });
        skipButton.connect('enter-event', () => {
            skipButton.set_style(`
                background-color: rgba(230, 126, 34, 1.0);
                border: none;
                border-radius: 6px;
                padding: 10px 20px;
                font-size: 14px;
                font-weight: bold;
                color: white;
            `);
        });
        skipButton.connect('leave-event', () => {
            skipButton.set_style(`
                background-color: rgba(230, 126, 34, 0.9);
                border: none;
                border-radius: 6px;
                padding: 10px 20px;
                font-size: 14px;
                font-weight: bold;
                color: white;
            `);
        });
        bottomSection.add_child(skipButton);
    }

    _populateWindows() {
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = workspace.list_windows();

        // Filter to snapable windows (including minimized, excluding already positioned)
        const snapableWindows = windows.filter(w => {
            return w.window_type === Meta.WindowType.NORMAL &&
                   w.allows_move() &&
                   w.allows_resize() &&
                   !w.is_fullscreen() &&
                   !this._positionedWindows.has(w);
        });

        // Sort by recency
        snapableWindows.sort((a, b) => b.get_user_time() - a.get_user_time());

        this._debug(`Found ${snapableWindows.length} snapable windows`);

        // Get max windows from settings
        const maxWindowsSetting = this._settings.get_int('max-window-thumbnails');
        const maxWindows = Math.min(snapableWindows.length, maxWindowsSetting);

        for (let i = 0; i < maxWindows; i++) {
            const window = snapableWindows[i];
            const button = this._createWindowButton(window);
            this._windowButtons.push(button);
            this._windowGrid.add_child(button);

            // Monitor window closure
            try {
                const destroyId = window.connect('unmanaged', () => {
                    this._onWindowClosed(window, button);
                });
                this._windowDestroyIds.set(window, destroyId);
            } catch (e) {
                this._debug(`Failed to connect window destroy handler: ${e.message}`);
            }
        }

        // If no windows, show message
        if (maxWindows === 0) {
            const noWindowsLabel = new St.Label({
                text: 'No windows available to snap',
                style_class: 'no-windows-label'
            });
            noWindowsLabel.set_style('font-size: 18pt; color: rgba(255, 255, 255, 0.5);');
            this._windowGrid.add_child(noWindowsLabel);
        }
    }

    _buildZonePreview() {
        // Layout name
        const layoutName = new St.Label({
            text: this._layout.name,
            style: 'font-size: 20px; font-weight: bold; color: white; margin-bottom: 16px;'
        });
        this._contentBox.add_child(layoutName);

        // Zone preview container - fixed size, don't expand
        const previewWidth = 400;
        const previewHeight = 250;

        const previewBox = new St.Widget({
            width: previewWidth,
            height: previewHeight,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
            style: 'background-color: rgba(30, 30, 30, 0.95); border: 2px solid rgba(255, 255, 255, 0.3); border-radius: 12px;',
            layout_manager: new Clutter.FixedLayout()
        });
        this._contentBox.add_child(previewBox);

        // Create zone widgets
        const padding = 8;
        const usableWidth = previewWidth - padding * 2;
        const usableHeight = previewHeight - padding * 2;

        for (let i = 0; i < this._layout.zones.length; i++) {
            const zone = this._layout.zones[i];

            const x = padding + Math.floor(zone.x * usableWidth);
            const y = padding + Math.floor(zone.y * usableHeight);
            const w = Math.max(1, Math.floor(zone.width * usableWidth) - 4);
            const h = Math.max(1, Math.floor(zone.height * usableHeight) - 4);

            const zoneWidget = new St.Bin({
                width: w,
                height: h,
                x: x,
                y: y
            });

            // Style based on zone state
            let bgColor, borderStyle;
            if (i === this._currentZoneIndex) {
                // Current zone - bright blue
                bgColor = 'rgba(53, 132, 228, 0.8)';
                borderStyle = '3px solid white';
            } else if (i < this._currentZoneIndex) {
                // Already filled - green
                bgColor = 'rgba(38, 162, 105, 0.6)';
                borderStyle = '2px solid rgba(255,255,255,0.5)';
            } else {
                // Future zone - dim
                bgColor = 'rgba(100, 100, 100, 0.4)';
                borderStyle = '2px solid rgba(255,255,255,0.2)';
            }
            zoneWidget.set_style(`background-color: ${bgColor}; border: ${borderStyle}; border-radius: 6px;`);

            // Add zone label
            const zoneLabel = new St.Label({
                text: zone.id || `${i + 1}`,
                style: 'font-size: 12px; color: white; font-weight: bold;'
            });
            zoneWidget.set_child(zoneLabel);

            previewBox.add_child(zoneWidget);
            this._zoneWidgets.push({ zone, widget: zoneWidget, index: i });
        }

        this._previewBox = previewBox;
    }

    updateCurrentZone(newIndex) {
        this._currentZoneIndex = newIndex;

        // Update zone widget styles
        for (let { widget, index } of this._zoneWidgets) {
            let bgColor, borderStyle;
            if (index === this._currentZoneIndex) {
                bgColor = 'rgba(53, 132, 228, 0.8)';
                borderStyle = '3px solid white';
            } else if (index < this._currentZoneIndex) {
                bgColor = 'rgba(38, 162, 105, 0.6)';
                borderStyle = '2px solid rgba(255,255,255,0.5)';
            } else {
                bgColor = 'rgba(100, 100, 100, 0.4)';
                borderStyle = '2px solid rgba(255,255,255,0.2)';
            }
            widget.set_style(`background-color: ${bgColor}; border: ${borderStyle}; border-radius: 6px;`);
        }

        // Refresh window list to recalculate which windows fit in the new zone
        this.refresh();
    }

    _onWindowClosed(window, button) {
        this._debug(`Window closed: ${window.get_title()}`);
        // Disable and visually indicate the button is no longer valid
        if (button && !button.is_destroyed()) {
            button.set_sensitive(false);
            button.set_opacity(128);
        }
    }

    _createWindowButton(window) {
        const button = new St.Button({
            style_class: 'window-selector-button',
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        // Store button signal IDs for cleanup
        button._signalIds = [];
        button._window = window;  // Store window reference

        // Check if window is already positioned
        const isPositioned = this._positionedWindows.has(window);

        // Check if window can fit in current zone
        const fitCheck = this._canWindowFitCurrentZone(window);
        const canFit = fitCheck.fits;

        // Size and padding are configurable via settings
        const buttonWidth = Math.min(600, Math.max(200, this._settings.get_int('snap-thumbnail-width') || 400));
        const buttonHeight = Math.min(500, Math.max(180, this._settings.get_int('snap-thumbnail-height') || 320));
        const padding = Math.min(64, Math.max(0, this._settings.get_int('snap-thumbnail-padding') || 16));
        const showLabels = this._settings.get_boolean('show-window-labels');

        // Base style depends on positioned state and fit status
        let baseStyle;
        if (isPositioned) {
            baseStyle = `background-color: rgba(38, 162, 105, 0.4);
               border: 2px solid rgba(38, 162, 105, 0.8);
               border-radius: 12px;
               padding: ${padding}px;
               width: ${buttonWidth}px;
               height: ${buttonHeight}px;`;
        } else if (!canFit) {
            // Window won't fit - show with warning style
            baseStyle = `background-color: rgba(192, 28, 40, 0.3);
               border: 2px solid rgba(192, 28, 40, 0.7);
               border-radius: 12px;
               padding: ${padding}px;
               width: ${buttonWidth}px;
               height: ${buttonHeight}px;`;
        } else {
            baseStyle = `background-color: rgba(255, 255, 255, 0.08);
               border: 1px solid rgba(255, 255, 255, 0.15);
               border-radius: 12px;
               padding: ${padding}px;
               width: ${buttonWidth}px;
               height: ${buttonHeight}px;`;
        }

        button.set_style(baseStyle);
        button._baseStyle = baseStyle;
        button._isPositioned = isPositioned;
        button._canFit = canFit;

        const box = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        button.set_child(box);

        // Status indicator (positioned, won't fit, or minimized)
        if (isPositioned) {
            const positionedIndicator = new St.Label({
                text: '✓ Placed',
                x_align: Clutter.ActorAlign.CENTER
            });
            positionedIndicator.set_style(`
                font-size: 11px;
                color: white;
                background-color: rgba(38, 162, 105, 1.0);
                padding: 3px 10px;
                border-radius: 10px;
                font-weight: bold;
                margin-bottom: 8px;
            `);
            box.add_child(positionedIndicator);
        } else if (!canFit) {
            const wontFitIndicator = new St.Label({
                text: '⚠ Too Large',
                x_align: Clutter.ActorAlign.CENTER
            });
            wontFitIndicator.set_style(`
                font-size: 11px;
                color: white;
                background-color: rgba(192, 28, 40, 0.9);
                padding: 3px 10px;
                border-radius: 10px;
                font-weight: bold;
                margin-bottom: 8px;
            `);
            box.add_child(wontFitIndicator);
        } else if (window.minimized) {
            const minimizedIndicator = new St.Label({
                text: '⊖ Minimized',
                x_align: Clutter.ActorAlign.CENTER
            });
            minimizedIndicator.set_style(`
                font-size: 11px;
                color: white;
                background-color: rgba(150, 150, 150, 0.8);
                padding: 3px 10px;
                border-radius: 10px;
                margin-bottom: 8px;
            `);
            box.add_child(minimizedIndicator);
        }

        // Window thumbnail
        const labelSpace = showLabels ? 60 : 20;
        const targetWidth = Math.max(80, buttonWidth - padding * 2);
        const targetHeight = Math.max(80, buttonHeight - padding * 2 - labelSpace);

        const thumbnailWrapper = this._createWindowThumbnail(window, targetWidth, targetHeight);
        if (thumbnailWrapper) {
            button._clone = thumbnailWrapper._clone;  // Store clone reference for cleanup
            box.add_child(thumbnailWrapper);
        }

        // Labels (single line, optional)
        if (showLabels) {
            const app = Shell.WindowTracker.get_default().get_window_app(window);
            const labelText = app ? `${window.get_title() || 'Untitled'} — ${app.get_name()}` : (window.get_title() || 'Untitled');
            const title = new St.Label({
                text: labelText,
                x_align: Clutter.ActorAlign.CENTER
            });
            title.set_style(`
                font-size: 13px;
                font-weight: 500;
                color: white;
                margin-top: 10px;
                max-width: ${Math.max(120, targetWidth - 20)}px;
                text-align: center;
            `);
            title.clutter_text.ellipsize = 3; // PANGO_ELLIPSIZE_END
            box.add_child(title);
        }

        // Handle hover
        button._signalIds.push(button.connect('enter-event', () => {
            if (isPositioned) {
                button.set_style(`
                    background-color: rgba(192, 97, 203, 0.5);
                    border: 2px solid rgba(192, 97, 203, 0.9);
                    border-radius: 12px;
                    padding: ${padding}px;
                    width: ${buttonWidth}px;
                    height: ${buttonHeight}px;
                `);
            } else if (!canFit) {
                // Warning hover - slightly brighter red
                button.set_style(`
                    background-color: rgba(192, 28, 40, 0.5);
                    border: 2px solid rgba(192, 28, 40, 0.9);
                    border-radius: 12px;
                    padding: ${padding}px;
                    width: ${buttonWidth}px;
                    height: ${buttonHeight}px;
                `);
            } else {
                button.set_style(`
                    background-color: rgba(53, 132, 228, 0.4);
                    border: 2px solid rgba(53, 132, 228, 0.8);
                    border-radius: 12px;
                    padding: ${padding}px;
                    width: ${buttonWidth}px;
                    height: ${buttonHeight}px;
                `);
            }
        }));

        button._signalIds.push(button.connect('leave-event', () => {
            button.set_style(button._baseStyle);
        }));

        // Handle click
        button._signalIds.push(button.connect('clicked', () => {
            if (isPositioned) {
                this._debug(`Removing positioned window: ${window.get_title()}`);
                this.emit('window-deselected', window);
            } else {
                this._debug(`Window selected: ${window.get_title()}`);
                this.emit('window-selected', window);
            }
        }));

        return button;
    }

    _createWindowThumbnail(window, targetWidth, targetHeight) {
        const TARGET_WIDTH = targetWidth;
        const TARGET_HEIGHT = targetHeight;

        try {
            // For minimized windows, use app icon instead of clone
            if (window.minimized) {
                const app = Shell.WindowTracker.get_default().get_window_app(window);
                if (app) {
                    const icon = app.create_icon_texture(Math.max(TARGET_WIDTH, TARGET_HEIGHT));
                    icon.set_size(TARGET_WIDTH, TARGET_HEIGHT);
                    return icon;
                }
                return null;
            }

            const windowActor = window.get_compositor_private();
            if (!windowActor) {
                // Fallback to app icon
                const app = Shell.WindowTracker.get_default().get_window_app(window);
                if (app) {
                    const icon = app.create_icon_texture(128);
                    icon.set_size(128, 128);
                    return icon;
                }
                return null;
            }

            const [width, height] = windowActor.get_size();
            if (width === 0 || height === 0) {
                return null;
            }

            const clone = new Clutter.Clone({
                source: windowActor,
                reactive: false
            });

            // Resize to cover the target area while preserving aspect ratio
            const scale = Math.max(TARGET_WIDTH / width, TARGET_HEIGHT / height);
            const scaledWidth = width * scale;
            const scaledHeight = height * scale;
            clone.set_size(scaledWidth, scaledHeight);

            // Wrapper that clips overflow so the scaled clone fills the area
            const wrapper = new St.Widget({
                width: TARGET_WIDTH,
                height: TARGET_HEIGHT,
                x_expand: true,
                y_expand: true,
                layout_manager: new Clutter.BinLayout(),
                clip_to_allocation: true
            });
            clone.set_position((TARGET_WIDTH - scaledWidth) / 2, (TARGET_HEIGHT - scaledHeight) / 2);
            wrapper.add_child(clone);
            wrapper._clone = clone;

            return wrapper;
        } catch (e) {
            this._debug(`Failed to create thumbnail: ${e.message}`);
            return null;
        }
    }

    show() {
        this.visible = true;
        this.opacity = 0;
        this.ease({
            opacity: 255,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    }

    hide() {
        this.ease({
            opacity: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.visible = false;
            }
        });
    }

    refresh() {
        this._debug('Refreshing window list');

        try {
            // Clean up old buttons and windows
            for (let button of this._windowButtons) {
                try {
                    // Disconnect button signals
                    if (button._signalIds) {
                        for (let id of button._signalIds) {
                            button.disconnect(id);
                        }
                        button._signalIds = [];
                    }

                    // Clean up clone
                    if (button._clone) {
                        button._clone.set_source(null);
                        button._clone.destroy();
                        button._clone = null;
                    }
                } catch (e) {
                    this._debug(`Error cleaning up button during refresh: ${e.message}`);
                }
            }
            this._windowButtons = [];

            // Disconnect window destroy handlers
            for (let [window, id] of this._windowDestroyIds) {
                try {
                    if (window) {
                        window.disconnect(id);
                    }
                } catch (e) {
                    // Window may already be destroyed
                }
            }
            this._windowDestroyIds.clear();

            // Clear the window grid
            this._windowGrid.destroy_all_children();

            // Repopulate with current windows
            this._populateWindows();
        } catch (e) {
            this._debug(`Error in refresh: ${e.message}`);
        }
    }

    destroy() {
        try {
            // Disconnect all widget signal handlers
            for (let id of this._signalIds) {
                try {
                    this.disconnect(id);
                } catch (e) {
                    // Signal may already be disconnected
                }
            }
            this._signalIds = [];

            // Disconnect window destroy handlers
            for (let [window, id] of this._windowDestroyIds) {
                try {
                    if (window) {
                        window.disconnect(id);
                    }
                } catch (e) {
                    // Window may already be destroyed
                }
            }
            this._windowDestroyIds.clear();

            // Clean up button signal handlers and clones
            for (let button of this._windowButtons) {
                try {
                    // Disconnect button signals
                    if (button._signalIds) {
                        for (let id of button._signalIds) {
                            button.disconnect(id);
                        }
                        button._signalIds = [];
                    }

                    // Clean up Clutter.Clone to release texture references
                    if (button._clone) {
                        button._clone.set_source(null);
                        button._clone.destroy();
                        button._clone = null;
                    }
                } catch (e) {
                    this._debug(`Error cleaning up button: ${e.message}`);
                }
            }
            this._windowButtons = [];

            // Remove from chrome
            Main.layoutManager.removeChrome(this);

            // Call parent destroy
            super.destroy();
        } catch (e) {
            console.error(`SnapKit WindowSelector: Error in destroy: ${e.message}`);
        }
    }
});
