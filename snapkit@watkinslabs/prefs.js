import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { LayoutEditorDialog } from './lib/layoutEditorDialog.js';
import { getLayoutSummary } from './lib/layoutEditorState.js';

export default class SnapKitPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // ===== APPEARANCE PAGE =====
        const appearancePage = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'preferences-desktop-appearance-symbolic'
        });

        // Trigger/Hitbox Appearance Group
        const hitboxGroup = new Adw.PreferencesGroup({
            title: 'Trigger/Hitbox Indicator',
            description: 'Visual appearance of the trigger indicator when overlay is closed'
        });

        hitboxGroup.add(this._createColorRow(
            settings,
            'hitbox-background-color',
            'Hitbox Background Color',
            'Color of the thin trigger strip shown when closed'
        ));

        appearancePage.add(hitboxGroup);

        // Main Overlay Background Group
        const appearanceGroup = new Adw.PreferencesGroup({
            title: 'Main Overlay Background',
            description: 'Appearance of the full overlay when open'
        });

        // Background Type Selection
        const bgTypeRow = new Adw.ComboRow({
            title: 'Background Type',
            subtitle: 'Solid color or gradient'
        });

        const bgTypeModel = new Gtk.StringList();
        bgTypeModel.append('Solid Color');
        bgTypeModel.append('Vertical Gradient');
        bgTypeModel.append('Horizontal Gradient');
        bgTypeModel.append('Radial Gradient');
        bgTypeRow.set_model(bgTypeModel);

        const currentBgType = settings.get_string('overlay-background-type');
        const bgTypeMap = {solid: 0, 'gradient-vertical': 1, 'gradient-horizontal': 2, 'gradient-radial': 3};
        bgTypeRow.set_selected(bgTypeMap[currentBgType] || 0);

        bgTypeRow.connect('notify::selected', (widget) => {
            const types = ['solid', 'gradient-vertical', 'gradient-horizontal', 'gradient-radial'];
            settings.set_string('overlay-background-type', types[widget.selected]);
        });

        appearanceGroup.add(bgTypeRow);

        // Background Color (Start)
        appearanceGroup.add(this._createColorRow(
            settings,
            'overlay-background-color',
            'Background Color (Start)',
            'Primary background color or gradient start'
        ));

        // Background Color (End) - for gradients
        appearanceGroup.add(this._createColorRow(
            settings,
            'overlay-background-color-end',
            'Background Color (End)',
            'Gradient end color (used when gradient is selected)'
        ));

        // Opacity
        const opacityRow = new Adw.ActionRow({
            title: 'Overlay Opacity',
            subtitle: 'Transparency of the overlay (0.0 - 1.0)'
        });

        const opacityScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0.0,
                upper: 1.0,
                step_increment: 0.05,
                value: settings.get_double('overlay-opacity')
            }),
            digits: 2,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER
        });

        opacityScale.connect('value-changed', (widget) => {
            settings.set_double('overlay-opacity', widget.get_value());
        });

        opacityRow.add_suffix(opacityScale);
        appearanceGroup.add(opacityRow);

        appearancePage.add(appearanceGroup);

        // Layout Card Colors
        const cardColorsGroup = new Adw.PreferencesGroup({
            title: 'Layout Cards',
            description: 'Customize layout preview card appearance'
        });

        cardColorsGroup.add(this._createColorRow(
            settings,
            'layout-card-background',
            'Card Background',
            'Background color for layout preview cards'
        ));

        cardColorsGroup.add(this._createColorRow(
            settings,
            'layout-card-border',
            'Card Border',
            'Border color for layout preview cards'
        ));

        cardColorsGroup.add(this._createColorRow(
            settings,
            'overlay-grid-color',
            'Grid Color',
            'Color of layout grid borders'
        ));

        // Show Layout Names Toggle
        const showNamesRow = new Adw.ActionRow({
            title: 'Show Layout Names',
            subtitle: 'Display names above layout previews'
        });

        const showNamesSwitch = new Gtk.Switch({
            active: settings.get_boolean('show-layout-names'),
            valign: Gtk.Align.CENTER
        });

        settings.bind('show-layout-names', showNamesSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);

        showNamesRow.add_suffix(showNamesSwitch);
        showNamesRow.activatable_widget = showNamesSwitch;
        cardColorsGroup.add(showNamesRow);

        // Layout Spacing
        const layoutSpacingRow = new Adw.ActionRow({
            title: 'Layout Spacing',
            subtitle: 'Spacing between layout cards in pixels'
        });

        const layoutSpacingSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 2,
                value: settings.get_int('layout-spacing')
            }),
            valign: Gtk.Align.CENTER
        });

        layoutSpacingSpin.connect('value-changed', (widget) => {
            settings.set_int('layout-spacing', widget.get_value());
        });

        layoutSpacingRow.add_suffix(layoutSpacingSpin);
        cardColorsGroup.add(layoutSpacingRow);

        appearancePage.add(cardColorsGroup);

        // Zone Colors
        const zoneColorsGroup = new Adw.PreferencesGroup({
            title: 'Zone Styling',
            description: 'Customize zone appearance within layouts'
        });

        zoneColorsGroup.add(this._createColorRow(
            settings,
            'zone-background',
            'Zone Background',
            'Background color for zones in previews'
        ));

        zoneColorsGroup.add(this._createColorRow(
            settings,
            'zone-border',
            'Zone Border',
            'Border color for zones in previews'
        ));

        zoneColorsGroup.add(this._createColorRow(
            settings,
            'overlay-highlight-color',
            'Highlight Color',
            'Color for zone highlighting on hover'
        ));

        appearancePage.add(zoneColorsGroup);

        window.add(appearancePage);

        // ===== BEHAVIOR PAGE =====
        const behaviorPage = new Adw.PreferencesPage({
            title: 'Behavior',
            icon_name: 'preferences-system-symbolic'
        });

        // Trigger Settings Group
        const triggerGroup = new Adw.PreferencesGroup({
            title: 'Trigger Settings',
            description: 'Configure how the overlay is activated'
        });

        // Trigger Edge Selection
        const edgeRow = new Adw.ComboRow({
            title: 'Trigger Edge',
            subtitle: 'Which screen edge activates the overlay'
        });

        const edgeModel = new Gtk.StringList();
        edgeModel.append('Top');
        edgeModel.append('Bottom');
        edgeModel.append('Left');
        edgeModel.append('Right');
        edgeRow.set_model(edgeModel);

        const currentEdge = settings.get_string('trigger-edge');
        const edgeMap = {top: 0, bottom: 1, left: 2, right: 3};
        edgeRow.set_selected(edgeMap[currentEdge] || 0);

        edgeRow.connect('notify::selected', (widget) => {
            const edges = ['top', 'bottom', 'left', 'right'];
            settings.set_string('trigger-edge', edges[widget.selected]);
        });

        triggerGroup.add(edgeRow);

        // Trigger Zone Height
        const triggerRow = new Adw.ActionRow({
            title: 'Trigger Zone Height',
            subtitle: 'Height in pixels of the edge trigger zone'
        });

        const triggerSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 100,
                step_increment: 1,
                value: settings.get_int('trigger-zone-height')
            }),
            valign: Gtk.Align.CENTER
        });

        triggerSpin.connect('value-changed', (widget) => {
            settings.set_int('trigger-zone-height', widget.get_value());
        });

        triggerRow.add_suffix(triggerSpin);
        triggerGroup.add(triggerRow);

        // Push Time
        const pushTimeRow = new Adw.ActionRow({
            title: 'Push Time (Hover Delay)',
            subtitle: 'Milliseconds to hover before opening (0 = instant)'
        });

        const pushTimeSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 2000,
                step_increment: 50,
                value: settings.get_int('push-time')
            }),
            valign: Gtk.Align.CENTER
        });

        pushTimeSpin.connect('value-changed', (widget) => {
            settings.set_int('push-time', widget.get_value());
        });

        pushTimeRow.add_suffix(pushTimeSpin);
        triggerGroup.add(pushTimeRow);

        behaviorPage.add(triggerGroup);

        // Overlay Size Group
        const sizeGroup = new Adw.PreferencesGroup({
            title: 'Overlay Size',
            description: 'Control the size of the overlay'
        });

        // Overlay Scale
        const overlayScaleRow = new Adw.ActionRow({
            title: 'Overlay Scale',
            subtitle: 'Scale factor for overlay height (0.5 - 2.0)'
        });

        const overlayScaleScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0.5,
                upper: 2.0,
                step_increment: 0.1,
                value: settings.get_double('overlay-scale')
            }),
            digits: 1,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER
        });

        overlayScaleScale.connect('value-changed', (widget) => {
            settings.set_double('overlay-scale', widget.get_value());
        });

        overlayScaleRow.add_suffix(overlayScaleScale);
        sizeGroup.add(overlayScaleRow);

        behaviorPage.add(sizeGroup);

        // Monitor and Auto-hide Group
        const monitorGroup = new Adw.PreferencesGroup({
            title: 'Monitor & Auto-hide',
            description: 'Multi-monitor and auto-hide settings'
        });

        // Monitor Mode Selection
        const monitorRow = new Adw.ComboRow({
            title: 'Monitor Mode',
            subtitle: 'Which monitor(s) to show overlay on'
        });

        const monitorModel = new Gtk.StringList();
        monitorModel.append('Primary Monitor Only');
        monitorModel.append('Current Monitor (where mouse is)');
        monitorModel.append('All Monitors');
        monitorRow.set_model(monitorModel);

        const currentMonitorMode = settings.get_string('monitor-mode');
        const monitorMap = {primary: 0, current: 1, all: 2};
        monitorRow.set_selected(monitorMap[currentMonitorMode] || 0);

        monitorRow.connect('notify::selected', (widget) => {
            const modes = ['primary', 'current', 'all'];
            settings.set_string('monitor-mode', modes[widget.selected]);
        });

        monitorGroup.add(monitorRow);

        // Auto-hide Toggle
        const autoHideRow = new Adw.ActionRow({
            title: 'Auto-hide',
            subtitle: 'Automatically hide overlay when mouse leaves'
        });

        const autoHideSwitch = new Gtk.Switch({
            active: settings.get_boolean('auto-hide-enabled'),
            valign: Gtk.Align.CENTER
        });

        settings.bind('auto-hide-enabled', autoHideSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);

        autoHideRow.add_suffix(autoHideSwitch);
        autoHideRow.activatable_widget = autoHideSwitch;
        monitorGroup.add(autoHideRow);

        // Animation Duration
        const animationRow = new Adw.ActionRow({
            title: 'Animation Duration',
            subtitle: 'Duration of fade animations in milliseconds'
        });

        const animationSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1000,
                step_increment: 50,
                value: settings.get_int('animation-duration')
            }),
            valign: Gtk.Align.CENTER
        });

        animationSpin.connect('value-changed', (widget) => {
            settings.set_int('animation-duration', widget.get_value());
        });

        animationRow.add_suffix(animationSpin);
        monitorGroup.add(animationRow);

        behaviorPage.add(monitorGroup);

        // SNAP MODE Group
        const snapModeGroup = new Adw.PreferencesGroup({
            title: 'SNAP MODE',
            description: 'Window selection and snapping behavior'
        });

        // SNAP MODE Timeout
        const snapTimeoutRow = new Adw.ActionRow({
            title: 'SNAP MODE Timeout',
            subtitle: 'Seconds before auto-exit (prevents getting stuck)'
        });

        const snapTimeoutSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 300,
                step_increment: 10,
                value: settings.get_int('snap-mode-timeout')
            }),
            valign: Gtk.Align.CENTER
        });

        snapTimeoutSpin.connect('value-changed', (widget) => {
            settings.set_int('snap-mode-timeout', widget.get_value());
        });

        snapTimeoutRow.add_suffix(snapTimeoutSpin);
        snapModeGroup.add(snapTimeoutRow);

        // Max Window Thumbnails
        const maxWindowsRow = new Adw.ActionRow({
            title: 'Max Window Thumbnails',
            subtitle: 'Maximum windows to show in selector'
        });

        const maxWindowsSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 4,
                upper: 20,
                step_increment: 1,
                value: settings.get_int('max-window-thumbnails')
            }),
            valign: Gtk.Align.CENTER
        });

        maxWindowsSpin.connect('value-changed', (widget) => {
            settings.set_int('max-window-thumbnails', widget.get_value());
        });

        maxWindowsRow.add_suffix(maxWindowsSpin);
        snapModeGroup.add(maxWindowsRow);

        behaviorPage.add(snapModeGroup);

        // Snap Preview Group
        const snapPreviewGroup = new Adw.PreferencesGroup({
            title: 'Snap Preview (Drag to Snap)',
            description: 'Show snap grid when dragging windows'
        });

        // Enable snap preview
        const snapPreviewEnabledRow = new Adw.ActionRow({
            title: 'Enable Snap Preview',
            subtitle: 'Show snap grid overlay when dragging windows'
        });
        const snapPreviewEnabledSwitch = new Gtk.Switch({
            active: settings.get_boolean('snap-preview-enabled'),
            valign: Gtk.Align.CENTER
        });
        settings.bind('snap-preview-enabled', snapPreviewEnabledSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        snapPreviewEnabledRow.add_suffix(snapPreviewEnabledSwitch);
        snapPreviewEnabledRow.activatable_widget = snapPreviewEnabledSwitch;
        snapPreviewGroup.add(snapPreviewEnabledRow);

        // Auto-snap on release
        const autoSnapRow = new Adw.ActionRow({
            title: 'Auto-Snap on Release',
            subtitle: 'Automatically snap window when released over a zone'
        });
        const autoSnapSwitch = new Gtk.Switch({
            active: settings.get_boolean('snap-preview-auto-snap'),
            valign: Gtk.Align.CENTER
        });
        settings.bind('snap-preview-auto-snap', autoSnapSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        autoSnapRow.add_suffix(autoSnapSwitch);
        autoSnapRow.activatable_widget = autoSnapSwitch;
        snapPreviewGroup.add(autoSnapRow);

        // Snap disable key
        const disableKeyRow = new Adw.ComboRow({
            title: 'Snap Disable Key',
            subtitle: 'Hold this key while dragging to disable snap'
        });
        const disableKeyModel = new Gtk.StringList();
        disableKeyModel.append('Ctrl');
        disableKeyModel.append('Alt');
        disableKeyModel.append('Shift');
        disableKeyModel.append('Super');
        disableKeyRow.set_model(disableKeyModel);

        const currentDisableKey = settings.get_string('snap-disable-key');
        const disableKeyMap = {'ctrl': 0, 'alt': 1, 'shift': 2, 'super': 3};
        disableKeyRow.set_selected(disableKeyMap[currentDisableKey] ?? 0);

        disableKeyRow.connect('notify::selected', (widget) => {
            const keys = ['ctrl', 'alt', 'shift', 'super'];
            settings.set_string('snap-disable-key', keys[widget.selected]);
        });
        snapPreviewGroup.add(disableKeyRow);

        // Grid color
        snapPreviewGroup.add(this._createColorRow(
            settings,
            'snap-preview-grid-color',
            'Grid Zone Color',
            'Background color of snap zones'
        ));

        // Grid border color
        snapPreviewGroup.add(this._createColorRow(
            settings,
            'snap-preview-grid-border-color',
            'Grid Border Color',
            'Border color of snap zones'
        ));

        // Highlight color
        snapPreviewGroup.add(this._createColorRow(
            settings,
            'snap-preview-highlight-color',
            'Highlight Color',
            'Color when window is over a zone'
        ));

        behaviorPage.add(snapPreviewGroup);

        // Performance Group
        const performanceGroup = new Adw.PreferencesGroup({
            title: 'Performance',
            description: 'Fine-tune performance and responsiveness'
        });

        // Motion Throttle
        const throttleRow = new Adw.ActionRow({
            title: 'Motion Event Throttle',
            subtitle: 'Milliseconds between motion processing (lower = responsive, higher = efficient)'
        });

        const throttleSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 8,
                upper: 100,
                step_increment: 4,
                value: settings.get_int('motion-throttle-interval')
            }),
            valign: Gtk.Align.CENTER
        });

        throttleSpin.connect('value-changed', (widget) => {
            settings.set_int('motion-throttle-interval', widget.get_value());
        });

        throttleRow.add_suffix(throttleSpin);
        performanceGroup.add(throttleRow);

        behaviorPage.add(performanceGroup);

        window.add(behaviorPage);

        // ===== SNAP MODE UI PAGE =====
        const snapUiPage = new Adw.PreferencesPage({
            title: 'Snap Mode UI',
            icon_name: 'applications-graphics-symbolic'
        });

        const windowPreviewGroup = new Adw.PreferencesGroup({
            title: 'Window Previews',
            description: 'Control size and labels of SNAP MODE thumbnails'
        });

        const thumbWidthRow = new Adw.ActionRow({
            title: 'Thumbnail Width',
            subtitle: 'Width of each window thumbnail (px)'
        });
        const thumbWidthSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 200,
                upper: 600,
                step_increment: 10,
                value: settings.get_int('snap-thumbnail-width')
            }),
            valign: Gtk.Align.CENTER
        });
        thumbWidthSpin.connect('value-changed', (widget) => {
            settings.set_int('snap-thumbnail-width', widget.get_value());
        });
        thumbWidthRow.add_suffix(thumbWidthSpin);
        windowPreviewGroup.add(thumbWidthRow);

        const thumbHeightRow = new Adw.ActionRow({
            title: 'Thumbnail Height',
            subtitle: 'Height of each window thumbnail (px)'
        });
        const thumbHeightSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 180,
                upper: 500,
                step_increment: 10,
                value: settings.get_int('snap-thumbnail-height')
            }),
            valign: Gtk.Align.CENTER
        });
        thumbHeightSpin.connect('value-changed', (widget) => {
            settings.set_int('snap-thumbnail-height', widget.get_value());
        });
        thumbHeightRow.add_suffix(thumbHeightSpin);
        windowPreviewGroup.add(thumbHeightRow);

        const thumbPaddingRow = new Adw.ActionRow({
            title: 'Thumbnail Padding',
            subtitle: 'Inner padding of each thumbnail card (px)'
        });
        const thumbPaddingSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 64,
                step_increment: 2,
                value: settings.get_int('snap-thumbnail-padding')
            }),
            valign: Gtk.Align.CENTER
        });
        thumbPaddingSpin.connect('value-changed', (widget) => {
            settings.set_int('snap-thumbnail-padding', widget.get_value());
        });
        thumbPaddingRow.add_suffix(thumbPaddingSpin);
        windowPreviewGroup.add(thumbPaddingRow);

        const showLabelsRow = new Adw.ActionRow({
            title: 'Show Labels',
            subtitle: 'Show single-line window/app label under thumbnails'
        });
        const showLabelsSwitch = new Gtk.Switch({
            active: settings.get_boolean('show-window-labels'),
            valign: Gtk.Align.CENTER
        });
        settings.bind('show-window-labels', showLabelsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        showLabelsRow.add_suffix(showLabelsSwitch);
        showLabelsRow.activatable_widget = showLabelsSwitch;
        windowPreviewGroup.add(showLabelsRow);

        snapUiPage.add(windowPreviewGroup);
        window.add(snapUiPage);

        // ===== LAYOUTS PAGE =====
        const layoutsPage = new Adw.PreferencesPage({
            title: 'Layouts',
            icon_name: 'view-grid-symbolic'
        });

        // Layouts Group
        const layoutsGroup = new Adw.PreferencesGroup({
            title: 'Layouts',
            description: 'Enable or disable specific layout patterns'
        });

        // Layout toggles
        const layoutOptions = [
            {id: 'half-split', name: 'Half Split', desc: 'Left/Right halves'},
            {id: 'quarters', name: 'Quarters', desc: 'Four equal quadrants'},
            {id: 'thirds-vertical', name: 'Thirds (Vertical)', desc: 'Three vertical columns'},
            {id: 'thirds-horizontal', name: 'Thirds (Horizontal)', desc: 'Three horizontal rows'},
            {id: 'left-focus', name: 'Left Focus', desc: 'Large left, split right'},
            {id: 'right-focus', name: 'Right Focus', desc: 'Split left, large right'},
            {id: 'top-focus', name: 'Top Focus', desc: 'Large top, split bottom'},
            {id: 'bottom-focus', name: 'Bottom Focus', desc: 'Split top, large bottom'}
        ];

        const enabledLayouts = settings.get_strv('enabled-layouts');

        for (let layout of layoutOptions) {
            const row = new Adw.ActionRow({
                title: layout.name,
                subtitle: layout.desc
            });

            const toggle = new Gtk.Switch({
                active: enabledLayouts.includes(layout.id),
                valign: Gtk.Align.CENTER
            });

            toggle.connect('state-set', (widget, state) => {
                let layouts = settings.get_strv('enabled-layouts');

                if (state && !layouts.includes(layout.id)) {
                    layouts.push(layout.id);
                    settings.set_strv('enabled-layouts', layouts);
                } else if (!state && layouts.includes(layout.id)) {
                    layouts = layouts.filter(id => id !== layout.id);
                    settings.set_strv('enabled-layouts', layouts);
                }

                return false;
            });

            row.add_suffix(toggle);
            row.activatable_widget = toggle;
            layoutsGroup.add(row);
        }

        layoutsPage.add(layoutsGroup);

        // Custom Layouts Group
        const customLayoutsGroup = new Adw.PreferencesGroup({
            title: 'Custom Layouts',
            description: 'Create and manage your own layouts'
        });

        // Create New Layout button
        const createButton = new Gtk.Button({
            label: 'Create New Layout',
            css_classes: ['suggested-action'],
            halign: Gtk.Align.START,
            margin_top: 6,
            margin_bottom: 6
        });
        createButton.connect('clicked', () => {
            this._openLayoutEditor(window, settings, null);
        });
        customLayoutsGroup.add(createButton);

        // List of custom layouts
        this._customLayoutsBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6
        });
        customLayoutsGroup.add(this._customLayoutsBox);

        // Populate custom layouts list
        this._refreshCustomLayoutsList(settings, window);

        // Listen for settings changes to refresh list
        settings.connect('changed::custom-layouts', () => {
            this._refreshCustomLayoutsList(settings, window);
        });

        layoutsPage.add(customLayoutsGroup);

        window.add(layoutsPage);

        // ===== ADVANCED PAGE =====
        const advancedPage = new Adw.PreferencesPage({
            title: 'Advanced',
            icon_name: 'preferences-other-symbolic'
        });

        const advancedGroup = new Adw.PreferencesGroup({
            title: 'Advanced Settings',
            description: 'System integration and debugging'
        });

        // Disable Native Edge Tiling
        const disableEdgeTilingRow = new Adw.ActionRow({
            title: 'Disable Native Edge Tiling',
            subtitle: 'Disable GNOME\'s built-in edge tiling to prevent conflicts'
        });

        const disableEdgeTilingSwitch = new Gtk.Switch({
            active: settings.get_boolean('disable-native-edge-tiling'),
            valign: Gtk.Align.CENTER
        });

        settings.bind('disable-native-edge-tiling', disableEdgeTilingSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);

        disableEdgeTilingRow.add_suffix(disableEdgeTilingSwitch);
        disableEdgeTilingRow.activatable_widget = disableEdgeTilingSwitch;
        advancedGroup.add(disableEdgeTilingRow);

        advancedPage.add(advancedGroup);

        // Debug Group (at bottom of Advanced page)
        const debugGroup = new Adw.PreferencesGroup({
            title: 'Debugging',
            description: 'Troubleshooting and logging'
        });

        // Debug Mode
        const debugModeRow = new Adw.ActionRow({
            title: 'Debug Mode',
            subtitle: 'Enable verbose logging for troubleshooting'
        });

        const debugModeSwitch = new Gtk.Switch({
            active: settings.get_boolean('debug-mode'),
            valign: Gtk.Align.CENTER
        });

        settings.bind('debug-mode', debugModeSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);

        debugModeRow.add_suffix(debugModeSwitch);
        debugModeRow.activatable_widget = debugModeSwitch;
        debugGroup.add(debugModeRow);

        advancedPage.add(debugGroup);

        window.add(advancedPage);

        // ===== ABOUT PAGE =====
        const aboutPage = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic'
        });

        // About Group
        const aboutGroup = new Adw.PreferencesGroup({
            title: 'SnapKit',
            description: 'Windows 11-style snap layout grid for GNOME'
        });

        const versionRow = new Adw.ActionRow({
            title: 'Version',
            subtitle: '1.0.0'
        });

        aboutGroup.add(versionRow);

        const authorRow = new Adw.ActionRow({
            title: 'Author',
            subtitle: 'Chris Watkins / Watkins Labs'
        });

        aboutGroup.add(authorRow);

        const licenseRow = new Adw.ActionRow({
            title: 'License',
            subtitle: 'MIT License'
        });

        aboutGroup.add(licenseRow);

        aboutPage.add(aboutGroup);

        // Important Notes Group
        const notesGroup = new Adw.PreferencesGroup({
            title: 'Important Notes',
            description: 'Installation and update information'
        });

        const waylandRow = new Adw.ActionRow({
            title: 'Wayland Updates',
            subtitle: 'When updating in Wayland, you must log out and log back in for the extension update to take effect.'
        });

        notesGroup.add(waylandRow);

        aboutPage.add(notesGroup);

        window.add(aboutPage);
    }

    _createColorRow(settings, key, title, subtitle) {
        const row = new Adw.ActionRow({
            title: title,
            subtitle: subtitle
        });

        const colorButton = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            use_alpha: true
        });

        // Parse current color with validation
        const colorString = settings.get_string(key);
        const rgba = new Gdk.RGBA();
        
        if (!rgba.parse(colorString)) {
            // If parsing fails, use a default color
            log(`SnapKit Prefs: Invalid color string for ${key}: ${colorString}, using default`);
            rgba.parse('rgba(0, 0, 0, 0.5)');
        }
        
        colorButton.set_rgba(rgba);

        // Connect to color changes
        colorButton.connect('color-set', (widget) => {
            try {
                const color = widget.get_rgba();
                const colorStr = `rgba(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}, ${color.alpha.toFixed(2)})`;
                settings.set_string(key, colorStr);
            } catch (e) {
                log(`SnapKit Prefs: Error setting color for ${key}: ${e.message}`);
            }
        });

        row.add_suffix(colorButton);
        return row;
    }

    /**
     * Open the layout editor dialog
     * @param {Adw.PreferencesWindow} parentWindow
     * @param {Gio.Settings} settings
     * @param {object|null} layout - Layout to edit, or null for new
     */
    _openLayoutEditor(parentWindow, settings, layout) {
        const dialog = new LayoutEditorDialog({
            transient_for: parentWindow
        });

        if (layout) {
            dialog.editLayout(layout);
        } else {
            dialog.newFromTemplate('empty');
        }

        dialog.connect('layout-saved', (dlg, layoutJson) => {
            try {
                const savedLayout = JSON.parse(layoutJson);
                this._saveCustomLayout(settings, savedLayout, layout);
            } catch (e) {
                log(`SnapKit Prefs: Error saving layout: ${e.message}`);
            }
        });

        dialog.present();
    }

    /**
     * Save a custom layout to settings
     * @param {Gio.Settings} settings
     * @param {object} layout - Layout to save
     * @param {object|null} originalLayout - Original layout if editing
     */
    _saveCustomLayout(settings, layout, originalLayout) {
        try {
            const customLayoutsJson = settings.get_string('custom-layouts');
            let customLayouts = [];

            if (customLayoutsJson && customLayoutsJson !== '[]') {
                customLayouts = JSON.parse(customLayoutsJson);
            }

            if (originalLayout) {
                // Editing - find and replace
                const index = customLayouts.findIndex(l =>
                    l.name === originalLayout.name
                );
                if (index >= 0) {
                    customLayouts[index] = layout;
                } else {
                    customLayouts.push(layout);
                }
            } else {
                // New layout - check for name collision
                const existing = customLayouts.findIndex(l => l.name === layout.name);
                if (existing >= 0) {
                    // Generate unique name
                    let counter = 1;
                    let newName = layout.name;
                    while (customLayouts.some(l => l.name === newName)) {
                        newName = `${layout.name} (${counter++})`;
                    }
                    layout.name = newName;
                }
                customLayouts.push(layout);
            }

            settings.set_string('custom-layouts', JSON.stringify(customLayouts));

            // Auto-enable the new layout
            const enabledLayouts = settings.get_strv('enabled-layouts');
            if (!enabledLayouts.includes(layout.name)) {
                enabledLayouts.push(layout.name);
                settings.set_strv('enabled-layouts', enabledLayouts);
            }
        } catch (e) {
            log(`SnapKit Prefs: Error saving custom layout: ${e.message}`);
        }
    }

    /**
     * Refresh the custom layouts list
     * @param {Gio.Settings} settings
     * @param {Adw.PreferencesWindow} window
     */
    _refreshCustomLayoutsList(settings, window) {
        if (!this._customLayoutsBox) return;

        // Clear existing children
        let child = this._customLayoutsBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._customLayoutsBox.remove(child);
            child = next;
        }

        // Load custom layouts
        try {
            const customLayoutsJson = settings.get_string('custom-layouts');
            if (!customLayoutsJson || customLayoutsJson === '[]') {
                const emptyLabel = new Gtk.Label({
                    label: 'No custom layouts yet. Click "Create New Layout" to get started.',
                    css_classes: ['dim-label'],
                    wrap: true,
                    xalign: 0,
                    margin_top: 6,
                    margin_bottom: 6
                });
                this._customLayoutsBox.append(emptyLabel);
                return;
            }

            const customLayouts = JSON.parse(customLayoutsJson);
            const enabledLayouts = settings.get_strv('enabled-layouts');

            for (const layout of customLayouts) {
                const summary = getLayoutSummary(layout);

                const row = new Adw.ActionRow({
                    title: summary.name,
                    subtitle: `${summary.zoneCount} zone${summary.zoneCount !== 1 ? 's' : ''}`
                });

                // Enable toggle
                const toggle = new Gtk.Switch({
                    active: enabledLayouts.includes(layout.name),
                    valign: Gtk.Align.CENTER
                });

                toggle.connect('state-set', (widget, state) => {
                    let layouts = settings.get_strv('enabled-layouts');
                    if (state && !layouts.includes(layout.name)) {
                        layouts.push(layout.name);
                        settings.set_strv('enabled-layouts', layouts);
                    } else if (!state && layouts.includes(layout.name)) {
                        layouts = layouts.filter(id => id !== layout.name);
                        settings.set_strv('enabled-layouts', layouts);
                    }
                    return false;
                });

                row.add_suffix(toggle);

                // Edit button
                const editButton = new Gtk.Button({
                    icon_name: 'document-edit-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat']
                });
                editButton.connect('clicked', () => {
                    this._openLayoutEditor(window, settings, layout);
                });
                row.add_suffix(editButton);

                // Delete button
                const deleteButton = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat']
                });
                deleteButton.connect('clicked', () => {
                    this._deleteCustomLayout(settings, layout, window);
                });
                row.add_suffix(deleteButton);

                this._customLayoutsBox.append(row);
            }
        } catch (e) {
            log(`SnapKit Prefs: Error loading custom layouts: ${e.message}`);
        }
    }

    /**
     * Delete a custom layout
     * @param {Gio.Settings} settings
     * @param {object} layout
     * @param {Adw.PreferencesWindow} window
     */
    _deleteCustomLayout(settings, layout, window) {
        const dialog = new Adw.MessageDialog({
            heading: 'Delete Layout?',
            body: `Are you sure you want to delete "${layout.name}"?`,
            transient_for: window
        });

        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', (dlg, response) => {
            if (response === 'delete') {
                try {
                    const customLayoutsJson = settings.get_string('custom-layouts');
                    let customLayouts = JSON.parse(customLayoutsJson || '[]');

                    customLayouts = customLayouts.filter(l => l.name !== layout.name);
                    settings.set_string('custom-layouts', JSON.stringify(customLayouts));

                    // Remove from enabled layouts
                    let enabledLayouts = settings.get_strv('enabled-layouts');
                    enabledLayouts = enabledLayouts.filter(id => id !== layout.name);
                    settings.set_strv('enabled-layouts', enabledLayouts);
                } catch (e) {
                    log(`SnapKit Prefs: Error deleting layout: ${e.message}`);
                }
            }
        });

        dialog.present();
    }
}
