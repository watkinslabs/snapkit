/**
 * WindowSelector - UI for selecting windows to snap
 *
 * Displays list of available windows with:
 * - Window icons
 * - Window titles
 * - Application names
 * - Workspace indicators
 *
 * Used in SELECT_WINDOW state for interactive select workflow.
 */

import { Logger } from '../core/logger.js';

export class WindowSelector {
    /**
     * @param {EventBus} eventBus
     */
    constructor(eventBus) {
        if (!eventBus) {
            throw new Error('eventBus is required');
        }

        this._eventBus = eventBus;
        this._logger = new Logger('WindowSelector');

        // UI components
        this._container = null;
        this._scrollView = null;
        this._windowList = null;
        this._windowItems = [];

        // State
        this._windows = [];
        this._selectedIndex = 0;
        this._filterWorkspace = null;
        this._filterMonitor = null;

        // Signals
        this._signalIds = [];
    }

    /**
     * Initialize window selector
     *
     * @param {Clutter.Actor} parent - Parent actor
     */
    initialize(parent) {
        if (this._container) {
            this._logger.warn('Already initialized');
            return;
        }

        // Create container
        this._container = new St.BoxLayout({
            style_class: 'snapkit-window-selector',
            style: `
                background-color: rgba(20, 20, 20, 0.95);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                padding: 16px;
            `,
            vertical: true,
            reactive: true,
            visible: false
        });

        // Create header
        const header = new St.Label({
            text: 'Select Window',
            style: `
                color: white;
                font-size: 18px;
                font-weight: bold;
                padding-bottom: 12px;
            `
        });
        this._container.add_child(header);

        // Create scroll view
        this._scrollView = new St.ScrollView({
            style: `
                max-height: 400px;
                min-width: 400px;
            `,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC
        });

        // Create window list container
        this._windowList = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 8px;'
        });

        this._scrollView.add_actor(this._windowList);
        this._container.add_child(this._scrollView);

        // Create footer with instructions
        const footer = new St.Label({
            text: '↑↓ Navigate  •  Enter Select  •  Esc Cancel',
            style: `
                color: rgba(255, 255, 255, 0.7);
                font-size: 12px;
                padding-top: 12px;
            `
        });
        this._container.add_child(footer);

        // Add to parent
        parent.add_actor(this._container);

        this._logger.info('WindowSelector initialized');
    }

    /**
     * Show window selector
     *
     * @param {Object} options - {workspace, monitor, position}
     */
    show(options = {}) {
        if (!this._container) {
            this._logger.warn('Not initialized');
            return;
        }

        this._filterWorkspace = options.workspace ?? null;
        this._filterMonitor = options.monitor ?? null;

        // Get available windows
        this._windows = this._getAvailableWindows();

        if (this._windows.length === 0) {
            this._logger.warn('No windows available');
            this._eventBus.emit('window-selector-no-windows', {});
            return;
        }

        // Build window list
        this._buildWindowList();

        // Position selector
        if (options.position) {
            this._container.set_position(options.position.x, options.position.y);
        } else {
            // Center on screen
            const monitor = Main.layoutManager.primaryMonitor;
            this._container.set_position(
                monitor.x + (monitor.width - this._container.width) / 2,
                monitor.y + (monitor.height - this._container.height) / 2
            );
        }

        // Show with fade
        this._container.opacity = 0;
        this._container.show();
        this._container.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });

        // Select first window
        this._selectedIndex = 0;
        this._updateSelection();

        this._logger.debug('Window selector shown', {
            windowCount: this._windows.length,
            workspace: this._filterWorkspace,
            monitor: this._filterMonitor
        });
    }

    /**
     * Hide window selector
     */
    hide() {
        if (!this._container || !this._container.visible) {
            return;
        }

        // Fade out
        this._container.ease({
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                this._container.hide();
                this._clearWindowList();
            }
        });

        this._logger.debug('Window selector hidden');
    }

    /**
     * Get available windows
     * @private
     * @returns {Meta.Window[]}
     */
    _getAvailableWindows() {
        const workspace = this._filterWorkspace !== null
            ? global.workspace_manager.get_workspace_by_index(this._filterWorkspace)
            : global.workspace_manager.get_active_workspace();

        let windows = workspace.list_windows();

        // Filter by window type
        windows = windows.filter(w => {
            if (w.get_window_type() !== Meta.WindowType.NORMAL) {
                return false;
            }
            if (w.is_skip_taskbar()) {
                return false;
            }
            return true;
        });

        // Filter by monitor
        if (this._filterMonitor !== null) {
            windows = windows.filter(w => {
                return w.get_monitor() === this._filterMonitor;
            });
        }

        // Sort by stacking order (most recent first)
        windows.sort((a, b) => {
            return global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                .indexOf(a) - global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
                .indexOf(b);
        });

        return windows;
    }

    /**
     * Build window list UI
     * @private
     */
    _buildWindowList() {
        this._clearWindowList();

        for (let i = 0; i < this._windows.length; i++) {
            const window = this._windows[i];
            const item = this._createWindowItem(window, i);
            this._windowList.add_child(item);
            this._windowItems.push(item);
        }
    }

    /**
     * Create window list item
     * @private
     * @param {Meta.Window} window
     * @param {number} index
     * @returns {St.Button}
     */
    _createWindowItem(window, index) {
        const item = new St.Button({
            style: `
                background-color: rgba(50, 50, 50, 0.8);
                border: 2px solid transparent;
                border-radius: 4px;
                padding: 12px;
            `,
            reactive: true,
            can_focus: true,
            x_expand: true
        });

        const box = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px;'
        });

        // Window icon
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        if (app) {
            const icon = app.create_icon_texture(32);
            box.add_child(icon);
        } else {
            // Placeholder icon
            const icon = new St.Icon({
                icon_name: 'window',
                icon_size: 32
            });
            box.add_child(icon);
        }

        // Window info
        const infoBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        // Window title
        const title = new St.Label({
            text: window.get_title(),
            style: `
                color: white;
                font-size: 14px;
                font-weight: bold;
            `
        });
        infoBox.add_child(title);

        // App name
        if (app) {
            const appName = new St.Label({
                text: app.get_name(),
                style: `
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 12px;
                `
            });
            infoBox.add_child(appName);
        }

        box.add_child(infoBox);
        item.set_child(box);

        // Click handler
        const clickId = item.connect('clicked', () => {
            this._onWindowSelected(index);
        });
        this._signalIds.push({ actor: item, id: clickId });

        return item;
    }

    /**
     * Clear window list
     * @private
     */
    _clearWindowList() {
        // Disconnect signals
        for (const { actor, id } of this._signalIds) {
            try {
                actor.disconnect(id);
            } catch (e) {
                // Actor may be destroyed
            }
        }
        this._signalIds = [];

        // Remove items
        for (const item of this._windowItems) {
            item.destroy();
        }
        this._windowItems = [];
        this._windows = [];
    }

    /**
     * Update selection highlight
     * @private
     */
    _updateSelection() {
        for (let i = 0; i < this._windowItems.length; i++) {
            const item = this._windowItems[i];
            if (i === this._selectedIndex) {
                item.set_style(`
                    background-color: rgba(100, 150, 255, 0.6);
                    border: 2px solid rgba(255, 255, 255, 0.8);
                    border-radius: 4px;
                    padding: 12px;
                `);
            } else {
                item.set_style(`
                    background-color: rgba(50, 50, 50, 0.8);
                    border: 2px solid transparent;
                    border-radius: 4px;
                    padding: 12px;
                `);
            }
        }

        // Scroll to selected item
        if (this._windowItems[this._selectedIndex]) {
            const item = this._windowItems[this._selectedIndex];
            const adjustment = this._scrollView.vscroll.adjustment;
            const [value, lower, upper, stepIncrement, pageIncrement, pageSize] = [
                adjustment.value,
                adjustment.lower,
                adjustment.upper,
                adjustment.step_increment,
                adjustment.page_increment,
                adjustment.page_size
            ];

            const itemY = item.get_transformed_position()[1];
            const scrollY = this._scrollView.get_transformed_position()[1];
            const relativeY = itemY - scrollY;

            if (relativeY < 0) {
                adjustment.value = Math.max(lower, value + relativeY);
            } else if (relativeY + item.height > pageSize) {
                adjustment.value = Math.min(upper - pageSize, value + relativeY + item.height - pageSize);
            }
        }
    }

    /**
     * Navigate to previous window
     */
    navigatePrevious() {
        if (this._windows.length === 0) {
            return;
        }

        this._selectedIndex = (this._selectedIndex - 1 + this._windows.length) % this._windows.length;
        this._updateSelection();
    }

    /**
     * Navigate to next window
     */
    navigateNext() {
        if (this._windows.length === 0) {
            return;
        }

        this._selectedIndex = (this._selectedIndex + 1) % this._windows.length;
        this._updateSelection();
    }

    /**
     * Select current window
     */
    selectCurrent() {
        if (this._windows.length === 0) {
            return;
        }

        this._onWindowSelected(this._selectedIndex);
    }

    /**
     * Handle window selected
     * @private
     * @param {number} index
     */
    _onWindowSelected(index) {
        const window = this._windows[index];
        if (!window) {
            return;
        }

        this._logger.debug('Window selected', {
            index,
            windowTitle: window.get_title()
        });

        // Emit event
        this._eventBus.emit('window-selected', { window });

        // Hide selector
        this.hide();
    }

    /**
     * Cancel selection
     */
    cancel() {
        this._logger.debug('Window selection cancelled');
        this._eventBus.emit('window-selection-cancelled', {});
        this.hide();
    }

    /**
     * Check if visible
     *
     * @returns {boolean}
     */
    get isVisible() {
        return this._container && this._container.visible;
    }

    /**
     * Get selected window
     *
     * @returns {Meta.Window|null}
     */
    getSelectedWindow() {
        return this._windows[this._selectedIndex] || null;
    }

    /**
     * Destroy window selector
     */
    destroy() {
        this.hide();

        if (this._container) {
            this._container.destroy();
            this._container = null;
        }

        this._logger.info('WindowSelector destroyed');
    }
}
