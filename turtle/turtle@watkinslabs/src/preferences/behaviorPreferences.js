/**
 * BehaviorPreferences - Behavior and interaction settings
 *
 * Settings:
 * - Trigger zone configuration (edge size, corner size)
 * - Trigger zone enable/disable (edges, corners)
 * - Debounce delays
 * - Keyboard shortcuts
 * - Auto-snap behavior
 * - Focus behavior
 *
 * Integrates with GSettings for persistence.
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Logger } from '../core/logger.js';

export class BehaviorPreferences {
    /**
     * @param {EventBus} eventBus
     */
    constructor(eventBus) {
        if (!eventBus) {
            throw new Error('eventBus is required');
        }

        this._eventBus = eventBus;
        this._logger = new Logger('BehaviorPreferences');

        // UI components
        this._container = null;
        this._settingsRows = [];

        // Settings (will be synced with GSettings)
        this._settings = {
            // Trigger zones
            edgeSize: 2,
            cornerSize: 10,
            enableEdges: true,
            enableCorners: true,
            debounceDelay: 100,

            // Keyboard shortcuts
            toggleOverlay: '<Super>space',
            navigateUp: 'Up',
            navigateDown: 'Down',
            navigateLeft: 'Left',
            navigateRight: 'Right',
            selectZone: 'Return',
            cancel: 'Escape',

            // Behavior
            autoSnapOnDrag: true,
            focusWindowOnSnap: true,
            restoreOnUnsnap: true,

            // Shake-to-exit snap
            shakeEnabled: true,
            shakeWindowMs: 500,
            shakeMinDelta: 35,
            shakeDirectionChanges: 4
        };

        // Original settings (for reset)
        this._originalSettings = { ...this._settings };

        // Signals
        this._signalIds = [];
    }

    /**
     * Initialize behavior preferences
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
                min-width: 550px;
            `,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC
        });

        const settingsBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 16px;'
        });

        // Add settings sections
        this._createTriggerZoneSettings(settingsBox);
        this._createKeyboardSettings(settingsBox);
        this._createBehaviorSettings(settingsBox);
        this._createShakeSettings(settingsBox);

        scrollView.add_child(settingsBox);
        this._container.add_child(scrollView);

        // Create footer with actions
        const footer = this._createFooter();
        this._container.add_child(footer);

        // Add to parent
        parent.add_child(this._container);

        this._logger.info('BehaviorPreferences initialized');
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
            text: 'Behavior Settings',
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
     * Create trigger zone settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createTriggerZoneSettings(parent) {
        const section = this._createSection('Trigger Zones');
        parent.add_child(section);

        // Enable edges toggle
        this._createToggleRow(section, 'Enable Edge Triggers', 'enableEdges', this._settings.enableEdges);

        // Edge size slider
        this._createSliderRow(section, 'Edge Size', 'edgeSize', 1, 10, this._settings.edgeSize, (value) => `${value}px`);

        // Enable corners toggle
        this._createToggleRow(section, 'Enable Corner Triggers', 'enableCorners', this._settings.enableCorners);

        // Corner size slider
        this._createSliderRow(section, 'Corner Size', 'cornerSize', 5, 30, this._settings.cornerSize, (value) => `${value}px`);

        // Debounce delay slider
        this._createSliderRow(section, 'Debounce Delay', 'debounceDelay', 0, 300, this._settings.debounceDelay, (value) => `${value}ms`);
    }

    /**
     * Create keyboard settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createKeyboardSettings(parent) {
        const section = this._createSection('Keyboard Shortcuts');
        parent.add_child(section);

        // Shortcuts
        this._createShortcutRow(section, 'Toggle Overlay', 'toggleOverlay', this._settings.toggleOverlay);
        this._createShortcutRow(section, 'Navigate Up', 'navigateUp', this._settings.navigateUp);
        this._createShortcutRow(section, 'Navigate Down', 'navigateDown', this._settings.navigateDown);
        this._createShortcutRow(section, 'Navigate Left', 'navigateLeft', this._settings.navigateLeft);
        this._createShortcutRow(section, 'Navigate Right', 'navigateRight', this._settings.navigateRight);
        this._createShortcutRow(section, 'Select Zone', 'selectZone', this._settings.selectZone);
        this._createShortcutRow(section, 'Cancel', 'cancel', this._settings.cancel);
    }

    /**
     * Create behavior settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createBehaviorSettings(parent) {
        const section = this._createSection('Window Behavior');
        parent.add_child(section);

        // Auto-snap on drag
        this._createToggleRow(section, 'Auto-snap on Drag', 'autoSnapOnDrag', this._settings.autoSnapOnDrag);

        // Focus window on snap
        this._createToggleRow(section, 'Focus Window on Snap', 'focusWindowOnSnap', this._settings.focusWindowOnSnap);

        // Restore on unsnap
        this._createToggleRow(section, 'Restore Size on Unsnap', 'restoreOnUnsnap', this._settings.restoreOnUnsnap);
    }

    /**
     * Create shake-to-exit settings section
     * @private
     * @param {St.BoxLayout} parent
     */
    _createShakeSettings(parent) {
        const section = this._createSection('Shake to Exit Snap');
        parent.add_child(section);

        this._createToggleRow(section, 'Enable Shake to Exit', 'shakeEnabled', this._settings.shakeEnabled);
        this._createSliderRow(section, 'Shake Window (ms)', 'shakeWindowMs', 100, 2000, this._settings.shakeWindowMs, (value) => `${value} ms`);
        this._createSliderRow(section, 'Minimum Distance (px)', 'shakeMinDelta', 5, 150, this._settings.shakeMinDelta, (value) => `${value} px`);
        this._createSliderRow(section, 'Direction Changes', 'shakeDirectionChanges', 1, 10, this._settings.shakeDirectionChanges, (value) => `${value}`);
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
     * Create shortcut row
     * @private
     * @param {St.BoxLayout} parent
     * @param {string} label
     * @param {string} key
     * @param {string} defaultValue
     */
    _createShortcutRow(parent, label, key, defaultValue) {
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

        // Shortcut display
        const shortcutLabel = new St.Label({
            text: defaultValue,
            style: `
                color: rgba(255, 255, 255, 0.9);
                font-size: 13px;
                font-family: monospace;
                background-color: rgba(50, 50, 50, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 3px;
                padding: 4px 8px;
                min-width: 120px;
                text-align: center;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(shortcutLabel);

        // Edit button
        const editButton = new St.Button({
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
        const btnId = editButton.connect('clicked', () => {
            // In a real implementation, this would open a shortcut recorder
            this._logger.debug('Change shortcut clicked', { key });
        });
        this._signalIds.push({ actor: editButton, id: btnId });
        row.add_child(editButton);

        parent.add_child(row);
        this._settingsRows.push({ key, widget: shortcutLabel, type: 'shortcut' });
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
        this._eventBus.emit('behavior-settings-changed', {
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

        // Update UI (simplified)
        this._eventBus.emit('behavior-settings-reset', {});
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

        this._logger.debug('Behavior preferences shown');
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

        this._logger.debug('Behavior preferences hidden');
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

        this._logger.info('BehaviorPreferences destroyed');
    }
}
