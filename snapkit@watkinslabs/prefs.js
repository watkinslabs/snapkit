/**
 * SnapKit Extension Preferences
 *
 * Settings UI for the Extensions app
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { LayoutManager } from './src/btree/manager/layoutManager.js';
import { openLayoutEditor } from './prefs-ui/layoutEditor.js';

export default class SnapKitPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        this._window = window;

        // Appearance Page
        const appearancePage = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(appearancePage);

        // Colors Group
        const colorsGroup = new Adw.PreferencesGroup({
            title: 'Colors',
            description: 'Customize zone colors',
        });
        appearancePage.add(colorsGroup);

        this._addColorRow(colorsGroup, settings, 'zone-bg-color', 'Zone Background', 'Background color for zones');
        this._addColorRow(colorsGroup, settings, 'zone-border-color', 'Zone Border', 'Border color for zones');
        this._addColorRow(colorsGroup, settings, 'zone-highlight-color', 'Zone Highlight', 'Color when zone is selected');
        this._addColorRow(colorsGroup, settings, 'active-layout-border-color', 'Active Template Border', 'Border color for currently active template');
        this._addColorRow(colorsGroup, settings, 'active-layout-text-color', 'Active Template Text', 'Text color for currently active template');

        // Style Group
        const styleGroup = new Adw.PreferencesGroup({
            title: 'Style',
            description: 'Visual appearance options',
        });
        appearancePage.add(styleGroup);

        this._addSpinRow(styleGroup, settings, 'border-width', 'Border Width', 'Width of zone borders', 1, 5, 1);
        this._addSpinRow(styleGroup, settings, 'zone-label-size', 'Label Size', 'Font size for zone numbers', 16, 48, 2);
        this._addSpinRow(styleGroup, settings, 'overlay-opacity', 'Overlay Opacity', 'Opacity of the overlay', 0.5, 1.0, 0.05);
        this._addSwitchRow(styleGroup, settings, 'show-zone-numbers', 'Show Zone Numbers', 'Display numbers on zones');

        // Animation Group
        const animationGroup = new Adw.PreferencesGroup({
            title: 'Animations',
        });
        appearancePage.add(animationGroup);

        this._addSwitchRow(animationGroup, settings, 'enable-animations', 'Enable Animations', 'Animate overlay transitions');
        this._addSpinRow(animationGroup, settings, 'animation-speed', 'Animation Speed', 'Duration in milliseconds', 100, 500, 50);

        // Behavior Page
        const behaviorPage = new Adw.PreferencesPage({
            title: 'Behavior',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(behaviorPage);

        // Trigger Zones Group
        const triggerGroup = new Adw.PreferencesGroup({
            title: 'Trigger Zones',
            description: 'Configure screen edge triggers',
        });
        behaviorPage.add(triggerGroup);

        this._addSwitchRow(triggerGroup, settings, 'enable-edges', 'Enable Edge Triggers', 'Show overlay when cursor hits screen edge');
        this._addSwitchRow(triggerGroup, settings, 'enable-corners', 'Enable Corner Triggers', 'Show overlay when cursor hits screen corner');
        this._addSpinRow(triggerGroup, settings, 'edge-size', 'Edge Size', 'Size of edge trigger zone in pixels', 1, 10, 1);
        this._addSpinRow(triggerGroup, settings, 'corner-size', 'Corner Size', 'Size of corner trigger zone in pixels', 5, 30, 5);
        this._addSpinRow(triggerGroup, settings, 'debounce-delay', 'Debounce Delay', 'Delay before triggering in ms', 0, 300, 25);

        // Snapping Behavior Group
        const snapGroup = new Adw.PreferencesGroup({
            title: 'Snapping Behavior',
        });
        behaviorPage.add(snapGroup);

        this._addSwitchRow(snapGroup, settings, 'auto-snap-on-drag', 'Auto-snap on Drag', 'Snap windows when dragged to zones');
        this._addSwitchRow(snapGroup, settings, 'focus-window-on-snap', 'Focus on Snap', 'Focus window after snapping');
        this._addSwitchRow(snapGroup, settings, 'restore-on-unsnap', 'Restore on Unsnap', 'Restore size when unsnapping');
        this._addSwitchRow(
            snapGroup,
            settings,
            'live-resize-updates',
            'Live Divider Resize Updates',
            'Update snapped layouts continuously while resizing'
        );
        this._addSwitchRow(
            snapGroup,
            settings,
            'drag-zone-modifier-disables-zones',
            'Modifier Key Disables Zones',
            'Hold the selected modifier key while dragging to temporarily disable zones'
        );
        this._addComboStringRow(
            snapGroup,
            settings,
            'drag-zone-modifier-key',
            'Drag Zone Modifier Key',
            'Modifier key used to toggle zones while dragging',
            [
                { id: 'control', name: 'Ctrl' },
                { id: 'shift', name: 'Shift' },
                { id: 'alt', name: 'Alt' },
                { id: 'super', name: 'Super' },
            ]
        );

        const shakeGroup = new Adw.PreferencesGroup({
            title: 'Shake to Exit Snap',
            description: 'Configure shake gesture detection while dragging',
        });
        behaviorPage.add(shakeGroup);
        this._addSwitchRow(shakeGroup, settings, 'shake-enabled', 'Enable Shake to Exit', 'Cancel drag snap mode with shake gesture');
        this._addSpinRow(shakeGroup, settings, 'shake-window-ms', 'Shake Window (ms)', 'Detection time window in milliseconds', 100, 2000, 50);
        this._addSpinRow(shakeGroup, settings, 'shake-min-delta', 'Minimum Distance (px)', 'Minimum horizontal movement per shake sample', 5, 150, 1);
        this._addSpinRow(shakeGroup, settings, 'shake-direction-changes', 'Direction Changes', 'Direction changes required to trigger shake cancel', 1, 10, 1);

        // Keyboard Shortcuts Group
        const shortcutsGroup = new Adw.PreferencesGroup({
            title: 'Keyboard Shortcuts',
            description: 'Customize keyboard shortcuts',
        });
        behaviorPage.add(shortcutsGroup);

        this._addShortcutRow(shortcutsGroup, settings, 'toggle-overlay', 'Toggle Overlay', 'Shortcut to show/hide overlay');

        // Layout Page
        const layoutPage = new Adw.PreferencesPage({
            title: 'Layouts',
            icon_name: 'view-grid-symbolic',
        });
        window.add(layoutPage);

        // Default Layout Group
        const defaultLayoutGroup = new Adw.PreferencesGroup({
            title: 'Default Settings',
            description: 'Default layout configuration',
        });
        layoutPage.add(defaultLayoutGroup);

        this._addLayoutComboRow(defaultLayoutGroup, settings, 'default-layout', 'Default Layout', 'Layout for new monitors');
        this._addSpinRow(defaultLayoutGroup, settings, 'default-margin', 'Default Margin', 'Margin around layout in pixels', 0, 20, 1);
        this._addSpinRow(defaultLayoutGroup, settings, 'default-padding', 'Default Padding', 'Padding between zones in pixels', 0, 20, 1);

        // Workspace Settings Group
        const workspaceGroup = new Adw.PreferencesGroup({
            title: 'Workspace Settings',
        });
        layoutPage.add(workspaceGroup);

        this._addSwitchRow(workspaceGroup, settings, 'remember-per-workspace', 'Per-Workspace Layouts', 'Remember different layouts for each workspace');

        this._addLayoutManagementGroups(layoutPage, settings);

        // About Page
        const aboutPage = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);

        const aboutGroup = new Adw.PreferencesGroup();
        aboutPage.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: 'SnapKit Window Manager',
            subtitle: 'BTree-based window tiling for GNOME Shell',
        });
        aboutGroup.add(aboutRow);

        const versionRow = new Adw.ActionRow({
            title: 'Version',
            subtitle: this.metadata.version?.toString() || '1.0',
        });
        aboutGroup.add(versionRow);
    }

    _addSwitchRow(group, settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({
            title: title,
            subtitle: subtitle,
        });
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
        return row;
    }

    _addSpinRow(group, settings, key, title, subtitle, min, max, step) {
        const row = new Adw.SpinRow({
            title: title,
            subtitle: subtitle,
            adjustment: new Gtk.Adjustment({
                lower: min,
                upper: max,
                step_increment: step,
                page_increment: step * 10,
            }),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
        return row;
    }

    _addLayoutManagementGroups(layoutPage, settings) {
        // --- Custom layouts (editable) ---
        const customGroup = new Adw.PreferencesGroup({
            title: 'Custom Layouts',
            description: 'Layouts you have created. Click Edit to open the visual designer in the shell overlay.',
        });

        const addBtn = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            tooltip_text: 'Create new layout',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        addBtn.connect('clicked', () => {
            this._requestEditor(settings, { action: 'create' });
        });
        customGroup.set_header_suffix(addBtn);
        layoutPage.add(customGroup);

        const customEmptyRow = new Adw.ActionRow({
            title: 'No custom layouts yet',
            subtitle: 'Click + to create one, or Duplicate a built-in below to start from a template.',
        });
        customGroup.add(customEmptyRow);

        // --- Built-in layouts (read-only, duplicate to edit) ---
        const builtinGroup = new Adw.PreferencesGroup({
            title: 'Built-in Layouts',
            description: 'Shipped with SnapKit. Use Duplicate to start a new layout based on one of these.',
        });
        layoutPage.add(builtinGroup);

        // --- Per-monitor assignment ---
        const monitorGroup = new Adw.PreferencesGroup({
            title: 'Per-Monitor Layout',
            description: 'Default layout shown on each monitor.',
        });
        layoutPage.add(monitorGroup);

        // --- Divider overrides reset ---
        const overridesGroup = new Adw.PreferencesGroup({
            title: 'Manual Divider Adjustments',
            description: 'Custom divider positions saved when you drag splits at runtime.',
        });
        layoutPage.add(overridesGroup);

        const overridesRow = new Adw.ActionRow({
            title: 'Saved overrides',
            subtitle: 'No overrides saved',
        });
        const resetBtn = new Gtk.Button({
            label: 'Clear All',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
            sensitive: false,
        });
        resetBtn.connect('clicked', () => {
            settings.set_string('divider-overrides', '{}');
        });
        overridesRow.add_suffix(resetBtn);
        overridesGroup.add(overridesRow);

        const refresh = () => {
            this._refreshCustomLayoutsList(customGroup, customEmptyRow, settings);
            this._refreshBuiltinLayoutsList(builtinGroup, settings);
            this._refreshMonitorAssignmentList(monitorGroup, settings);
            this._refreshOverridesRow(overridesRow, resetBtn, settings);
        };
        refresh();

        // Stay in sync with shell-side changes.
        for (const key of ['custom-layouts', 'per-monitor-layouts', 'divider-overrides', 'disabled-layouts']) {
            settings.connect(`changed::${key}`, () => refresh());
        }
    }

    _readDisabledLayouts(settings) {
        try {
            return new Set(settings.get_strv('disabled-layouts'));
        } catch (_error) {
            return new Set();
        }
    }

    _writeDisabledLayouts(settings, set) {
        try {
            settings.set_strv('disabled-layouts', [...set].sort());
        } catch (error) {
            console.error('[SnapKit][Prefs] Failed to update disabled-layouts', error);
        }
    }

    _addEnableSwitch(row, settings, layoutId) {
        const sw = new Gtk.Switch({
            active: !this._readDisabledLayouts(settings).has(layoutId),
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Show in picker',
        });
        sw.connect('state-set', (_w, state) => {
            const disabled = this._readDisabledLayouts(settings);
            if (state) {
                disabled.delete(layoutId);
            } else {
                disabled.add(layoutId);
            }
            this._writeDisabledLayouts(settings, disabled);
            return false; // let GTK update the switch state
        });
        row.add_suffix(sw);
        return sw;
    }

    _requestEditor(settings, payload) {
        // Open the in-process Adw editor. Direct call beats the pending-layout-edit
        // GSettings round-trip and gives us a real modal transient on the prefs window.
        try {
            openLayoutEditor(this._window, settings, {
                mode: payload.action,            // 'create' | 'edit' | 'clone'
                layoutId: payload.layoutId || null,
            });
        } catch (error) {
            console.error('[SnapKit][Prefs] Failed to open layout editor', error);
        }
    }

    _readCustomLayouts(settings) {
        try {
            const raw = settings.get_string('custom-layouts');
            if (!raw || raw === '{}' || raw === '[]') {
                return [];
            }
            const parsed = JSON.parse(raw);
            const arr = Array.isArray(parsed) ? parsed : Object.values(parsed);
            return arr.filter(l => l && l.id);
        } catch (error) {
            console.error('[SnapKit][Prefs] Failed to parse custom-layouts', error);
            return [];
        }
    }

    _refreshCustomLayoutsList(group, emptyRow, settings) {
        // Clear previously-rendered custom rows (keep the emptyRow widget).
        for (const row of this._customRows ?? []) {
            group.remove(row);
        }
        this._customRows = [];

        const layouts = this._readCustomLayouts(settings);
        emptyRow.set_visible(layouts.length === 0);

        for (const layout of layouts) {
            const row = new Adw.ActionRow({
                title: layout.name || layout.id,
                subtitle: layout.description || layout.id,
            });

            this._addEnableSwitch(row, settings, layout.id);

            const editBtn = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                tooltip_text: 'Edit layout',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            editBtn.connect('clicked', () => {
                this._requestEditor(settings, { action: 'edit', layoutId: layout.id });
            });
            row.add_suffix(editBtn);

            const delBtn = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                tooltip_text: 'Delete',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat', 'destructive-action'],
            });
            delBtn.connect('clicked', () => {
                this._deleteCustomLayout(settings, layout.id);
            });
            row.add_suffix(delBtn);

            group.add(row);
            this._customRows.push(row);
        }
    }

    _refreshBuiltinLayoutsList(group, settings) {
        for (const row of this._builtinRows ?? []) {
            group.remove(row);
        }
        this._builtinRows = [];

        let builtins = [];
        try {
            const layoutManager = new LayoutManager();
            builtins = layoutManager.getBuiltinLayouts();
        } catch (error) {
            console.error('[SnapKit][Prefs] Failed to enumerate built-ins', error);
            builtins = [];
        }

        for (const layout of builtins) {
            const row = new Adw.ActionRow({
                title: layout.name || layout.id,
                subtitle: layout.description || layout.id,
            });

            this._addEnableSwitch(row, settings, layout.id);

            group.add(row);
            this._builtinRows.push(row);
        }
    }

    _deleteCustomLayout(settings, layoutId) {
        try {
            const raw = settings.get_string('custom-layouts');
            const parsed = raw && raw !== '{}' ? JSON.parse(raw) : {};

            let next;
            if (Array.isArray(parsed)) {
                next = parsed.filter(l => l?.id !== layoutId);
            } else {
                next = { ...parsed };
                delete next[layoutId];
            }
            settings.set_string('custom-layouts', JSON.stringify(next));
        } catch (error) {
            console.error('[SnapKit][Prefs] Failed to delete layout', error);
        }
    }

    _readPerMonitorLayouts(settings) {
        try {
            const raw = settings.get_string('per-monitor-layouts');
            if (!raw || raw === '{}') {
                return {};
            }
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.error('[SnapKit][Prefs] Failed to parse per-monitor-layouts', error);
            return {};
        }
    }

    _refreshMonitorAssignmentList(group, settings) {
        for (const row of this._monitorRows ?? []) {
            group.remove(row);
        }
        this._monitorRows = [];

        const display = Gdk.Display.get_default();
        const monitors = display ? display.get_monitors() : null;
        const monitorCount = monitors ? monitors.get_n_items() : 0;

        if (monitorCount === 0) {
            const row = new Adw.ActionRow({
                title: 'No monitors detected',
                subtitle: 'Open this page from a graphical session to assign per-monitor layouts.',
            });
            group.add(row);
            this._monitorRows.push(row);
            return;
        }

        const allLayouts = this._getLayoutOptions(settings);
        const assignments = this._readPerMonitorLayouts(settings);

        for (let i = 0; i < monitorCount; i++) {
            const monitor = monitors.get_item(i);
            const label = monitor?.get_connector?.() || monitor?.get_model?.() || `Monitor ${i + 1}`;

            const row = new Adw.ComboRow({
                title: label,
                subtitle: `Index ${i}`,
            });
            const model = new Gtk.StringList();
            allLayouts.forEach(l => model.append(l.name));
            row.set_model(model);

            const current = assignments[i] || assignments[String(i)] || settings.get_string('default-layout');
            const idx = allLayouts.findIndex(l => l.id === current);
            row.set_selected(idx >= 0 ? idx : 0);

            row.connect('notify::selected', () => {
                const sel = row.get_selected();
                if (sel < 0 || sel >= allLayouts.length) {
                    return;
                }
                const next = { ...this._readPerMonitorLayouts(settings) };
                next[i] = allLayouts[sel].id;
                settings.set_string('per-monitor-layouts', JSON.stringify(next));
            });

            group.add(row);
            this._monitorRows.push(row);
        }
    }

    _refreshOverridesRow(row, resetBtn, settings) {
        let count = 0;
        try {
            const raw = settings.get_string('divider-overrides');
            if (raw && raw !== '{}') {
                const parsed = JSON.parse(raw);
                count = Object.keys(parsed || {}).length;
            }
        } catch (_error) {
            count = 0;
        }
        row.set_subtitle(count === 0 ? 'No overrides saved' : `${count} override${count === 1 ? '' : 's'} saved`);
        resetBtn.set_sensitive(count > 0);
    }

    _addShortcutRow(group, settings, key, title, subtitle) {
        const row = new Adw.EntryRow({
            title: title,
        });

        const current = settings.get_strv(key);
        row.set_text(current.length > 0 ? current[0] : '');
        row.connect('changed', () => {
            const value = row.get_text().trim();
            settings.set_strv(key, value ? [value] : []);
        });
        group.add(row);
        return row;
    }

    _addColorRow(group, settings, key, title, subtitle) {
        const row = new Adw.ActionRow({
            title: title,
            subtitle: subtitle,
        });

        const colorButton = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            use_alpha: true,
        });

        // Parse current color
        const currentColor = settings.get_string(key);
        const rgba = new Gdk.RGBA();
        rgba.parse(currentColor);
        colorButton.set_rgba(rgba);

        colorButton.connect('color-set', () => {
            const color = colorButton.get_rgba();
            settings.set_string(key, color.to_string());
        });

        row.add_suffix(colorButton);
        row.set_activatable_widget(colorButton);
        group.add(row);
        return row;
    }

    _addLayoutComboRow(group, settings, key, title, subtitle) {
        const row = new Adw.ComboRow({
            title: title,
            subtitle: subtitle,
        });

        const layouts = this._getLayoutOptions(settings);

        const model = new Gtk.StringList();
        layouts.forEach(l => model.append(l.name));
        row.set_model(model);

        const currentLayout = settings.get_string(key);
        const currentIndex = layouts.findIndex(l => l.id === currentLayout);
        if (currentIndex >= 0) {
            row.set_selected(currentIndex);
        } else {
            row.set_selected(0);
        }

        row.connect('notify::selected', () => {
            const selected = row.get_selected();
            if (selected >= 0 && selected < layouts.length) {
                settings.set_string(key, layouts[selected].id);
            }
        });

        group.add(row);
        return row;
    }

    _getLayoutOptions(settings) {
        const fallbackLayouts = [
            { id: 'half-horizontal', name: 'Half Horizontal' },
            { id: 'half-split', name: 'Half Split' },
            { id: 'thirds-horizontal', name: 'Thirds Horizontal' },
            { id: 'thirds-vertical', name: 'Thirds Vertical' },
            { id: 'grid-2x2', name: '2x2 Grid' },
            { id: 'grid-3x3', name: '3x3 Grid' },
            { id: 'quarters', name: 'Quarters' },
        ];

        try {
            const layoutManager = new LayoutManager();
            const customLayoutsRaw = settings.get_string('custom-layouts');

            if (customLayoutsRaw && customLayoutsRaw !== '{}' && customLayoutsRaw !== '[]') {
                const parsed = JSON.parse(customLayoutsRaw);
                const customLayouts = Array.isArray(parsed) ? parsed : Object.values(parsed);

                for (const layoutDef of customLayouts) {
                    if (layoutDef?.id && layoutDef?.layout) {
                        layoutManager.registerLayout(layoutDef.id, layoutDef);
                    }
                }
            }

            const builtins = layoutManager.getBuiltinLayouts().map(layout => ({
                id: layout.id,
                name: layout.name || layout.id
            }));
            const customs = layoutManager.getCustomLayouts().map(layout => ({
                id: layout.id,
                name: layout.name || layout.id
            }));
            const allLayouts = [...builtins, ...customs];

            if (allLayouts.length > 0) {
                return allLayouts;
            }
        } catch (error) {
            console.error('[SnapKit][Prefs] Failed to build layout options', error);
        }

        return fallbackLayouts;
    }

    _addComboStringRow(group, settings, key, title, subtitle, options) {
        const row = new Adw.ComboRow({
            title: title,
            subtitle: subtitle,
        });

        const model = new Gtk.StringList();
        options.forEach(option => model.append(option.name));
        row.set_model(model);

        const currentValue = settings.get_string(key);
        const currentIndex = options.findIndex(option => option.id === currentValue);
        row.set_selected(currentIndex >= 0 ? currentIndex : 0);

        row.connect('notify::selected', () => {
            const selected = row.get_selected();
            if (selected >= 0 && selected < options.length) {
                settings.set_string(key, options[selected].id);
            }
        });

        group.add(row);
        return row;
    }
}
