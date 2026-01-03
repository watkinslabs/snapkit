/**
 * Layout Editor Dialog
 *
 * Main dialog for creating and editing layouts.
 * Contains:
 * - Header with name entry, Cancel, Save buttons
 * - Visual canvas for layout preview
 * - Properties panel for editing selected node
 * - Toolbar for split/delete operations
 */

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import { LayoutEditorCanvas } from './layoutEditorCanvas.js';
import * as EditorState from './layoutEditorState.js';

export const LayoutEditorDialog = GObject.registerClass({
    GTypeName: 'LayoutEditorDialog',
    Signals: {
        'layout-saved': {
            param_types: [GObject.TYPE_STRING]  // JSON string of layout
        }
    }
}, class LayoutEditorDialog extends Adw.Window {
    _init(params = {}) {
        super._init({
            title: 'Layout Editor',
            default_width: 800,
            default_height: 600,
            modal: true,
            ...params
        });

        this._layout = null;
        this._selectedPath = [];
        this._isDirty = false;
        this._isNewLayout = true;

        this._buildUI();
    }

    /**
     * Open the editor with a new layout from template
     * @param {string} template - Template name
     */
    newFromTemplate(template = 'empty') {
        this._layout = EditorState.createFromTemplate(template, 'New Layout');
        this._selectedPath = [];
        this._isDirty = false;
        this._isNewLayout = true;
        this._updateUI();
    }

    /**
     * Open the editor with an existing layout (for editing)
     * @param {object} layout - Layout to edit
     */
    editLayout(layout) {
        this._layout = EditorState.cloneLayout(layout);
        this._selectedPath = [];
        this._isDirty = false;
        this._isNewLayout = false;
        this._updateUI();
    }

    /**
     * Build the dialog UI
     */
    _buildUI() {
        // Main container
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0
        });

        // Header bar
        const headerBar = this._createHeaderBar();
        mainBox.append(headerBar);

        // Name entry row
        const nameRow = this._createNameRow();
        mainBox.append(nameRow);

        // Content area (canvas + properties)
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            hexpand: true,
            vexpand: true
        });

        // Left side: Canvas + Toolbar
        const leftBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            hexpand: true,
            vexpand: true
        });

        // Canvas
        this._canvas = new LayoutEditorCanvas();
        this._canvas.connect('zone-clicked', this._onZoneClicked.bind(this));
        this._canvas.connect('zone-hover', this._onZoneHover.bind(this));

        const canvasFrame = new Gtk.Frame({
            margin_start: 12,
            margin_end: 6,
            margin_top: 12,
            margin_bottom: 6,
            hexpand: true,
            vexpand: true
        });
        canvasFrame.set_child(this._canvas);
        leftBox.append(canvasFrame);

        // Toolbar
        const toolbar = this._createToolbar();
        leftBox.append(toolbar);

        contentBox.append(leftBox);

        // Right side: Properties panel
        const propertiesPanel = this._createPropertiesPanel();
        contentBox.append(propertiesPanel);

        mainBox.append(contentBox);

        this.set_content(mainBox);
    }

    /**
     * Create the header bar
     */
    _createHeaderBar() {
        const headerBar = new Adw.HeaderBar();

        // Cancel button
        const cancelButton = new Gtk.Button({ label: 'Cancel' });
        cancelButton.connect('clicked', () => this.close());
        headerBar.pack_start(cancelButton);

        // Save button
        this._saveButton = new Gtk.Button({
            label: 'Save',
            css_classes: ['suggested-action']
        });
        this._saveButton.connect('clicked', this._onSaveClicked.bind(this));
        headerBar.pack_end(this._saveButton);

        return headerBar;
    }

    /**
     * Create the name entry row
     */
    _createNameRow() {
        const nameBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 0
        });

        const nameLabel = new Gtk.Label({
            label: 'Layout Name:',
            xalign: 0
        });
        nameBox.append(nameLabel);

        this._nameEntry = new Gtk.Entry({
            hexpand: true,
            placeholder_text: 'Enter layout name...'
        });
        this._nameEntry.connect('changed', () => {
            if (this._layout) {
                this._layout = EditorState.updateLayoutName(
                    this._layout,
                    this._nameEntry.get_text()
                );
                this._isDirty = true;
            }
        });
        nameBox.append(this._nameEntry);

        return nameBox;
    }

    /**
     * Create the toolbar with split/delete buttons
     */
    _createToolbar() {
        const toolbar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            margin_start: 12,
            margin_end: 6,
            margin_top: 6,
            margin_bottom: 12,
            halign: Gtk.Align.CENTER
        });

        // Split Horizontal button
        this._splitHButton = new Gtk.Button({
            label: 'Split Horizontal',
            tooltip_text: 'Split selected zone horizontally (H)',
            sensitive: false
        });
        this._splitHButton.connect('clicked', () => this._splitSelected('col'));
        toolbar.append(this._splitHButton);

        // Split Vertical button
        this._splitVButton = new Gtk.Button({
            label: 'Split Vertical',
            tooltip_text: 'Split selected zone vertically (V)',
            sensitive: false
        });
        this._splitVButton.connect('clicked', () => this._splitSelected('row'));
        toolbar.append(this._splitVButton);

        // Delete button
        this._deleteButton = new Gtk.Button({
            label: 'Delete',
            tooltip_text: 'Delete selected zone (Del)',
            css_classes: ['destructive-action'],
            sensitive: false
        });
        this._deleteButton.connect('clicked', () => this._deleteSelected());
        toolbar.append(this._deleteButton);

        // Separator
        toolbar.append(new Gtk.Separator({ orientation: Gtk.Orientation.VERTICAL }));

        // Select Parent button
        this._parentButton = new Gtk.Button({
            label: 'Parent Split',
            tooltip_text: 'Select parent split to edit its gaps',
            sensitive: false
        });
        this._parentButton.connect('clicked', () => this._selectParent());
        toolbar.append(this._parentButton);

        return toolbar;
    }

    /**
     * Create the properties panel
     */
    _createPropertiesPanel() {
        const panel = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            width_request: 280
        });

        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            hexpand: false,
            vexpand: true,
            margin_start: 6,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 12
        });

        const innerBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12
        });

        // Layout Defaults section
        const defaultsGroup = new Adw.PreferencesGroup({
            title: 'Layout Defaults'
        });

        // Gap Inner
        this._gapInnerRow = new Adw.SpinRow({
            title: 'Gap Inner',
            subtitle: 'Space between zones (px)',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 50,
                step_increment: 1,
                value: 0
            })
        });
        this._gapInnerRow.connect('notify::value', () => {
            if (this._layout) {
                this._layout = EditorState.updateDefaults(this._layout, {
                    gap_inner: this._gapInnerRow.get_value()
                });
                this._isDirty = true;
                this._canvas.setLayout(this._layout);
            }
        });
        defaultsGroup.add(this._gapInnerRow);

        // Gap Outer
        this._gapOuterRow = new Adw.SpinRow({
            title: 'Gap Outer',
            subtitle: 'Space around edge (px)',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 50,
                step_increment: 1,
                value: 0
            })
        });
        this._gapOuterRow.connect('notify::value', () => {
            if (this._layout) {
                this._layout = EditorState.updateDefaults(this._layout, {
                    gap_outer: this._gapOuterRow.get_value()
                });
                this._isDirty = true;
                this._canvas.setLayout(this._layout);
            }
        });
        defaultsGroup.add(this._gapOuterRow);

        // Leaf Insets
        this._leafInsetsRow = new Adw.SpinRow({
            title: 'Leaf Insets',
            subtitle: 'Window padding (px)',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 50,
                step_increment: 1,
                value: 0
            })
        });
        this._leafInsetsRow.connect('notify::value', () => {
            if (this._layout) {
                this._layout = EditorState.updateDefaults(this._layout, {
                    leaf_insets: this._leafInsetsRow.get_value()
                });
                this._isDirty = true;
                this._canvas.setLayout(this._layout);
            }
        });
        defaultsGroup.add(this._leafInsetsRow);

        innerBox.append(defaultsGroup);

        // Selected Zone section
        this._selectedGroup = new Adw.PreferencesGroup({
            title: 'Selected Zone',
            visible: false
        });

        // Zone ID
        this._zoneIdRow = new Adw.EntryRow({
            title: 'Zone ID'
        });
        this._zoneIdRow.connect('changed', () => {
            if (this._layout && this._selectedPath.length > 0) {
                const newId = this._zoneIdRow.get_text();
                if (newId && newId.trim()) {
                    this._layout = EditorState.renameLeaf(
                        this._layout,
                        this._selectedPath,
                        newId.trim()
                    );
                    this._isDirty = true;
                    this._canvas.setLayout(this._layout);
                }
            }
        });
        this._selectedGroup.add(this._zoneIdRow);

        // Size Kind
        this._sizeKindRow = new Adw.ComboRow({
            title: 'Size Type'
        });
        const sizeKindModel = new Gtk.StringList();
        sizeKindModel.append('Fraction (frac)');
        sizeKindModel.append('Fixed Pixels (px)');
        this._sizeKindRow.set_model(sizeKindModel);
        this._sizeKindRow.connect('notify::selected', () => {
            this._onSizeKindChanged();
        });
        this._selectedGroup.add(this._sizeKindRow);

        // Size Value
        this._sizeValueRow = new Adw.SpinRow({
            title: 'Size Value',
            adjustment: new Gtk.Adjustment({
                lower: 0.1,
                upper: 10,
                step_increment: 0.1,
                value: 1
            }),
            digits: 1
        });
        this._sizeValueRow.connect('notify::value', () => {
            this._onSizeValueChanged();
        });
        this._selectedGroup.add(this._sizeValueRow);

        innerBox.append(this._selectedGroup);

        // Selected Split section (for split nodes)
        this._splitGroup = new Adw.PreferencesGroup({
            title: 'Selected Split',
            visible: false
        });

        // Direction
        this._splitDirRow = new Adw.ComboRow({
            title: 'Direction'
        });
        const dirModel = new Gtk.StringList();
        dirModel.append('Horizontal (col)');
        dirModel.append('Vertical (row)');
        this._splitDirRow.set_model(dirModel);
        this._splitDirRow.connect('notify::selected', () => {
            this._onSplitDirChanged();
        });
        this._splitGroup.add(this._splitDirRow);

        // Split Gap Inner
        this._splitGapInnerRow = new Adw.SpinRow({
            title: 'Gap Inner',
            subtitle: 'Override gap between children (px)',
            adjustment: new Gtk.Adjustment({
                lower: -1,  // -1 means "use default"
                upper: 50,
                step_increment: 1,
                value: -1
            })
        });
        this._splitGapInnerRow.connect('notify::value', () => {
            this._onSplitGapChanged('gap_inner', this._splitGapInnerRow.get_value());
        });
        this._splitGroup.add(this._splitGapInnerRow);

        // Split Gap Outer
        this._splitGapOuterRow = new Adw.SpinRow({
            title: 'Gap Outer',
            subtitle: 'Override margin around split (px, -1=default)',
            adjustment: new Gtk.Adjustment({
                lower: -1,  // -1 means "use default"
                upper: 50,
                step_increment: 1,
                value: -1
            })
        });
        this._splitGapOuterRow.connect('notify::value', () => {
            this._onSplitGapChanged('gap_outer', this._splitGapOuterRow.get_value());
        });
        this._splitGroup.add(this._splitGapOuterRow);

        innerBox.append(this._splitGroup);

        // Template section (only for new layouts)
        this._templateGroup = new Adw.PreferencesGroup({
            title: 'Start from Template'
        });

        const templates = [
            { id: 'empty', name: 'Empty (Single Zone)' },
            { id: 'two-columns', name: 'Two Columns' },
            { id: 'three-columns', name: 'Three Columns' },
            { id: 'two-rows', name: 'Two Rows' },
            { id: 'grid-2x2', name: '2x2 Grid' },
            { id: 'main-sidebar', name: 'Main + Sidebar' }
        ];

        for (const template of templates) {
            const row = new Adw.ActionRow({
                title: template.name,
                activatable: true
            });
            row.connect('activated', () => {
                this.newFromTemplate(template.id);
            });
            row.add_suffix(new Gtk.Image({
                icon_name: 'go-next-symbolic'
            }));
            this._templateGroup.add(row);
        }

        innerBox.append(this._templateGroup);

        scrolled.set_child(innerBox);
        panel.append(scrolled);

        return panel;
    }

    /**
     * Update all UI elements from current state
     */
    _updateUI() {
        if (!this._layout) return;

        // Update name entry
        this._nameEntry.set_text(this._layout.name || '');

        // Update canvas
        this._canvas.setLayout(this._layout);
        this._canvas.setSelectedPath(this._selectedPath);

        // Update defaults
        const defaults = this._layout.defaults || {};
        this._gapInnerRow.set_value(defaults.gap_inner || 0);
        this._gapOuterRow.set_value(
            typeof defaults.gap_outer === 'number' ? defaults.gap_outer : 0
        );
        this._leafInsetsRow.set_value(
            typeof defaults.leaf_insets === 'number' ? defaults.leaf_insets : 0
        );

        // Update selected zone panel
        this._updateSelectedPanel();

        // Show/hide template section
        this._templateGroup.set_visible(this._isNewLayout && !this._isDirty);
    }

    /**
     * Update the selected node properties panel
     */
    _updateSelectedPanel() {
        const node = EditorState.getNodeAtPath(this._layout, this._selectedPath);

        // Hide both panels first
        this._selectedGroup.set_visible(false);
        this._splitGroup.set_visible(false);

        if (!node) {
            this._splitHButton.set_sensitive(false);
            this._splitVButton.set_sensitive(false);
            this._deleteButton.set_sensitive(false);
            this._parentButton.set_sensitive(false);
            return;
        }

        // Enable delete only if not root
        this._deleteButton.set_sensitive(this._selectedPath.length > 0);

        // Enable parent button if there's a parent to select
        this._parentButton.set_sensitive(this._selectedPath.length > 0);

        if (node.type === 'leaf') {
            // Show leaf panel
            this._selectedGroup.set_visible(true);
            this._splitHButton.set_sensitive(true);
            this._splitVButton.set_sensitive(true);

            // Update zone ID
            this._zoneIdRow.set_text(node.id || '');

            // Update size kind
            const size = node.size || { kind: 'frac', value: 1 };
            this._sizeKindRow.set_selected(size.kind === 'px' ? 1 : 0);

            // Update size value
            if (size.kind === 'px') {
                this._sizeValueRow.get_adjustment().set_lower(10);
                this._sizeValueRow.get_adjustment().set_upper(2000);
                this._sizeValueRow.get_adjustment().set_step_increment(10);
                this._sizeValueRow.set_digits(0);
            } else {
                this._sizeValueRow.get_adjustment().set_lower(0.1);
                this._sizeValueRow.get_adjustment().set_upper(10);
                this._sizeValueRow.get_adjustment().set_step_increment(0.1);
                this._sizeValueRow.set_digits(1);
            }
            this._sizeValueRow.set_value(size.value || 1);

        } else if (node.type === 'split') {
            // Show split panel
            this._splitGroup.set_visible(true);
            this._splitHButton.set_sensitive(false);  // Can't split a split
            this._splitVButton.set_sensitive(false);

            // Update direction
            this._splitDirRow.set_selected(node.dir === 'row' ? 1 : 0);

            // Update gap inner (-1 means use default)
            this._splitGapInnerRow.set_value(
                node.gap_inner !== undefined ? node.gap_inner : -1
            );

            // Update gap outer (-1 means use default)
            this._splitGapOuterRow.set_value(
                node.gap_outer !== undefined ? node.gap_outer : -1
            );
        }
    }

    /**
     * Handle zone clicked in canvas
     */
    _onZoneClicked(canvas, zoneId) {
        const path = this._canvas.findPathToZone(zoneId);
        if (path) {
            this._selectedPath = path;
            this._canvas.setSelectedPath(path);
            this._updateSelectedPanel();
        }
    }

    /**
     * Handle zone hover in canvas
     */
    _onZoneHover(canvas, zoneId) {
        // Could show tooltip or status bar info
    }

    /**
     * Handle size kind changed
     */
    _onSizeKindChanged() {
        if (!this._layout || this._selectedPath.length === 0) return;

        const node = EditorState.getNodeAtPath(this._layout, this._selectedPath);
        if (!node || node.type !== 'leaf') return;

        const kind = this._sizeKindRow.get_selected() === 1 ? 'px' : 'frac';
        const currentSize = node.size || { kind: 'frac', value: 1 };

        if (kind !== currentSize.kind) {
            const newValue = kind === 'px' ? 200 : 1;
            this._layout = EditorState.updateNodeAtPath(this._layout, this._selectedPath, {
                size: { kind, value: newValue }
            });
            this._isDirty = true;
            this._updateSelectedPanel();
            this._canvas.setLayout(this._layout);
        }
    }

    /**
     * Handle size value changed
     */
    _onSizeValueChanged() {
        if (!this._layout || this._selectedPath.length === 0) return;

        const node = EditorState.getNodeAtPath(this._layout, this._selectedPath);
        if (!node || node.type !== 'leaf') return;

        const kind = this._sizeKindRow.get_selected() === 1 ? 'px' : 'frac';
        const value = this._sizeValueRow.get_value();

        this._layout = EditorState.updateNodeAtPath(this._layout, this._selectedPath, {
            size: { kind, value }
        });
        this._isDirty = true;
        this._canvas.setLayout(this._layout);
    }

    /**
     * Select the parent split node
     */
    _selectParent() {
        if (this._selectedPath.length === 0) return;

        // Go up one level
        this._selectedPath = this._selectedPath.slice(0, -1);
        this._canvas.setSelectedPath(this._selectedPath);
        this._updateSelectedPanel();
    }

    /**
     * Handle split direction changed
     */
    _onSplitDirChanged() {
        if (!this._layout) return;

        const node = EditorState.getNodeAtPath(this._layout, this._selectedPath);
        if (!node || node.type !== 'split') return;

        const newDir = this._splitDirRow.get_selected() === 1 ? 'row' : 'col';
        if (newDir !== node.dir) {
            this._layout = EditorState.updateNodeAtPath(this._layout, this._selectedPath, {
                dir: newDir
            });
            this._isDirty = true;
            this._canvas.setLayout(this._layout);
        }
    }

    /**
     * Handle split gap changed
     */
    _onSplitGapChanged(property, value) {
        if (!this._layout) return;

        const node = EditorState.getNodeAtPath(this._layout, this._selectedPath);
        if (!node || node.type !== 'split') return;

        // -1 means "use default" - remove the property
        if (value < 0) {
            const newLayout = EditorState.cloneLayout(this._layout);
            const targetNode = EditorState.getNodeAtPath(newLayout, this._selectedPath);
            delete targetNode[property];
            this._layout = newLayout;
        } else {
            this._layout = EditorState.updateNodeAtPath(this._layout, this._selectedPath, {
                [property]: value
            });
        }

        this._isDirty = true;
        this._canvas.setLayout(this._layout);
    }

    /**
     * Split the selected zone
     */
    _splitSelected(direction) {
        if (!this._layout) return;

        // If nothing selected, split the root
        const pathToSplit = this._selectedPath.length > 0 ? this._selectedPath : [];

        this._layout = EditorState.splitNode(this._layout, pathToSplit, direction);
        this._isDirty = true;

        // Select the first new child
        this._selectedPath = [...pathToSplit, 0];
        this._canvas.setLayout(this._layout);
        this._canvas.setSelectedPath(this._selectedPath);
        this._updateSelectedPanel();

        // Hide template section after first edit
        this._templateGroup.set_visible(false);
    }

    /**
     * Delete the selected zone
     */
    _deleteSelected() {
        if (!this._layout || this._selectedPath.length === 0) return;

        this._layout = EditorState.deleteNode(this._layout, this._selectedPath);
        this._isDirty = true;

        // Clear selection
        this._selectedPath = [];
        this._canvas.setLayout(this._layout);
        this._canvas.setSelectedPath([]);
        this._updateSelectedPanel();
    }

    /**
     * Handle save button clicked
     */
    _onSaveClicked() {
        if (!this._layout) return;

        // Validate
        const result = EditorState.validate(this._layout);
        if (!result.valid) {
            // Show error dialog
            const dialog = new Adw.MessageDialog({
                heading: 'Validation Error',
                body: result.errors.join('\n'),
                transient_for: this
            });
            dialog.add_response('ok', 'OK');
            dialog.present();
            return;
        }

        // Check name is set
        if (!this._layout.name || !this._layout.name.trim()) {
            const dialog = new Adw.MessageDialog({
                heading: 'Missing Name',
                body: 'Please enter a name for the layout.',
                transient_for: this
            });
            dialog.add_response('ok', 'OK');
            dialog.present();
            return;
        }

        // Emit saved signal with layout JSON
        this.emit('layout-saved', JSON.stringify(this._layout));
        this.close();
    }
});
