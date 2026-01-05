/**
 * AppearancePreferences - Visual appearance settings
 *
 * Settings:
 * - Zone colors (background, border, highlight)
 * - Border width and style
 * - Animation speed and effects
 * - Overlay opacity
 * - Font size for zone labels
 * - Show/hide zone numbers
 *
 * Integrates with GSettings for persistence.
 */

import { Logger } from '../core/logger.js';

export class AppearancePreferences {
    /**
     * @param {EventBus} eventBus
     */
    constructor(eventBus) {
        if (!eventBus) {
            throw new Error('eventBus is required');
        }

        this._eventBus = eventBus;
        this._logger = new Logger('AppearancePreferences');

        // UI components
        this._container = null;
        this._settingsRows = [];

        // Settings (will be synced with GSettings)
        this._settings = {
            zoneBgColor: 'rgba(80, 120, 180, 0.3)',
            zoneBorderColor: 'rgba(255, 255, 255, 0.5)',
            zoneHighlightColor: 'rgba(100, 180, 255, 0.6)',
            borderWidth: 2,
            animationSpeed: 200,
            enableAnimations: true,
            overlayOpacity: 0.95,
            zoneLabelSize: 24,
            showZoneNumbers: true
        };

        // Original settings (for reset)
        this._originalSettings = { ...this._settings };

        // Signals
        this._signalIds = [];
    }

    /**
     * Initialize appearance preferences
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
                min-width: 500px;
            `,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC
        });

        const settingsBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 16px;'
        });

        // Add settings sections
        this._createColorSettings(settingsBox);
        this._createBorderSettings(settingsBox);
        this._createAnimationSettings(settingsBox);
        this._createLabelSettings(settingsBox);

        scrollView.add_actor(settingsBox);
        this._container.add_child(scrollView);

        // Create footer with actions
        const footer = this._createFooter();
        this._container.add_child(footer);

        // Add to parent
        parent.add_actor(this._container);

        this._logger.info('AppearancePreferences initialized');
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
            text: 'Appearance Settings',
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
     * Create color settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createColorSettings(parent) {
        const section = this._createSection('Colors');
        parent.add_child(section);

        // Zone background color
        this._createColorRow(section, 'Zone Background', 'zoneBgColor', this._settings.zoneBgColor);

        // Zone border color
        this._createColorRow(section, 'Zone Border', 'zoneBorderColor', this._settings.zoneBorderColor);

        // Zone highlight color
        this._createColorRow(section, 'Zone Highlight', 'zoneHighlightColor', this._settings.zoneHighlightColor);
    }

    /**
     * Create border settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createBorderSettings(parent) {
        const section = this._createSection('Borders');
        parent.add_child(section);

        // Border width slider
        this._createSliderRow(section, 'Border Width', 'borderWidth', 1, 5, this._settings.borderWidth, (value) => `${value}px`);

        // Overlay opacity slider
        this._createSliderRow(section, 'Overlay Opacity', 'overlayOpacity', 0.5, 1.0, this._settings.overlayOpacity, (value) => `${Math.round(value * 100)}%`);
    }

    /**
     * Create animation settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createAnimationSettings(parent) {
        const section = this._createSection('Animations');
        parent.add_child(section);

        // Enable animations toggle
        this._createToggleRow(section, 'Enable Animations', 'enableAnimations', this._settings.enableAnimations);

        // Animation speed slider
        this._createSliderRow(section, 'Animation Speed', 'animationSpeed', 100, 500, this._settings.animationSpeed, (value) => `${value}ms`);
    }

    /**
     * Create label settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createLabelSettings(parent) {
        const section = this._createSection('Zone Labels');
        parent.add_child(section);

        // Show zone numbers toggle
        this._createToggleRow(section, 'Show Zone Numbers', 'showZoneNumbers', this._settings.showZoneNumbers);

        // Zone label size slider
        this._createSliderRow(section, 'Label Size', 'zoneLabelSize', 16, 48, this._settings.zoneLabelSize, (value) => `${value}px`);
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
     * Create color row
     * @private
     * @param {St.BoxLayout} parent
     * @param {string} label
     * @param {string} key
     * @param {string} defaultValue
     */
    _createColorRow(parent, label, key, defaultValue) {
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

        // Color preview
        const colorPreview = new St.Widget({
            style: `
                background-color: ${defaultValue};
                border: 1px solid rgba(255, 255, 255, 0.5);
                border-radius: 3px;
                width: 40px;
                height: 30px;
            `
        });
        row.add_child(colorPreview);

        // Edit button
        const editButton = new St.Button({
            label: 'Edit',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 6px 12px;
                color: white;
                font-size: 12px;
            `
        });
        const btnId = editButton.connect('clicked', () => {
            // In a real implementation, this would open a color picker
            this._logger.debug('Edit color clicked', { key });
        });
        this._signalIds.push({ actor: editButton, id: btnId });
        row.add_child(editButton);

        parent.add_child(row);
        this._settingsRows.push({ key, widget: colorPreview, type: 'color' });
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

        // Slider (simplified - in real implementation use St.Slider or similar)
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
        this._settingsRows.push({ key, widget: valueLabel, type: 'slider', min, max, formatter });
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
            this._onSettingChanged(key, newValue);
        });
        this._signalIds.push({ actor: toggleButton, id: btnId });
        row.add_child(toggleButton);

        parent.add_child(row);
        this._settingsRows.push({ key, widget: toggleButton, type: 'toggle' });
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
     * Handle setting changed
     * @private
     * @param {string} key
     * @param {*} value
     */
    _onSettingChanged(key, value) {
        this._logger.debug('Setting changed', { key, value });
        // In real implementation, this could trigger live preview
    }

    /**
     * Apply settings
     * @private
     */
    _applySettings() {
        this._logger.info('Applying settings', this._settings);

        // Store as original settings
        this._originalSettings = { ...this._settings };

        // Emit event
        this._eventBus.emit('appearance-settings-changed', {
            settings: { ...this._settings }
        });

        // In real implementation, save to GSettings
    }

    /**
     * Reset settings
     * @private
     */
    _resetSettings() {
        this._settings = { ...this._originalSettings };
        this._logger.info('Settings reset');

        // Update UI (simplified - in real implementation, update all widgets)
        this._eventBus.emit('appearance-settings-reset', {});
    }

    /**
     * Show preferences
     */
    show() {
        if (!this._container) {
            this._logger.warn('Not initialized');
            return;
        }

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

        this._logger.debug('Appearance preferences shown');
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

        this._logger.debug('Appearance preferences hidden');
    }

    /**
     * Get current settings
     *
     * @returns {Object}
     */
    getSettings() {
        return { ...this._settings };
    }

    /**
     * Load settings
     *
     * @param {Object} settings
     */
    loadSettings(settings) {
        this._settings = { ...this._settings, ...settings };
        this._originalSettings = { ...this._settings };
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

        this._logger.info('AppearancePreferences destroyed');
    }
}
