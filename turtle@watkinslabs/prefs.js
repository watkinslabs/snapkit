/**
 * Turtle Extension Preferences
 *
 * Settings UI for the Extensions app
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TurtlePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

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

        // Keyboard Shortcuts Group
        const shortcutsGroup = new Adw.PreferencesGroup({
            title: 'Keyboard Shortcuts',
            description: 'Customize keyboard shortcuts',
        });
        behaviorPage.add(shortcutsGroup);

        this._addEntryRow(shortcutsGroup, settings, 'toggle-overlay', 'Toggle Overlay', 'Shortcut to show/hide overlay');

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

        // About Page
        const aboutPage = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);

        const aboutGroup = new Adw.PreferencesGroup();
        aboutPage.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: 'Turtle Window Manager',
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

    _addEntryRow(group, settings, key, title, subtitle) {
        const row = new Adw.EntryRow({
            title: title,
        });
        row.set_text(settings.get_string(key));
        row.connect('changed', () => {
            settings.set_string(key, row.get_text());
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

        const layouts = [
            { id: 'halves-h', name: 'Halves (Horizontal)' },
            { id: 'halves-v', name: 'Halves (Vertical)' },
            { id: 'thirds-h', name: 'Thirds (Horizontal)' },
            { id: 'thirds-v', name: 'Thirds (Vertical)' },
            { id: 'grid-2x2', name: 'Grid 2x2' },
            { id: 'grid-3x2', name: 'Grid 3x2' },
            { id: 'master-stack', name: 'Master + Stack' },
        ];

        const model = new Gtk.StringList();
        layouts.forEach(l => model.append(l.name));
        row.set_model(model);

        const currentLayout = settings.get_string(key);
        const currentIndex = layouts.findIndex(l => l.id === currentLayout);
        if (currentIndex >= 0) {
            row.set_selected(currentIndex);
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
}
