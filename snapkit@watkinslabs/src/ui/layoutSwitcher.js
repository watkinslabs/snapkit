/**
 * LayoutSwitcher - Quick layout switching UI
 *
 * Features:
 * - Shows available layouts with thumbnails
 * - Keyboard navigation (arrow keys, numbers)
 * - Quick switch with Enter
 * - Per-monitor layout switching
 * - Shows current layout
 *
 * Similar to Alt+Tab behavior but for layouts.
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Logger } from '../core/logger.js';

export class LayoutSwitcher {
    /**
     * @param {LayoutManager} layoutManager
     * @param {LayoutResolver} layoutResolver
     * @param {EventBus} eventBus
     */
    constructor(layoutManager, layoutResolver, eventBus) {
        if (!layoutManager || !layoutResolver || !eventBus) {
            throw new Error('All dependencies are required');
        }

        this._layoutManager = layoutManager;
        this._layoutResolver = layoutResolver;
        this._eventBus = eventBus;
        this._logger = new Logger('LayoutSwitcher');

        // UI components
        this._container = null;
        this._layoutGrid = null;
        this._layoutItems = [];

        // State
        this._layouts = [];
        this._currentLayoutId = null;
        this._selectedIndex = 0;
        this._monitorIndex = null;

        // Signals
        this._signalIds = [];
    }

    /**
     * Initialize layout switcher
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
            style: `
                background-color: rgba(20, 20, 20, 0.95);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                padding: 20px;
            `,
            vertical: true,
            reactive: true,
            visible: false
        });

        // Create header
        const header = new St.Label({
            text: 'Select Layout',
            style: `
                color: white;
                font-size: 18px;
                font-weight: bold;
                padding-bottom: 16px;
            `
        });
        this._container.add_child(header);

        // Create layout grid
        this._layoutGrid = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px;'
        });
        this._container.add_child(this._layoutGrid);

        // Create footer
        const footer = new St.Label({
            text: '← → Navigate  •  Enter Select  •  Esc Cancel',
            style: `
                color: rgba(255, 255, 255, 0.7);
                font-size: 12px;
                padding-top: 16px;
            `
        });
        this._container.add_child(footer);

        // Add to parent
        parent.add_child(this._container);

        this._logger.info('LayoutSwitcher initialized');
    }

    /**
     * Show layout switcher
     *
     * @param {Object} options - {monitorIndex, currentLayoutId}
     */
    show(options = {}) {
        if (!this._container) {
            this._logger.warn('Not initialized');
            return;
        }

        this._monitorIndex = options.monitorIndex ?? 0;
        this._currentLayoutId = options.currentLayoutId ?? null;

        // Get available layouts
        this._layouts = this._getAvailableLayouts();

        if (this._layouts.length === 0) {
            this._logger.warn('No layouts available');
            return;
        }

        // Build layout grid
        this._buildLayoutGrid();

        // Find current layout index
        if (this._currentLayoutId) {
            const currentIndex = this._layouts.findIndex(l => l.id === this._currentLayoutId);
            this._selectedIndex = currentIndex >= 0 ? currentIndex : 0;
        } else {
            this._selectedIndex = 0;
        }

        // Update selection
        this._updateSelection();

        // Position switcher
        const monitor = Main.layoutManager.monitors[this._monitorIndex];
        if (monitor) {
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
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });

        this._logger.debug('Layout switcher shown', {
            layoutCount: this._layouts.length,
            monitorIndex: this._monitorIndex
        });
    }

    /**
     * Hide layout switcher
     */
    hide() {
        if (!this._container || !this._container.visible) {
            return;
        }

        // Fade out
        this._container.ease({
            opacity: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                this._container.hide();
                this._clearLayoutGrid();
            }
        });

        this._logger.debug('Layout switcher hidden');
    }

    /**
     * Get available layouts
     * @private
     * @returns {Array}
     */
    _getAvailableLayouts() {
        const layouts = [];

        // Get built-in layouts
        const builtInIds = this._layoutManager.getBuiltInLayouts();
        for (const id of builtInIds) {
            const layout = this._layoutManager.getLayout(id);
            if (layout) {
                layouts.push({ id, layout, name: this._formatLayoutName(id) });
            }
        }

        // Get custom layouts
        const customIds = this._layoutManager.getCustomLayouts();
        for (const id of customIds) {
            const layout = this._layoutManager.getLayout(id);
            if (layout) {
                layouts.push({ id, layout, name: id });
            }
        }

        return layouts;
    }

    /**
     * Format layout name
     * @private
     * @param {string} id
     * @returns {string}
     */
    _formatLayoutName(id) {
        // Convert 'grid-2x2' to '2x2'
        if (id.startsWith('grid-')) {
            return id.substring(5).toUpperCase();
        }
        return id;
    }

    /**
     * Build layout grid
     * @private
     */
    _buildLayoutGrid() {
        this._clearLayoutGrid();

        for (let i = 0; i < this._layouts.length; i++) {
            const layoutData = this._layouts[i];
            const item = this._createLayoutItem(layoutData, i);
            this._layoutGrid.add_child(item);
            this._layoutItems.push(item);
        }
    }

    /**
     * Create layout item
     * @private
     * @param {Object} layoutData
     * @param {number} index
     * @returns {St.Button}
     */
    _createLayoutItem(layoutData, index) {
        const item = new St.Button({
            style: `
                background-color: rgba(50, 50, 50, 0.8);
                border: 2px solid transparent;
                border-radius: 6px;
                padding: 12px;
                min-width: 100px;
            `,
            reactive: true,
            vertical: true
        });

        const box = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 8px;'
        });

        // Layout thumbnail
        const thumbnail = this._createLayoutThumbnail(layoutData.layout);
        box.add_child(thumbnail);

        // Layout name
        const name = new St.Label({
            text: layoutData.name,
            style: `
                color: white;
                font-size: 14px;
                font-weight: bold;
                text-align: center;
            `
        });
        box.add_child(name);

        // Current indicator
        if (layoutData.id === this._currentLayoutId) {
            const currentLabel = new St.Label({
                text: '• Current',
                style: `
                    color: rgba(100, 255, 100, 0.9);
                    font-size: 11px;
                    text-align: center;
                `
            });
            box.add_child(currentLabel);
        }

        item.set_child(box);

        // Click handler
        const clickId = item.connect('clicked', () => {
            this._onLayoutSelected(index);
        });
        this._signalIds.push({ actor: item, id: clickId });

        return item;
    }

    /**
     * Create layout thumbnail
     * @private
     * @param {Object} layout
     * @returns {St.Widget}
     */
    _createLayoutThumbnail(layout) {
        const thumbnailSize = { width: 80, height: 60 };
        const thumbnail = new St.Widget({
            style: `
                background-color: rgba(60, 60, 60, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 2px;
            `,
            width: thumbnailSize.width,
            height: thumbnailSize.height
        });

        try {
            // Resolve layout for thumbnail
            const zones = this._layoutResolver.resolve(layout, thumbnailSize, {
                margin: 0,
                padding: 1
            });

            // Draw zones
            for (const zone of zones) {
                const zoneRect = new St.Widget({
                    style: `
                        background-color: rgba(100, 150, 255, 0.4);
                        border: 1px solid rgba(255, 255, 255, 0.6);
                    `,
                    x: zone.x,
                    y: zone.y,
                    width: zone.width,
                    height: zone.height
                });
                thumbnail.add_child(zoneRect);
            }
        } catch (error) {
            this._logger.error('Failed to create thumbnail', { error });
        }

        return thumbnail;
    }

    /**
     * Clear layout grid
     * @private
     */
    _clearLayoutGrid() {
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
        for (const item of this._layoutItems) {
            item.destroy();
        }
        this._layoutItems = [];
        this._layouts = [];
    }

    /**
     * Update selection highlight
     * @private
     */
    _updateSelection() {
        for (let i = 0; i < this._layoutItems.length; i++) {
            const item = this._layoutItems[i];
            if (i === this._selectedIndex) {
                item.set_style(`
                    background-color: rgba(100, 150, 255, 0.6);
                    border: 2px solid rgba(255, 255, 255, 0.9);
                    border-radius: 6px;
                    padding: 12px;
                    min-width: 100px;
                `);

                // Scale effect
                item.ease({
                    scale_x: 1.05,
                    scale_y: 1.05,
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            } else {
                item.set_style(`
                    background-color: rgba(50, 50, 50, 0.8);
                    border: 2px solid transparent;
                    border-radius: 6px;
                    padding: 12px;
                    min-width: 100px;
                `);

                item.ease({
                    scale_x: 1.0,
                    scale_y: 1.0,
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            }
        }
    }

    /**
     * Navigate to previous layout
     */
    navigatePrevious() {
        if (this._layouts.length === 0) {
            return;
        }

        this._selectedIndex = (this._selectedIndex - 1 + this._layouts.length) % this._layouts.length;
        this._updateSelection();
    }

    /**
     * Navigate to next layout
     */
    navigateNext() {
        if (this._layouts.length === 0) {
            return;
        }

        this._selectedIndex = (this._selectedIndex + 1) % this._layouts.length;
        this._updateSelection();
    }

    /**
     * Select current layout
     */
    selectCurrent() {
        if (this._layouts.length === 0) {
            return;
        }

        this._onLayoutSelected(this._selectedIndex);
    }

    /**
     * Direct layout selection by number
     *
     * @param {number} index
     */
    selectByIndex(index) {
        if (index < 0 || index >= this._layouts.length) {
            return;
        }

        this._selectedIndex = index;
        this._updateSelection();
        this._onLayoutSelected(index);
    }

    /**
     * Handle layout selected
     * @private
     * @param {number} index
     */
    _onLayoutSelected(index) {
        const layoutData = this._layouts[index];
        if (!layoutData) {
            return;
        }

        this._logger.debug('Layout selected', {
            index,
            layoutId: layoutData.id
        });

        // Emit event
        this._eventBus.emit('layout-switched', {
            layoutId: layoutData.id,
            layout: layoutData.layout,
            monitorIndex: this._monitorIndex
        });

        // Hide switcher
        this.hide();
    }

    /**
     * Cancel selection
     */
    cancel() {
        this._logger.debug('Layout switching cancelled');
        this._eventBus.emit('layout-switch-cancelled', {});
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
     * Get selected layout
     *
     * @returns {Object|null}
     */
    getSelectedLayout() {
        return this._layouts[this._selectedIndex] || null;
    }

    /**
     * Destroy layout switcher
     */
    destroy() {
        this.hide();

        if (this._container) {
            this._container.destroy();
            this._container = null;
        }

        this._logger.info('LayoutSwitcher destroyed');
    }
}
