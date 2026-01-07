/**
 * LayoutPreferences - Layout management settings
 *
 * Settings:
 * - Default layout for new monitors
 * - Per-monitor layout configuration
 * - Layout margins and padding defaults
 * - Remember layouts per workspace
 * - Import/export layouts
 *
 * Integrates with GSettings and LayoutManager.
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Logger } from '../core/logger.js';

export class LayoutPreferences {
    /**
     * @param {LayoutManager} layoutManager
     * @param {MonitorManager} monitorManager
     * @param {EventBus} eventBus
     */
    constructor(layoutManager, monitorManager, eventBus) {
        if (!layoutManager || !monitorManager || !eventBus) {
            throw new Error('All dependencies are required');
        }

        this._layoutManager = layoutManager;
        this._monitorManager = monitorManager;
        this._eventBus = eventBus;
        this._logger = new Logger('LayoutPreferences');

        // UI components
        this._container = null;
        this._monitorListBox = null;
        this._monitorItems = [];

        // Settings (will be synced with GSettings)
        this._settings = {
            defaultLayout: 'grid-2x2',
            defaultMargin: 0,
            defaultPadding: 4,
            rememberPerWorkspace: false,
            perMonitorLayouts: {} // monitorIndex -> layoutId
        };

        // Original settings (for reset)
        this._originalSettings = JSON.parse(JSON.stringify(this._settings));

        // Signals
        this._signalIds = [];
    }

    /**
     * Initialize layout preferences
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
                background-color: rgba(30, 30, 30, 0.95);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                padding: 20px;
            `,
            vertical: true,
            reactive: true,
            visible: false
        });

        // Create header
        const header = this._createHeader();
        this._container.add_child(header);

        // Create scrollable settings area
        const scrollView = new St.ScrollView({
            style: `
                max-height: 500px;
                min-width: 600px;
            `,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC
        });

        const settingsBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 16px;'
        });

        // Add settings sections
        this._createDefaultSettings(settingsBox);
        this._createMonitorSettings(settingsBox);
        this._createAdvancedSettings(settingsBox);

        scrollView.add_child(settingsBox);
        this._container.add_child(scrollView);

        // Create footer with actions
        const footer = this._createFooter();
        this._container.add_child(footer);

        // Add to parent
        parent.add_child(this._container);

        this._logger.info('LayoutPreferences initialized');
    }

    /**
     * Create header
     * @private
     * @returns {St.BoxLayout}
     */
    _createHeader() {
        const header = new St.BoxLayout({
            vertical: false,
            style: 'padding-bottom: 16px;'
        });

        const title = new St.Label({
            text: 'Layout Settings',
            style: `
                color: white;
                font-size: 20px;
                font-weight: bold;
            `,
            x_expand: true
        });
        header.add_child(title);

        return header;
    }

    /**
     * Create default settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createDefaultSettings(parent) {
        const section = this._createSection('Default Layout');
        parent.add_child(section);

        // Default layout dropdown
        this._createLayoutDropdown(section, 'Default Layout', 'defaultLayout', this._settings.defaultLayout);

        // Default margin slider
        this._createSliderRow(section, 'Default Margin', 'defaultMargin', 0, 20, this._settings.defaultMargin, (value) => `${value}px`);

        // Default padding slider
        this._createSliderRow(section, 'Default Padding', 'defaultPadding', 0, 20, this._settings.defaultPadding, (value) => `${value}px`);
    }

    /**
     * Create monitor settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createMonitorSettings(parent) {
        const section = this._createSection('Per-Monitor Layouts');
        parent.add_child(section);

        // Info text
        const infoLabel = new St.Label({
            text: 'Configure layout for each monitor',
            style: `
                color: rgba(255, 255, 255, 0.7);
                font-size: 12px;
                padding-bottom: 8px;
            `
        });
        section.add_child(infoLabel);

        // Monitor list container
        this._monitorListBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 8px;'
        });
        section.add_child(this._monitorListBox);

        // Populate monitors
        this._populateMonitors();
    }

    /**
     * Create advanced settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createAdvancedSettings(parent) {
        const section = this._createSection('Advanced');
        parent.add_child(section);

        // Remember per workspace toggle
        this._createToggleRow(section, 'Remember Layouts per Workspace', 'rememberPerWorkspace', this._settings.rememberPerWorkspace);

        // Import/Export buttons
        const importExportRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 8px; padding: 6px 0;'
        });

        const exportButton = new St.Button({
            label: 'Export Layouts',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 8px 16px;
                color: white;
                font-size: 12px;
            `,
            x_expand: true
        });
        const exportId = exportButton.connect('clicked', () => {
            this._exportLayouts();
        });
        this._signalIds.push({ actor: exportButton, id: exportId });
        importExportRow.add_child(exportButton);

        const importButton = new St.Button({
            label: 'Import Layouts',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 8px 16px;
                color: white;
                font-size: 12px;
            `,
            x_expand: true
        });
        const importId = importButton.connect('clicked', () => {
            this._importLayouts();
        });
        this._signalIds.push({ actor: importButton, id: importId });
        importExportRow.add_child(importButton);

        section.add_child(importExportRow);
    }

    /**
     * Populate monitors list
     * @private
     */
    _populateMonitors() {
        // Clear existing
        for (const item of this._monitorItems) {
            item.destroy();
        }
        this._monitorItems = [];

        // Get monitors
        const monitorCount = this._monitorManager.getMonitorCount();

        for (let i = 0; i < monitorCount; i++) {
            const monitor = this._monitorManager.getMonitor(i);
            if (!monitor) continue;

            const isPrimary = i === this._monitorManager.getPrimaryMonitor();
            const currentLayout = this._settings.perMonitorLayouts[i] || this._settings.defaultLayout;

            // Create monitor row
            const row = new St.BoxLayout({
                vertical: false,
                style: `
                    background-color: rgba(50, 50, 50, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                    padding: 10px;
                    spacing: 12px;
                `
            });

            // Monitor info
            const infoBox = new St.BoxLayout({
                vertical: true,
                x_expand: true
            });

            const nameLabel = new St.Label({
                text: `Monitor ${i + 1}${isPrimary ? ' (Primary)' : ''}`,
                style: `
                    color: white;
                    font-size: 14px;
                    font-weight: bold;
                `
            });
            infoBox.add_child(nameLabel);

            const sizeLabel = new St.Label({
                text: `${monitor.width} x ${monitor.height}`,
                style: `
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 12px;
                `
            });
            infoBox.add_child(sizeLabel);

            row.add_child(infoBox);

            // Layout dropdown (simplified - shows current layout)
            const layoutLabel = new St.Label({
                text: currentLayout,
                style: `
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 13px;
                    background-color: rgba(40, 40, 40, 0.8);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 3px;
                    padding: 6px 12px;
                    min-width: 100px;
                `
            });
            row.add_child(layoutLabel);

            // Change button
            const changeButton = new St.Button({
                label: 'Change',
                style: `
                    background-color: rgba(60, 60, 60, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 4px;
                    padding: 6px 12px;
                    color: white;
                    font-size: 12px;
                `
            });
            const btnId = changeButton.connect('clicked', () => {
                this._changeMonitorLayout(i, layoutLabel);
            });
            this._signalIds.push({ actor: changeButton, id: btnId });
            row.add_child(changeButton);

            this._monitorListBox.add_child(row);
            this._monitorItems.push(row);
        }
    }

    /**
     * Change monitor layout
     * @private
     * @param {number} monitorIndex
     * @param {St.Label} layoutLabel
     */
    _changeMonitorLayout(monitorIndex, layoutLabel) {
        // In a real implementation, this would show a layout picker
        this._logger.debug('Change monitor layout clicked', { monitorIndex });
        // For now, cycle through some layouts
        const layouts = ['grid-1x1', 'grid-2x1', 'grid-1x2', 'grid-2x2', 'grid-3x1'];
        const current = this._settings.perMonitorLayouts[monitorIndex] || this._settings.defaultLayout;
        const currentIndex = layouts.indexOf(current);
        const nextLayout = layouts[(currentIndex + 1) % layouts.length];

        this._settings.perMonitorLayouts[monitorIndex] = nextLayout;
        layoutLabel.set_text(nextLayout);
    }

    /**
     * Create section
     * @private
     * @param {string} title
     * @returns {St.BoxLayout}
     */
    _createSection(title) {
        const section = new St.BoxLayout({
            vertical: true,
            style: `
                background-color: rgba(40, 40, 40, 0.6);
                border-radius: 6px;
                padding: 12px;
            `
        });

        const sectionTitle = new St.Label({
            text: title,
            style: `
                color: rgba(255, 255, 255, 0.9);
                font-size: 16px;
                font-weight: bold;
                padding-bottom: 8px;
            `
        });
        section.add_child(sectionTitle);

        return section;
    }

    /**
     * Create layout dropdown
     * @private
     * @param {St.BoxLayout} parent
     * @param {string} label
     * @param {string} key
     * @param {string} defaultValue
     */
    _createLayoutDropdown(parent, label, key, defaultValue) {
        const row = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; padding: 6px 0;'
        });

        const labelWidget = new St.Label({
            text: label,
            style: `
                color: white;
                font-size: 14px;
            `,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(labelWidget);

        // Dropdown (simplified - shows current value)
        const dropdownLabel = new St.Label({
            text: defaultValue,
            style: `
                color: rgba(255, 255, 255, 0.9);
                font-size: 13px;
                background-color: rgba(50, 50, 50, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 3px;
                padding: 6px 12px;
                min-width: 120px;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(dropdownLabel);

        parent.add_child(row);
    }

    /**
     * Create slider row
     * @private
     * @param {St.BoxLayout} parent
     * @param {string} label
     * @param {string} key
     * @param {number} min
     * @param {number} max
     * @param {number} defaultValue
     * @param {Function} formatter
     */
    _createSliderRow(parent, label, key, min, max, defaultValue, formatter) {
        const row = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; padding: 6px 0;'
        });

        const labelWidget = new St.Label({
            text: label,
            style: `
                color: white;
                font-size: 14px;
            `,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(labelWidget);

        // Value label
        const valueLabel = new St.Label({
            text: formatter(defaultValue),
            style: `
                color: rgba(255, 255, 255, 0.8);
                font-size: 14px;
                min-width: 60px;
                text-align: right;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(valueLabel);

        // Slider (simplified)
        const sliderContainer = new St.Widget({
            style: `
                background-color: rgba(60, 60, 60, 0.8);
                border-radius: 3px;
                height: 6px;
                width: 150px;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(sliderContainer);

        parent.add_child(row);
    }

    /**
     * Create toggle row
     * @private
     * @param {St.BoxLayout} parent
     * @param {string} label
     * @param {string} key
     * @param {boolean} defaultValue
     */
    _createToggleRow(parent, label, key, defaultValue) {
        const row = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; padding: 6px 0;'
        });

        const labelWidget = new St.Label({
            text: label,
            style: `
                color: white;
                font-size: 14px;
            `,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(labelWidget);

        // Toggle button
        const toggleButton = new St.Button({
            label: defaultValue ? 'ON' : 'OFF',
            style: `
                background-color: ${defaultValue ? 'rgba(50, 150, 50, 0.8)' : 'rgba(150, 50, 50, 0.8)'};
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 6px 12px;
                color: white;
                font-size: 12px;
                min-width: 60px;
            `
        });

        const btnId = toggleButton.connect('clicked', () => {
            const newValue = !this._settings[key];
            this._settings[key] = newValue;
            toggleButton.set_label(newValue ? 'ON' : 'OFF');
            toggleButton.set_style(`
                background-color: ${newValue ? 'rgba(50, 150, 50, 0.8)' : 'rgba(150, 50, 50, 0.8)'};
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 6px 12px;
                color: white;
                font-size: 12px;
                min-width: 60px;
            `);
        });
        this._signalIds.push({ actor: toggleButton, id: btnId });
        row.add_child(toggleButton);

        parent.add_child(row);
    }

    /**
     * Create footer
     * @private
     * @returns {St.BoxLayout}
     */
    _createFooter() {
        const footer = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; padding-top: 16px;'
        });

        // Apply button
        const applyButton = new St.Button({
            label: 'Apply',
            style: `
                background-color: rgba(50, 150, 50, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 10px 20px;
                color: white;
                font-weight: bold;
            `,
            x_expand: true
        });
        const applyId = applyButton.connect('clicked', () => {
            this._applySettings();
        });
        this._signalIds.push({ actor: applyButton, id: applyId });
        footer.add_child(applyButton);

        // Reset button
        const resetButton = new St.Button({
            label: 'Reset',
            style: `
                background-color: rgba(150, 50, 50, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 10px 20px;
                color: white;
            `
        });
        const resetId = resetButton.connect('clicked', () => {
            this._resetSettings();
        });
        this._signalIds.push({ actor: resetButton, id: resetId });
        footer.add_child(resetButton);

        // Close button
        const closeButton = new St.Button({
            label: 'Close',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 10px 20px;
                color: white;
            `
        });
        const closeId = closeButton.connect('clicked', () => {
            this.hide();
        });
        this._signalIds.push({ actor: closeButton, id: closeId });
        footer.add_child(closeButton);

        return footer;
    }

    /**
     * Export layouts
     * @private
     */
    _exportLayouts() {
        this._logger.info('Exporting layouts');
        // In real implementation, export to file
        this._eventBus.emit('layouts-export-requested', {});
    }

    /**
     * Import layouts
     * @private
     */
    _importLayouts() {
        this._logger.info('Importing layouts');
        // In real implementation, import from file
        this._eventBus.emit('layouts-import-requested', {});
    }

    /**
     * Apply settings
     * @private
     */
    _applySettings() {
        this._logger.info('Applying settings', this._settings);

        // Store as original settings
        this._originalSettings = JSON.parse(JSON.stringify(this._settings));

        // Emit event
        this._eventBus.emit('layout-settings-changed', {
            settings: JSON.parse(JSON.stringify(this._settings))
        });

        // In real implementation, save to GSettings
    }

    /**
     * Reset settings
     * @private
     */
    _resetSettings() {
        this._settings = JSON.parse(JSON.stringify(this._originalSettings));
        this._logger.info('Settings reset');

        // Refresh UI
        this._populateMonitors();

        this._eventBus.emit('layout-settings-reset', {});
    }

    /**
     * Show preferences
     */
    show() {
        if (!this._container) {
            this._logger.warn('Not initialized');
            return;
        }

        // Refresh monitors
        this._populateMonitors();

        // Position in center
        const monitor = Main.layoutManager.primaryMonitor;
        this._container.set_position(
            monitor.x + (monitor.width - this._container.width) / 2,
            monitor.y + (monitor.height - this._container.height) / 2
        );

        // Show with fade
        this._container.opacity = 0;
        this._container.show();
        this._container.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });

        this._logger.debug('Layout preferences shown');
    }

    /**
     * Hide preferences
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
            }
        });

        this._logger.debug('Layout preferences hidden');
    }

    /**
     * Get current settings
     *
     * @returns {Object}
     */
    getSettings() {
        return JSON.parse(JSON.stringify(this._settings));
    }

    /**
     * Load settings
     *
     * @param {Object} settings
     */
    loadSettings(settings) {
        this._settings = { ...this._settings, ...settings };
        this._originalSettings = JSON.parse(JSON.stringify(this._settings));
        this._logger.debug('Settings loaded', this._settings);
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
     * Destroy preferences
     */
    destroy() {
        this.hide();

        // Disconnect signals
        for (const { actor, id } of this._signalIds) {
            try {
                actor.disconnect(id);
            } catch (e) {
                // Actor may be destroyed
            }
        }
        this._signalIds = [];

        if (this._container) {
            this._container.destroy();
            this._container = null;
        }

        this._logger.info('LayoutPreferences destroyed');
    }
}
