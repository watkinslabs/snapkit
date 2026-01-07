/**
 * LayoutPickerBar - Windows 11-style layout picker shown at screen edge
 *
 * Shows all available layouts in a horizontal bar. Each layout displays
 * its zones which are individually clickable/hoverable. Clicking a zone
 * snaps the current/focused window to that specific zone.
 *
 * Features:
 * - Shows at configurable edge (top, bottom, left, right)
 * - Multiple layouts displayed with clickable zones
 * - Hover highlights individual zones
 * - Click snaps focused window to zone
 * - Keyboard navigation support
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Logger } from '../core/logger.js';

export class LayoutPickerBar {
    /**
     * @param {LayoutManager} layoutManager
     * @param {LayoutResolver} layoutResolver
     * @param {MonitorManager} monitorManager
     * @param {SnapHandler} snapHandler
     * @param {EventBus} eventBus
     */
    constructor(layoutManager, layoutResolver, monitorManager, snapHandler, eventBus) {
        if (!layoutManager || !layoutResolver || !monitorManager || !snapHandler || !eventBus) {
            throw new Error('All dependencies are required');
        }

        this._layoutManager = layoutManager;
        this._layoutResolver = layoutResolver;
        this._monitorManager = monitorManager;
        this._snapHandler = snapHandler;
        this._eventBus = eventBus;
        this._logger = new Logger('LayoutPickerBar');

        // UI elements
        this._container = null;
        this._layoutsBox = null;
        this._layoutWidgets = [];

        // Configuration
        this._config = {
            edge: 'top',                              // Which edge to show on
            thumbnailWidth: 120,                      // Layout thumbnail width
            thumbnailHeight: 80,                      // Layout thumbnail height
            padding: 8,                               // Padding around zones
            spacing: 12,                              // Spacing between layouts
            barPadding: 16,                           // Padding inside bar
            animationDuration: 200,                   // Animation duration (ms)
            // Appearance settings
            backgroundColor: 'rgba(30, 30, 30, 0.95)',
            borderRadius: 12,
            zoneColor: 'rgba(100, 150, 255, 0.3)',
            zoneHoverColor: 'rgba(100, 180, 255, 0.7)',
            zoneBorderColor: 'rgba(255, 255, 255, 0.4)',
            zoneBorderHoverColor: 'rgba(255, 255, 255, 0.9)',
            textColor: 'rgba(255, 255, 255, 0.9)'
        };

        // State
        this._visible = false;
        this._monitorIndex = 0;
        this._hoveredZone = null;
        this._selectedLayoutIndex = 0;
        this._selectedZoneIndex = 0;
        this._hideTimeoutId = null;
    }

    /**
     * Initialize the layout picker bar
     * @param {Clutter.Actor} parent - Parent actor (usually Main.uiGroup)
     */
    initialize(parent) {
        if (this._container) {
            this._logger.warn('Already initialized');
            return;
        }

        this._parent = parent;

        // Create main container (orientation set in _updateOrientation)
        this._container = new St.BoxLayout({
            name: 'turtle-layout-picker-bar',
            style_class: 'turtle-layout-picker-bar',
            style: `
                background-color: rgba(30, 30, 30, 0.95);
                border-radius: 12px;
                padding: ${this._config.barPadding}px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            `,
            vertical: false,
            reactive: true,
            visible: false,
            opacity: 0
        });

        // Create layouts container
        this._layoutsBox = new St.BoxLayout({
            vertical: false,
            style: `spacing: ${this._config.spacing}px;`
        });
        this._container.add_child(this._layoutsBox);

        // Connect signals
        this._container.connect('enter-event', () => {
            this._onBarEnter();
            return Clutter.EVENT_PROPAGATE;
        });

        this._container.connect('leave-event', () => {
            this._onBarLeave();
            return Clutter.EVENT_PROPAGATE;
        });

        // Add to parent
        parent.add_child(this._container);

        this._logger.info('LayoutPickerBar initialized');
    }

    /**
     * Update bar orientation based on edge
     * @private
     */
    _updateOrientation() {
        const isVertical = this._config.edge === 'left' || this._config.edge === 'right';

        this._container.vertical = isVertical;
        this._layoutsBox.vertical = isVertical;
    }

    /**
     * Show the layout picker bar on specified monitor
     * @param {number} monitorIndex
     */
    show(monitorIndex = 0) {
        if (!this._container) {
            this._logger.warn('Not initialized');
            return;
        }

        this._cancelHideTimeout();
        this._monitorIndex = monitorIndex;

        // Update orientation based on edge
        this._updateOrientation();

        // Build layout widgets
        this._buildLayoutWidgets();

        // Make visible but transparent so we can measure size
        this._container.opacity = 0;
        this._container.visible = true;

        // Position bar after layout is calculated (need to wait for size)
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._positionBar();

            // Show with animation
            this._container.ease({
                opacity: 255,
                duration: this._config.animationDuration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });

            return GLib.SOURCE_REMOVE;
        });

        this._visible = true;
        this._logger.debug('Layout picker bar shown', { monitorIndex });

        // Emit event
        this._eventBus.emit('layout-picker-shown', { monitorIndex });
    }

    /**
     * Hide the layout picker bar
     */
    hide() {
        if (!this._container || !this._visible) {
            return;
        }

        this._cancelHideTimeout();

        this._container.ease({
            opacity: 0,
            duration: this._config.animationDuration,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                this._container.visible = false;
                this._clearLayoutWidgets();
            }
        });

        this._visible = false;
        this._hoveredZone = null;
        this._logger.debug('Layout picker bar hidden');

        // Emit event
        this._eventBus.emit('layout-picker-hidden', {});
    }

    /**
     * Build layout widgets for all available layouts
     * @private
     */
    _buildLayoutWidgets() {
        this._clearLayoutWidgets();

        const layouts = this._getAvailableLayouts();

        for (let i = 0; i < layouts.length; i++) {
            const layoutData = layouts[i];
            const widget = this._createLayoutWidget(layoutData, i);
            this._layoutsBox.add_child(widget);
            this._layoutWidgets.push({ widget, layoutData, zones: [] });
        }

        this._logger.debug('Built layout widgets', { count: layouts.length });
    }

    /**
     * Get available layouts
     * @private
     * @returns {Array}
     */
    _getAvailableLayouts() {
        const layouts = [];

        // Get built-in layouts (returns array of layout objects)
        const builtInLayouts = this._layoutManager.getBuiltinLayouts();
        for (const layoutDef of builtInLayouts) {
            layouts.push({
                id: layoutDef.id,
                layout: layoutDef.layout,
                name: layoutDef.name || this._formatLayoutName(layoutDef.id)
            });
        }

        // Get custom layouts (returns array of layout objects)
        const customLayouts = this._layoutManager.getCustomLayouts();
        for (const layoutDef of customLayouts) {
            layouts.push({
                id: layoutDef.id,
                layout: layoutDef.layout,
                name: layoutDef.name || layoutDef.id
            });
        }

        return layouts;
    }

    /**
     * Format layout name for display
     * @private
     * @param {string} id
     * @returns {string}
     */
    _formatLayoutName(id) {
        // Convert kebab-case to Title Case
        return id.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    /**
     * Create widget for a single layout with clickable zones
     * @private
     * @param {Object} layoutData
     * @param {number} layoutIndex
     * @returns {St.Widget}
     */
    _createLayoutWidget(layoutData, layoutIndex) {
        const { thumbnailWidth, thumbnailHeight, padding } = this._config;

        // Container for layout
        const container = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 6px;',
            reactive: true
        });

        // Layout thumbnail with zones
        const thumbnail = new St.Widget({
            style: `
                background-color: rgba(50, 50, 50, 0.8);
                border: 2px solid rgba(100, 100, 100, 0.5);
                border-radius: 6px;
            `,
            width: thumbnailWidth,
            height: thumbnailHeight,
            reactive: true
        });

        // Resolve layout zones for thumbnail size
        const workArea = {
            x: 0,
            y: 0,
            width: thumbnailWidth,
            height: thumbnailHeight
        };

        try {
            const zones = this._layoutResolver.resolve(layoutData.layout, workArea, {
                margin: 0,
                padding: padding / 4 // Scale padding for thumbnail
            });

            // Create clickable zone widgets
            const zoneWidgets = [];
            for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
                const zone = zones[zoneIndex];
                const zoneWidget = this._createZoneWidget(
                    zone,
                    layoutData,
                    layoutIndex,
                    zoneIndex
                );
                thumbnail.add_child(zoneWidget);
                zoneWidgets.push(zoneWidget);
            }

            // Store zone widgets reference
            this._layoutWidgets[layoutIndex] = this._layoutWidgets[layoutIndex] || {};
            this._layoutWidgets[layoutIndex].zones = zoneWidgets;

        } catch (error) {
            this._logger.error('Failed to resolve layout zones', { error, layoutId: layoutData.id });
        }

        container.add_child(thumbnail);

        // Layout name label
        const label = new St.Label({
            text: layoutData.name,
            style: `
                color: ${this._config.textColor};
                font-size: 11px;
                font-weight: 500;
                text-align: center;
            `,
            x_align: Clutter.ActorAlign.CENTER
        });
        container.add_child(label);

        return container;
    }

    /**
     * Create a clickable zone widget
     * @private
     * @param {Object} zone - Zone geometry {x, y, width, height}
     * @param {Object} layoutData - Layout data
     * @param {number} layoutIndex
     * @param {number} zoneIndex
     * @returns {St.Button}
     */
    _createZoneWidget(zone, layoutData, layoutIndex, zoneIndex) {
        const zoneWidget = new St.Button({
            style: `
                background-color: ${this._config.zoneColor};
                border: 1px solid ${this._config.zoneBorderColor};
                border-radius: 3px;
            `,
            x: zone.x,
            y: zone.y,
            width: zone.width,
            height: zone.height,
            reactive: true,
            can_focus: true
        });

        // Store metadata
        zoneWidget._layoutData = layoutData;
        zoneWidget._layoutIndex = layoutIndex;
        zoneWidget._zoneIndex = zoneIndex;

        // Hover handlers
        zoneWidget.connect('enter-event', () => {
            this._onZoneEnter(zoneWidget, layoutData, layoutIndex, zoneIndex);
            return Clutter.EVENT_PROPAGATE;
        });

        zoneWidget.connect('leave-event', () => {
            this._onZoneLeave(zoneWidget);
            return Clutter.EVENT_PROPAGATE;
        });

        // Click handler
        zoneWidget.connect('clicked', () => {
            this._onZoneClicked(layoutData, zoneIndex);
        });

        return zoneWidget;
    }

    /**
     * Handle zone hover enter
     * @private
     */
    _onZoneEnter(widget, layoutData, layoutIndex, zoneIndex) {
        // Cancel any pending hide
        this._cancelHideTimeout();

        // Highlight zone
        widget.set_style(`
            background-color: ${this._config.zoneHoverColor};
            border: 2px solid ${this._config.zoneBorderHoverColor};
            border-radius: 3px;
        `);

        this._hoveredZone = { layoutData, layoutIndex, zoneIndex };
        this._selectedLayoutIndex = layoutIndex;
        this._selectedZoneIndex = zoneIndex;

        this._logger.debug('Zone hovered', {
            layoutId: layoutData.id,
            zoneIndex
        });
    }

    /**
     * Handle zone hover leave
     * @private
     */
    _onZoneLeave(widget) {
        // Restore normal style
        widget.set_style(`
            background-color: ${this._config.zoneColor};
            border: 1px solid ${this._config.zoneBorderColor};
            border-radius: 3px;
        `);

        this._hoveredZone = null;
    }

    /**
     * Handle zone clicked
     * @private
     * @param {Object} layoutData
     * @param {number} zoneIndex
     */
    _onZoneClicked(layoutData, zoneIndex) {
        this._logger.debug('Zone clicked', {
            layoutId: layoutData.id,
            zoneIndex
        });

        // Get focused window
        const window = global.display.focus_window;
        if (!window) {
            this._logger.warn('No focused window to snap');
            this.hide();
            return;
        }

        // Check if window is valid for snapping
        if (!this._isValidWindow(window)) {
            this._logger.warn('Window not valid for snapping');
            this.hide();
            return;
        }

        // Snap window to zone
        const success = this._snapHandler.snapToZone(
            window,
            this._monitorIndex,
            layoutData.id,
            zoneIndex,
            layoutData.layout
        );

        if (success) {
            this._logger.info('Window snapped to zone', {
                layoutId: layoutData.id,
                zoneIndex,
                windowTitle: window.get_title()
            });
        }

        // Hide the picker
        this.hide();

        // Emit event
        this._eventBus.emit('zone-snapped', {
            layoutId: layoutData.id,
            zoneIndex,
            monitorIndex: this._monitorIndex,
            window
        });
    }

    /**
     * Check if window is valid for snapping
     * @private
     * @param {Meta.Window} window
     * @returns {boolean}
     */
    _isValidWindow(window) {
        if (!window) {
            return false;
        }

        const windowType = window.get_window_type();
        if (windowType !== Meta.WindowType.NORMAL) {
            return false;
        }

        if (window.is_skip_taskbar() || window.is_override_redirect()) {
            return false;
        }

        return true;
    }

    /**
     * Handle bar enter (mouse entered bar area)
     * @private
     */
    _onBarEnter() {
        this._cancelHideTimeout();
    }

    /**
     * Handle bar leave (mouse left bar area)
     * @private
     */
    _onBarLeave() {
        // Start delayed hide
        this._startHideTimeout();
    }

    /**
     * Start delayed hide timeout
     * @private
     */
    _startHideTimeout() {
        this._cancelHideTimeout();
        this._hideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._hideTimeoutId = null;
            this.hide();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Cancel hide timeout
     * @private
     */
    _cancelHideTimeout() {
        if (this._hideTimeoutId) {
            GLib.source_remove(this._hideTimeoutId);
            this._hideTimeoutId = null;
        }
    }

    /**
     * Position bar on screen edge
     * @private
     */
    _positionBar() {
        const monitor = this._monitorManager.getMonitor(this._monitorIndex);
        if (!monitor) {
            this._logger.warn('Monitor not found', { monitorIndex: this._monitorIndex });
            return;
        }

        const { geometry } = monitor;

        // Calculate bar size
        const barWidth = this._container.width;
        const barHeight = this._container.height;

        let x, y;

        switch (this._config.edge) {
            case 'top':
                x = geometry.x + (geometry.width - barWidth) / 2;
                y = geometry.y + 8; // Small offset from edge
                break;
            case 'bottom':
                x = geometry.x + (geometry.width - barWidth) / 2;
                y = geometry.y + geometry.height - barHeight - 8;
                break;
            case 'left':
                x = geometry.x + 8;
                y = geometry.y + (geometry.height - barHeight) / 2;
                break;
            case 'right':
                x = geometry.x + geometry.width - barWidth - 8;
                y = geometry.y + (geometry.height - barHeight) / 2;
                break;
            default:
                x = geometry.x + (geometry.width - barWidth) / 2;
                y = geometry.y + 8;
        }

        this._container.set_position(x, y);
    }

    /**
     * Clear all layout widgets
     * @private
     */
    _clearLayoutWidgets() {
        for (const item of this._layoutWidgets) {
            if (item.widget) {
                item.widget.destroy();
            }
        }
        this._layoutWidgets = [];
    }

    /**
     * Navigate to previous layout
     */
    navigatePreviousLayout() {
        const count = this._layoutWidgets.length;
        if (count === 0) return;

        this._selectedLayoutIndex = (this._selectedLayoutIndex - 1 + count) % count;
        this._selectedZoneIndex = 0;
        this._updateKeyboardSelection();
    }

    /**
     * Navigate to next layout
     */
    navigateNextLayout() {
        const count = this._layoutWidgets.length;
        if (count === 0) return;

        this._selectedLayoutIndex = (this._selectedLayoutIndex + 1) % count;
        this._selectedZoneIndex = 0;
        this._updateKeyboardSelection();
    }

    /**
     * Navigate to previous zone in current layout
     */
    navigatePreviousZone() {
        const item = this._layoutWidgets[this._selectedLayoutIndex];
        if (!item || !item.zones || item.zones.length === 0) return;

        this._selectedZoneIndex = (this._selectedZoneIndex - 1 + item.zones.length) % item.zones.length;
        this._updateKeyboardSelection();
    }

    /**
     * Navigate to next zone in current layout
     */
    navigateNextZone() {
        const item = this._layoutWidgets[this._selectedLayoutIndex];
        if (!item || !item.zones || item.zones.length === 0) return;

        this._selectedZoneIndex = (this._selectedZoneIndex + 1) % item.zones.length;
        this._updateKeyboardSelection();
    }

    /**
     * Select current zone via keyboard
     */
    selectCurrentZone() {
        const item = this._layoutWidgets[this._selectedLayoutIndex];
        if (!item || !item.layoutData) return;

        this._onZoneClicked(item.layoutData, this._selectedZoneIndex);
    }

    /**
     * Update keyboard selection highlight
     * @private
     */
    _updateKeyboardSelection() {
        // Clear all highlights
        for (const item of this._layoutWidgets) {
            if (item.zones) {
                for (const zone of item.zones) {
                    zone.set_style(`
                        background-color: ${this._config.zoneColor};
                        border: 1px solid ${this._config.zoneBorderColor};
                        border-radius: 3px;
                    `);
                }
            }
        }

        // Highlight selected zone
        const item = this._layoutWidgets[this._selectedLayoutIndex];
        if (item && item.zones && item.zones[this._selectedZoneIndex]) {
            item.zones[this._selectedZoneIndex].set_style(`
                background-color: ${this._config.zoneHoverColor};
                border: 2px solid ${this._config.zoneBorderHoverColor};
                border-radius: 3px;
            `);
        }
    }

    /**
     * Update configuration
     * @param {Object} config
     */
    updateConfig(config) {
        // Behavior settings
        if (config.edge) {
            this._config.edge = config.edge;
        }
        if (config.thumbnailWidth) {
            this._config.thumbnailWidth = config.thumbnailWidth;
        }
        if (config.thumbnailHeight) {
            this._config.thumbnailHeight = config.thumbnailHeight;
        }
        if (config.animationDuration !== undefined) {
            this._config.animationDuration = config.animationDuration;
        }

        // Appearance settings
        if (config.backgroundColor) {
            this._config.backgroundColor = config.backgroundColor;
        }
        if (config.borderRadius !== undefined) {
            this._config.borderRadius = config.borderRadius;
        }
        if (config.zoneColor) {
            this._config.zoneColor = config.zoneColor;
        }
        if (config.zoneHoverColor) {
            this._config.zoneHoverColor = config.zoneHoverColor;
        }
        if (config.zoneBorderColor) {
            this._config.zoneBorderColor = config.zoneBorderColor;
        }
        if (config.zoneBorderHoverColor) {
            this._config.zoneBorderHoverColor = config.zoneBorderHoverColor;
        }
        if (config.textColor) {
            this._config.textColor = config.textColor;
        }

        // Update container style if initialized
        if (this._container) {
            this._container.set_style(`
                background-color: ${this._config.backgroundColor};
                border-radius: ${this._config.borderRadius}px;
                padding: ${this._config.barPadding}px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            `);
        }

        this._logger.debug('Configuration updated', this._config);
    }

    /**
     * Check if visible
     * @returns {boolean}
     */
    get isVisible() {
        return this._visible;
    }

    /**
     * Get current monitor index
     * @returns {number}
     */
    get monitorIndex() {
        return this._monitorIndex;
    }

    /**
     * Destroy the layout picker bar
     */
    destroy() {
        this._cancelHideTimeout();
        this._clearLayoutWidgets();

        if (this._container) {
            this._container.destroy();
            this._container = null;
        }

        this._logger.info('LayoutPickerBar destroyed');
    }
}
