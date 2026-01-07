/**
 * LayoutEditor - UI for creating and editing layouts
 *
 * Features:
 * - Visual layout representation
 * - Split zones (horizontal/vertical)
 * - Merge zones
 * - Adjust split ratios with sliders
 * - Preview layout changes
 * - Save/cancel actions
 *
 * Integrates with LayoutTree for manipulation.
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Logger } from '../core/logger.js';
import { LayoutTree } from '../btree/tree/layoutTree.js';

export class LayoutEditor {
    /**
     * @param {LayoutResolver} layoutResolver
     * @param {LayoutManager} layoutManager
     * @param {EventBus} eventBus
     */
    constructor(layoutResolver, layoutManager, eventBus) {
        if (!layoutResolver || !layoutManager || !eventBus) {
            throw new Error('All dependencies are required');
        }

        this._layoutResolver = layoutResolver;
        this._layoutManager = layoutManager;
        this._eventBus = eventBus;
        this._logger = new Logger('LayoutEditor');

        // UI components
        this._container = null;
        this._previewContainer = null;
        this._controlsContainer = null;
        this._zoneActors = [];

        // State
        this._layoutTree = null;
        this._workArea = null;
        this._selectedZone = null;
        this._originalLayout = null;
        this._originalLayoutId = null;
        this._isModified = false;
        this._isClone = false;

        // Layout properties
        this._layoutName = '';
        this._layoutId = '';
        this._layoutDescription = '';
        this._margin = 0;
        this._padding = 4;

        // UI references
        this._nameEntry = null;
        this._idEntry = null;
        this._descriptionEntry = null;
        this._marginSlider = null;
        this._paddingSlider = null;
        this._marginValueLabel = null;
        this._paddingValueLabel = null;

        // Signals
        this._signalIds = [];
    }

    /**
     * Initialize layout editor
     *
     * @param {Clutter.Actor} parent - Parent actor
     */
    initialize(parent) {
        if (this._container) {
            this._logger.warn('Already initialized');
            return;
        }

        // Create main container
        this._container = new St.BoxLayout({
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
        const header = this._createHeader();
        this._container.add_child(header);

        // Create content box (preview + controls)
        const contentBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 16px;'
        });

        // Create preview area
        this._previewContainer = this._createPreviewArea();
        contentBox.add_child(this._previewContainer);

        // Create controls area
        this._controlsContainer = this._createControlsArea();
        contentBox.add_child(this._controlsContainer);

        this._container.add_child(contentBox);

        // Create footer with actions
        const footer = this._createFooter();
        this._container.add_child(footer);

        // Add to parent
        parent.add_child(this._container);

        this._logger.info('LayoutEditor initialized');
    }

    /**
     * Create header
     * @private
     * @returns {St.BoxLayout}
     */
    _createHeader() {
        const header = new St.BoxLayout({
            vertical: true,
            style: 'padding-bottom: 12px; spacing: 8px;'
        });

        // Title row
        const titleRow = new St.BoxLayout({
            vertical: false
        });

        const title = new St.Label({
            text: 'Layout Editor',
            style: `
                color: white;
                font-size: 18px;
                font-weight: bold;
            `,
            x_expand: true
        });
        titleRow.add_child(title);
        header.add_child(titleRow);

        // Name input
        const nameRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 8px;'
        });
        const nameLabel = new St.Label({
            text: 'Name:',
            style: 'color: white; font-size: 12px; min-width: 80px;',
            y_align: Clutter.ActorAlign.CENTER
        });
        nameRow.add_child(nameLabel);

        this._nameEntry = new St.Entry({
            hint_text: 'My Custom Layout',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 3px;
                padding: 4px 8px;
                color: white;
                min-width: 250px;
            `,
            can_focus: true,
            x_expand: true
        });
        nameRow.add_child(this._nameEntry);
        header.add_child(nameRow);

        // ID input
        const idRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 8px;'
        });
        const idLabel = new St.Label({
            text: 'ID:',
            style: 'color: white; font-size: 12px; min-width: 80px;',
            y_align: Clutter.ActorAlign.CENTER
        });
        idRow.add_child(idLabel);

        this._idEntry = new St.Entry({
            hint_text: 'custom-layout-1',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 3px;
                padding: 4px 8px;
                color: white;
                min-width: 250px;
            `,
            can_focus: true,
            x_expand: true
        });
        idRow.add_child(this._idEntry);
        header.add_child(idRow);

        // Description input
        const descRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 8px;'
        });
        const descLabel = new St.Label({
            text: 'Description:',
            style: 'color: white; font-size: 12px; min-width: 80px;',
            y_align: Clutter.ActorAlign.CENTER
        });
        descRow.add_child(descLabel);

        this._descriptionEntry = new St.Entry({
            hint_text: 'A custom layout for my workflow',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 3px;
                padding: 4px 8px;
                color: white;
                min-width: 250px;
            `,
            can_focus: true,
            x_expand: true
        });
        descRow.add_child(this._descriptionEntry);
        header.add_child(descRow);

        return header;
    }

    /**
     * Create preview area
     * @private
     * @returns {St.Widget}
     */
    _createPreviewArea() {
        const preview = new St.Widget({
            style: `
                background-color: rgba(40, 40, 40, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                width: 500px;
                height: 400px;
            `,
            reactive: true,
            clip_to_allocation: true
        });

        return preview;
    }

    /**
     * Create controls area
     * @private
     * @returns {St.BoxLayout}
     */
    _createControlsArea() {
        const controls = new St.BoxLayout({
            vertical: true,
            style: `
                spacing: 12px;
                min-width: 200px;
            `
        });

        // Zone info label
        const infoLabel = new St.Label({
            text: 'Select a zone',
            style: `
                color: white;
                font-size: 14px;
                padding-bottom: 8px;
            `
        });
        controls.add_child(infoLabel);
        this._zoneInfoLabel = infoLabel;

        // Split buttons
        const splitLabel = new St.Label({
            text: 'Split Zone:',
            style: `
                color: rgba(255, 255, 255, 0.8);
                font-size: 12px;
            `
        });
        controls.add_child(splitLabel);

        const splitHButton = new St.Button({
            label: 'Split Horizontal',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 8px 16px;
                color: white;
            `,
            reactive: true
        });
        const splitHId = splitHButton.connect('clicked', () => {
            this._splitSelectedZone('horizontal');
        });
        this._signalIds.push({ actor: splitHButton, id: splitHId });
        controls.add_child(splitHButton);

        const splitVButton = new St.Button({
            label: 'Split Vertical',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 8px 16px;
                color: white;
            `,
            reactive: true
        });
        const splitVId = splitVButton.connect('clicked', () => {
            this._splitSelectedZone('vertical');
        });
        this._signalIds.push({ actor: splitVButton, id: splitVId });
        controls.add_child(splitVButton);

        // Quick layouts
        const quickLabel = new St.Label({
            text: 'Quick Layouts:',
            style: `
                color: rgba(255, 255, 255, 0.8);
                font-size: 12px;
                padding-top: 12px;
            `
        });
        controls.add_child(quickLabel);

        const layouts = [
            { label: '1x1', rows: 1, cols: 1 },
            { label: '2x1', rows: 2, cols: 1 },
            { label: '1x2', rows: 1, cols: 2 },
            { label: '2x2', rows: 2, cols: 2 }
        ];

        for (const layout of layouts) {
            const button = new St.Button({
                label: layout.label,
                style: `
                    background-color: rgba(60, 60, 60, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 4px;
                    padding: 6px 12px;
                    color: white;
                    font-size: 12px;
                `,
                reactive: true
            });
            const btnId = button.connect('clicked', () => {
                this._loadQuickLayout(layout.rows, layout.cols);
            });
            this._signalIds.push({ actor: button, id: btnId });
            controls.add_child(button);
        }

        // Spacing section
        const spacingLabel = new St.Label({
            text: 'Spacing:',
            style: `
                color: rgba(255, 255, 255, 0.8);
                font-size: 12px;
                padding-top: 12px;
            `
        });
        controls.add_child(spacingLabel);

        // Margin control
        this._createSliderControl(controls, 'Margin', 0, 20, this._margin, (value) => {
            this._margin = value;
            this._isModified = true;
            this._renderPreview();
        });

        // Padding control
        this._createSliderControl(controls, 'Padding', 0, 20, this._padding, (value) => {
            this._padding = value;
            this._isModified = true;
            this._renderPreview();
        });

        return controls;
    }

    /**
     * Create slider control
     * @private
     * @param {St.BoxLayout} parent
     * @param {string} label
     * @param {number} min
     * @param {number} max
     * @param {number} defaultValue
     * @param {Function} callback
     */
    _createSliderControl(parent, label, min, max, defaultValue, callback) {
        const row = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 8px; padding: 4px 0;'
        });

        const labelWidget = new St.Label({
            text: label + ':',
            style: `
                color: rgba(255, 255, 255, 0.9);
                font-size: 12px;
                min-width: 60px;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(labelWidget);

        // Value label
        const valueLabel = new St.Label({
            text: `${defaultValue}px`,
            style: `
                color: rgba(255, 255, 255, 0.8);
                font-size: 12px;
                min-width: 40px;
                text-align: right;
            `,
            y_align: Clutter.ActorAlign.CENTER
        });

        // Slider buttons (simplified - increment/decrement)
        const decrementButton = new St.Button({
            label: '-',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 3px;
                padding: 2px 8px;
                color: white;
                font-size: 14px;
                min-width: 30px;
            `,
            reactive: true
        });

        let currentValue = defaultValue;
        const decId = decrementButton.connect('clicked', () => {
            if (currentValue > min) {
                currentValue--;
                valueLabel.set_text(`${currentValue}px`);
                callback(currentValue);
            }
        });
        this._signalIds.push({ actor: decrementButton, id: decId });
        row.add_child(decrementButton);

        row.add_child(valueLabel);

        const incrementButton = new St.Button({
            label: '+',
            style: `
                background-color: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 3px;
                padding: 2px 8px;
                color: white;
                font-size: 14px;
                min-width: 30px;
            `,
            reactive: true
        });

        const incId = incrementButton.connect('clicked', () => {
            if (currentValue < max) {
                currentValue++;
                valueLabel.set_text(`${currentValue}px`);
                callback(currentValue);
            }
        });
        this._signalIds.push({ actor: incrementButton, id: incId });
        row.add_child(incrementButton);

        parent.add_child(row);
    }

    /**
     * Create footer with actions
     * @private
     * @returns {St.BoxLayout}
     */
    _createFooter() {
        const footer = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 12px; padding-top: 16px;'
        });

        // Save button
        const saveButton = new St.Button({
            label: 'Save Layout',
            style: `
                background-color: rgba(50, 150, 50, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 10px 20px;
                color: white;
                font-weight: bold;
            `,
            reactive: true,
            x_expand: true
        });
        const saveId = saveButton.connect('clicked', () => {
            this._saveLayout();
        });
        this._signalIds.push({ actor: saveButton, id: saveId });
        footer.add_child(saveButton);

        // Cancel button
        const cancelButton = new St.Button({
            label: 'Cancel',
            style: `
                background-color: rgba(150, 50, 50, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                padding: 10px 20px;
                color: white;
            `,
            reactive: true
        });
        const cancelId = cancelButton.connect('clicked', () => {
            this._cancel();
        });
        this._signalIds.push({ actor: cancelButton, id: cancelId });
        footer.add_child(cancelButton);

        return footer;
    }

    /**
     * Show layout editor
     *
     * @param {Object} options - Options for the editor
     * @param {Object} options.layout - Layout definition (or null for new)
     * @param {string} options.layoutId - Layout ID (for editing existing)
     * @param {string} options.name - Layout name
     * @param {string} options.description - Layout description
     * @param {number} options.margin - Layout margin
     * @param {number} options.padding - Layout padding
     * @param {boolean} options.isClone - Whether this is a clone operation
     * @param {Object} options.workArea - Work area dimensions
     */
    show(options = {}) {
        if (!this._container) {
            this._logger.warn('Not initialized');
            return;
        }

        const {
            layout = null,
            layoutId = null,
            name = '',
            description = '',
            margin = 0,
            padding = 4,
            isClone = false,
            workArea = null
        } = options;

        // Store work area
        this._workArea = workArea || {
            x: 0,
            y: 0,
            width: this._previewContainer.width,
            height: this._previewContainer.height
        };

        // Load layout
        if (layout) {
            this._originalLayout = layout;
            this._originalLayoutId = isClone ? null : layoutId;
            this._layoutTree = LayoutTree.fromDefinition(layout);
            this._isClone = isClone;
        } else {
            // Create default 2x2 layout
            this._originalLayout = null;
            this._originalLayoutId = null;
            this._layoutTree = LayoutTree.createGrid(2, 2);
            this._isClone = false;
        }

        // Set layout properties
        this._layoutName = isClone ? `${name} (Copy)` : name;
        this._layoutId = isClone ? '' : (layoutId || '');
        this._layoutDescription = description;
        this._margin = margin;
        this._padding = padding;
        this._isModified = false;

        // Update UI fields
        this._nameEntry.set_text(this._layoutName);
        this._idEntry.set_text(this._layoutId);
        this._descriptionEntry.set_text(this._layoutDescription);

        // If cloning, focus on ID field since user needs to provide new ID
        if (isClone) {
            this._idEntry.grab_key_focus();
        }

        // Render preview
        this._renderPreview();

        // Position editor
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

        this._logger.debug('Layout editor shown', {
            layoutId,
            isClone,
            isNew: !layoutId && !isClone
        });
    }

    /**
     * Hide layout editor
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
                this._clearPreview();
            }
        });

        this._logger.debug('Layout editor hidden');
    }

    /**
     * Render layout preview
     * @private
     */
    _renderPreview() {
        this._clearPreview();

        if (!this._layoutTree) {
            return;
        }

        try {
            // Resolve layout to zones with current margin/padding
            const layout = this._layoutTree.toDefinition();
            const zones = this._layoutResolver.resolve(layout, this._workArea, {
                margin: this._margin,
                padding: this._padding
            });

            // Render zones
            for (const zone of zones) {
                const zoneActor = this._createZoneActor(zone);
                this._previewContainer.add_child(zoneActor);
                this._zoneActors.push({ actor: zoneActor, zone });
            }
        } catch (error) {
            this._logger.error('Failed to render preview', { error });
        }
    }

    /**
     * Create zone actor
     * @private
     * @param {Object} zone
     * @returns {St.Button}
     */
    _createZoneActor(zone) {
        const actor = new St.Button({
            style: `
                background-color: rgba(80, 120, 180, 0.3);
                border: 2px solid rgba(255, 255, 255, 0.5);
                border-radius: 2px;
            `,
            x: zone.x,
            y: zone.y,
            width: zone.width,
            height: zone.height,
            reactive: true
        });

        // Zone label
        const label = new St.Label({
            text: String(zone.zoneIndex + 1),
            style: `
                color: white;
                font-size: 24px;
                font-weight: bold;
            `
        });
        actor.set_child(label);

        // Click handler
        const clickId = actor.connect('clicked', () => {
            this._selectZone(zone.zoneIndex);
        });
        this._signalIds.push({ actor, id: clickId });

        return actor;
    }

    /**
     * Clear preview
     * @private
     */
    _clearPreview() {
        // Disconnect signals
        for (const { actor, id } of this._signalIds.filter(s => this._zoneActors.some(z => z.actor === s.actor))) {
            try {
                actor.disconnect(id);
            } catch (e) {
                // Actor may be destroyed
            }
        }

        // Remove actors
        for (const { actor } of this._zoneActors) {
            actor.destroy();
        }
        this._zoneActors = [];
        this._selectedZone = null;
    }

    /**
     * Select zone
     * @private
     * @param {number} zoneIndex
     */
    _selectZone(zoneIndex) {
        this._selectedZone = zoneIndex;

        // Update zone highlights
        for (const { actor, zone } of this._zoneActors) {
            if (zone.zoneIndex === zoneIndex) {
                actor.set_style(`
                    background-color: rgba(100, 180, 255, 0.6);
                    border: 2px solid rgba(255, 255, 255, 0.9);
                    border-radius: 2px;
                `);
            } else {
                actor.set_style(`
                    background-color: rgba(80, 120, 180, 0.3);
                    border: 2px solid rgba(255, 255, 255, 0.5);
                    border-radius: 2px;
                `);
            }
        }

        // Update info label
        this._zoneInfoLabel.set_text(`Zone ${zoneIndex + 1} selected`);

        this._logger.debug('Zone selected', { zoneIndex });
    }

    /**
     * Split selected zone
     * @private
     * @param {string} direction - 'horizontal' or 'vertical'
     */
    _splitSelectedZone(direction) {
        if (this._selectedZone === null) {
            this._logger.warn('No zone selected');
            return;
        }

        try {
            const dir = direction === 'horizontal' ? 'h' : 'v';
            this._layoutTree.splitZone(this._selectedZone, dir, 0.5);
            this._isModified = true;
            this._renderPreview();

            this._logger.debug('Zone split', { zone: this._selectedZone, direction });
        } catch (error) {
            this._logger.error('Failed to split zone', { error });
        }
    }

    /**
     * Load quick layout
     * @private
     * @param {number} rows
     * @param {number} cols
     */
    _loadQuickLayout(rows, cols) {
        this._layoutTree = LayoutTree.createGrid(rows, cols);
        this._isModified = true;
        this._renderPreview();

        this._logger.debug('Quick layout loaded', { rows, cols });
    }

    /**
     * Save layout
     * @private
     */
    _saveLayout() {
        if (!this._layoutTree) {
            return;
        }

        // Get values from UI
        const name = this._nameEntry.get_text().trim();
        const id = this._idEntry.get_text().trim();
        const description = this._descriptionEntry.get_text().trim();

        // Validate
        if (!name) {
            this._logger.warn('Layout name is required');
            // In a real implementation, show error message to user
            return;
        }

        if (!id) {
            this._logger.warn('Layout ID is required');
            return;
        }

        // Validate ID format (lowercase, hyphens, no spaces)
        if (!/^[a-z0-9-]+$/.test(id)) {
            this._logger.warn('Layout ID must contain only lowercase letters, numbers, and hyphens');
            return;
        }

        // Check if ID is already taken (unless updating the same layout)
        if (this._originalLayoutId !== id && this._layoutManager.hasLayout(id)) {
            this._logger.warn(`Layout ID '${id}' already exists`);
            return;
        }

        // Get layout definition
        const layout = this._layoutTree.toDefinition();

        // Create layout definition object
        const layoutDef = {
            id,
            name,
            description,
            layout,
            builtin: false,
            margin: this._margin,
            padding: this._padding
        };

        // Determine operation
        const isUpdate = this._originalLayoutId && this._originalLayoutId === id;
        const isNew = !this._originalLayoutId;

        this._logger.info('Saving layout', { id, isUpdate, isNew, isClone: this._isClone });

        // Emit appropriate event
        if (isUpdate) {
            // Update existing layout
            this._eventBus.emit('layout-editor-update', { layoutId: id, layoutDef });
        } else {
            // Create new layout (either brand new or cloned)
            this._eventBus.emit('layout-editor-create', { layoutId: id, layoutDef });
        }

        this.hide();
    }

    /**
     * Cancel editing
     * @private
     */
    _cancel() {
        this._logger.debug('Layout editing cancelled');

        // Emit event
        this._eventBus.emit('layout-editor-cancel', {});

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
     * Check if modified
     *
     * @returns {boolean}
     */
    get isModified() {
        return this._isModified;
    }

    /**
     * Destroy layout editor
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

        this._logger.info('LayoutEditor destroyed');
    }
}
