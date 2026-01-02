import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * WindowSelector - Shows thumbnails of all snapable windows for user to select
 */
export const WindowSelector = GObject.registerClass({
    Signals: {
        'window-selected': {param_types: [Meta.Window.$gtype]},
        'window-deselected': {param_types: [Meta.Window.$gtype]},
        'skip-zone': {},
        'cancelled': {}
    }
}, class WindowSelector extends St.Widget {
    _init(settings, positionedWindows = null) {
        super._init({
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        this._settings = settings;
        this._windowButtons = [];
        this._signalIds = [];  // Track signal IDs for cleanup
        this._windowDestroyIds = new Map();  // Track window destroy handlers
        this._positionedWindows = positionedWindows || new Set();  // Track which windows are already positioned

        // Add to chrome and position fullscreen
        Main.layoutManager.addChrome(this);
        this._positionFullscreen();

        // Build the selector UI
        this._buildUI();

        // Handle clicks outside to cancel
        this._signalIds.push(this.connect('button-press-event', (actor, event) => {
            // Check if click is on background (not a window button)
            const [x, y] = event.get_coords();
            const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);

            if (target === this || target === this._background) {
                this.emit('cancelled');
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        }));

        // Handle ESC key
        this._signalIds.push(this.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Escape) {
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
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            this._debug('No primary monitor found, cannot show window selector');
            this.emit('cancelled');
            return;
        }
        this.set_position(monitor.x, monitor.y);
        this.set_size(monitor.width, monitor.height);
    }

    _buildUI() {
        // Semi-transparent dark background
        this._background = new St.Bin({
            style_class: 'window-selector-background',
            reactive: true,
            x_expand: true,
            y_expand: true
        });
        this._background.set_style('background-color: rgba(0, 0, 0, 0.85);');
        this.add_child(this._background);

        // Container for window thumbnails
        const container = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true
        });
        this._background.set_child(container);

        // Title
        const title = new St.Label({
            text: 'Select a window to snap',
            style_class: 'window-selector-title'
        });
        title.set_style('font-size: 24pt; color: white; margin-bottom: 32px;');
        container.add_child(title);

        // Grid of window thumbnails
        this._windowGrid = new St.Widget({
            layout_manager: new Clutter.GridLayout({
                orientation: Clutter.Orientation.HORIZONTAL
            }),
            x_align: Clutter.ActorAlign.CENTER
        });
        container.add_child(this._windowGrid);

        // Get all snapable windows and create buttons
        this._populateWindows();

        // Subtitle instruction
        const subtitle = new St.Label({
            text: 'Click a window, Skip this zone, or press ESC to cancel',
            style_class: 'window-selector-subtitle'
        });
        subtitle.set_style('font-size: 14pt; color: rgba(255, 255, 255, 0.7); margin-top: 20px;');
        container.add_child(subtitle);

        // Skip button
        const skipButton = new St.Button({
            label: 'Skip This Zone',
            style_class: 'window-selector-skip-button',
            reactive: true,
            can_focus: true,
            track_hover: true
        });
        skipButton.set_style(`
            background-color: rgba(230, 126, 34, 0.8);
            border: 2px solid rgba(255, 255, 255, 0.4);
            border-radius: 8px;
            padding: 12px 24px;
            margin-top: 12px;
            font-size: 14pt;
            color: white;
        `);
        skipButton.connect('clicked', () => {
            this._debug('Skip zone clicked');
            this.emit('skip-zone');
        });
        skipButton.connect('enter-event', () => {
            skipButton.set_style(`
                background-color: rgba(230, 126, 34, 1.0);
                border: 2px solid rgba(255, 255, 255, 0.6);
                border-radius: 8px;
                padding: 12px 24px;
                margin-top: 12px;
                font-size: 14pt;
                color: white;
            `);
        });
        skipButton.connect('leave-event', () => {
            skipButton.set_style(`
                background-color: rgba(230, 126, 34, 0.8);
                border: 2px solid rgba(255, 255, 255, 0.4);
                border-radius: 8px;
                padding: 12px 24px;
                margin-top: 12px;
                font-size: 14pt;
                color: white;
            `);
        });
        container.add_child(skipButton);
    }

    _populateWindows() {
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = workspace.list_windows();

        // Filter to only snapable windows
        const snapableWindows = windows.filter(w => {
            return w.window_type === Meta.WindowType.NORMAL &&
                   w.allows_move() &&
                   w.allows_resize() &&
                   !w.is_fullscreen() &&
                   !w.minimized;
        });

        // Sort by recency
        snapableWindows.sort((a, b) => b.get_user_time() - a.get_user_time());

        this._debug(`Found ${snapableWindows.length} snapable windows`);

        // Get max windows from settings
        const maxWindowsSetting = this._settings.get_int('max-window-thumbnails');
        const maxWindows = Math.min(snapableWindows.length, maxWindowsSetting);
        const gridLayout = this._windowGrid.layout_manager;
        const columns = Math.min(4, Math.ceil(Math.sqrt(maxWindows)));

        for (let i = 0; i < maxWindows; i++) {
            const window = snapableWindows[i];
            const button = this._createWindowButton(window);
            this._windowButtons.push(button);

            const row = Math.floor(i / columns);
            const col = i % columns;
            gridLayout.attach(button, col, row, 1, 1);

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

        // Base style depends on positioned state
        const baseStyle = isPositioned
            ? `background-color: rgba(38, 162, 105, 0.6);
               border: 3px solid rgba(255, 255, 255, 0.5);
               border-radius: 8px;
               padding: 12px;
               margin: 8px;
               width: 240px;
               height: 180px;`
            : `background-color: rgba(40, 40, 40, 0.95);
               border: 2px solid rgba(255, 255, 255, 0.2);
               border-radius: 8px;
               padding: 12px;
               margin: 8px;
               width: 240px;
               height: 180px;`;

        button.set_style(baseStyle);
        button._baseStyle = baseStyle;
        button._isPositioned = isPositioned;

        const box = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        button.set_child(box);

        // Positioned indicator overlay (checkmark icon)
        if (isPositioned) {
            const positionedIndicator = new St.Label({
                text: '✓ POSITIONED',
                style_class: 'positioned-indicator'
            });
            positionedIndicator.set_style(`
                font-size: 10pt;
                color: rgba(255, 255, 255, 0.9);
                background-color: rgba(38, 162, 105, 0.9);
                padding: 4px 8px;
                border-radius: 4px;
                font-weight: bold;
                margin-bottom: 4px;
            `);
            box.add_child(positionedIndicator);
        }

        // Window thumbnail
        const clone = this._createWindowThumbnail(window);
        if (clone) {
            button._clone = clone;  // Store clone reference for cleanup
            box.add_child(clone);
        }

        // Window title
        const title = new St.Label({
            text: window.get_title() || 'Untitled',
            style_class: 'window-title'
        });
        title.set_style(`
            font-size: 12pt;
            color: white;
            margin-top: 8px;
            max-width: 220px;
        `);
        title.clutter_text.ellipsize = 3; // PANGO_ELLIPSIZE_END
        box.add_child(title);

        // App name
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        if (app) {
            const appLabel = new St.Label({
                text: app.get_name(),
                style_class: 'window-app-name'
            });
            appLabel.set_style(`
                font-size: 10pt;
                color: rgba(255, 255, 255, 0.6);
                margin-top: 4px;
            `);
            appLabel.clutter_text.ellipsize = 3;
            box.add_child(appLabel);
        }

        // Handle hover
        button._signalIds.push(button.connect('enter-event', () => {
            if (isPositioned) {
                button.set_style(`
                    background-color: rgba(192, 97, 203, 0.6);
                    border: 3px solid rgba(255, 255, 255, 0.7);
                    border-radius: 8px;
                    padding: 12px;
                    margin: 8px;
                    width: 240px;
                    height: 180px;
                `);
            } else {
                button.set_style(`
                    background-color: rgba(53, 132, 228, 0.6);
                    border: 2px solid rgba(255, 255, 255, 0.6);
                    border-radius: 8px;
                    padding: 12px;
                    margin: 8px;
                    width: 240px;
                    height: 180px;
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

    _createWindowThumbnail(window) {
        try {
            const windowActor = window.get_compositor_private();
            if (!windowActor) {
                return null;
            }

            const clone = new Clutter.Clone({
                source: windowActor,
                reactive: false
            });

            // Scale to fit 200x100 preview
            const [width, height] = windowActor.get_size();
            const scale = Math.min(200 / width, 100 / height);
            clone.set_scale(scale, scale);
            clone.set_size(width * scale, height * scale);

            return clone;
        } catch (e) {
            this._debug(`Failed to create thumbnail: ${e.message}`);
            return null;
        }
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
