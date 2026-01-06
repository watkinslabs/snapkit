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

        // Zone Splitting - Visual feedback for zones too small for windows
        const zoneSplittingGroup = new Adw.PreferencesGroup({
            title: 'Zone Splitting',
            description: 'Visual feedback when zones are too small to contain windows'
        });

        zoneSplittingGroup.add(this._createColorRow(
            settings,
            'zone-too-small-color',
            'Warning Color',
            'Color for zones that are too small for windows'
        ));

        const minWidthRow = new Adw.ActionRow({
            title: 'Minimum Zone Width',
            subtitle: 'Zones narrower than this show warning color (px)'
        });
        const minWidthSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 50,
                upper: 500,
                step_increment: 10,
                value: settings.get_int('zone-min-width')
            }),
            valign: Gtk.Align.CENTER
        });
        minWidthSpin.connect('value-changed', (widget) => {
            settings.set_int('zone-min-width', widget.get_value());
        });
        minWidthRow.add_suffix(minWidthSpin);
        minWidthRow.activatable_widget = minWidthSpin;
        zoneSplittingGroup.add(minWidthRow);

        const minHeightRow = new Adw.ActionRow({
            title: 'Minimum Zone Height',
            subtitle: 'Zones shorter than this show warning color (px)'
        });
        const minHeightSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 50,
                upper: 500,
                step_increment: 10,
                value: settings.get_int('zone-min-height')
            }),
            valign: Gtk.Align.CENTER
        });
        minHeightSpin.connect('value-changed', (widget) => {
            settings.set_int('zone-min-height', widget.get_value());
        });
        minHeightRow.add_suffix(minHeightSpin);
        minHeightRow.activatable_widget = minHeightSpin;
        zoneSplittingGroup.add(minHeightRow);

        appearancePage.add(zoneSplittingGroup);

        // Snap Preview Appearance Group
        const snapPreviewAppearanceGroup = new Adw.PreferencesGroup({
            title: 'Snap Preview (Drag to Snap)',
            description: 'Visual appearance of the snap grid when dragging windows'
        });

        // Grid color
        snapPreviewAppearanceGroup.add(this._createColorRow(
            settings,
            'snap-preview-grid-color',
            'Grid Zone Color',
            'Background color of snap zones'
        ));

        // Grid border color
        snapPreviewAppearanceGroup.add(this._createColorRow(
            settings,
            'snap-preview-grid-border-color',
            'Grid Border Color',
            'Border color of snap zones'
        ));

        // Highlight color
        snapPreviewAppearanceGroup.add(this._createColorRow(
            settings,
            'snap-preview-highlight-color',
            'Highlight Color',
            'Color when window is over a zone'
        ));

        // Snap preview opacity slider
        const snapOpacityRow = new Adw.ActionRow({
            title: 'Preview Opacity',
            subtitle: 'Opacity of the snap preview grid'
        });
        const snapOpacityScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0.1,
                upper: 1.0,
                step_increment: 0.05,
                page_increment: 0.1
            }),
            digits: 2,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER
        });
        snapOpacityScale.set_value(settings.get_double('snap-preview-opacity'));
        snapOpacityScale.connect('value-changed', (scale) => {
            settings.set_double('snap-preview-opacity', scale.get_value());
        });
        snapOpacityRow.add_suffix(snapOpacityScale);
        snapPreviewAppearanceGroup.add(snapOpacityRow);

        // Zone split preview color
        snapPreviewAppearanceGroup.add(this._createColorRow(
            settings,
            'zone-split-preview-color',
            'Zone Split Preview',
            'Color shown when splitting a zone (drop on edges)'
        ));

        appearancePage.add(snapPreviewAppearanceGroup);

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

        // Default snap layout selection
        const snapLayoutRow = new Adw.ComboRow({
            title: 'Default Snap Layout',
            subtitle: 'Layout to use when dragging windows'
        });

        const snapLayoutModel = new Gtk.StringList();
        const snapLayoutIds = [];

        // Add all layout options (presets + custom)
        const allLayoutOptions = [
            {id: 'half-split', name: 'Half Split'},
            {id: 'quarters', name: 'Quarters'},
            {id: 'thirds-vertical', name: 'Thirds (Vertical)'},
            {id: 'thirds-horizontal', name: 'Thirds (Horizontal)'},
            {id: 'left-focus', name: 'Left Focus'},
            {id: 'right-focus', name: 'Right Focus'},
            {id: 'top-focus', name: 'Top Focus'},
            {id: 'bottom-focus', name: 'Bottom Focus'}
        ];

        // Add custom layouts
        try {
            const customLayoutsJson = settings.get_string('custom-layouts');
            if (customLayoutsJson && customLayoutsJson !== '[]') {
                const customLayouts = JSON.parse(customLayoutsJson);
                for (const layout of customLayouts) {
                    allLayoutOptions.push({id: layout.name, name: layout.name});
                }
            }
        } catch (e) {
            log(`SnapKit Prefs: Error loading custom layouts for snap preview: ${e.message}`);
        }

        for (const layout of allLayoutOptions) {
            snapLayoutModel.append(layout.name);
            snapLayoutIds.push(layout.id);
        }
        snapLayoutRow.set_model(snapLayoutModel);

        // Find current selection
        const currentSnapLayout = settings.get_string('snap-preview-layout');
        const currentIndex = snapLayoutIds.indexOf(currentSnapLayout);
        snapLayoutRow.set_selected(currentIndex >= 0 ? currentIndex : 0);

        snapLayoutRow.connect('notify::selected', (widget) => {
            const selectedId = snapLayoutIds[widget.selected];
            if (selectedId) {
                settings.set_string('snap-preview-layout', selectedId);
            }
        });
        snapPreviewGroup.add(snapLayoutRow);

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
            subtitle: 'Press this key while dragging to disable snap'
        });
        const disableKeyModel = new Gtk.StringList();
        disableKeyModel.append('Escape');
        disableKeyModel.append('Space');
        disableKeyRow.set_model(disableKeyModel);

        const currentDisableKey = settings.get_string('snap-disable-key');
        const disableKeyMap = {'escape': 0, 'space': 1};
        disableKeyRow.set_selected(disableKeyMap[currentDisableKey] ?? 0);

        disableKeyRow.connect('notify::selected', (widget) => {
            const keys = ['escape', 'space'];
            settings.set_string('snap-disable-key', keys[widget.selected]);
        });
        snapPreviewGroup.add(disableKeyRow);

        behaviorPage.add(snapPreviewGroup);

        // Shake to Dismiss Group
        const shakeGroup = new Adw.PreferencesGroup({
            title: 'Shake to Dismiss',
            description: 'Shake mouse left-right to dismiss snap grid during drag'
        });

        // Enable shake to dismiss
        const shakeEnabledRow = new Adw.ActionRow({
            title: 'Enable Shake to Dismiss',
            subtitle: 'Shake mouse rapidly to exit snap mode while dragging'
        });
        const shakeEnabledSwitch = new Gtk.Switch({
            active: settings.get_boolean('shake-to-dismiss-enabled'),
            valign: Gtk.Align.CENTER
        });
        settings.bind('shake-to-dismiss-enabled', shakeEnabledSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        shakeEnabledRow.add_suffix(shakeEnabledSwitch);
        shakeEnabledRow.activatable_widget = shakeEnabledSwitch;
        shakeGroup.add(shakeEnabledRow);

        // Shake threshold
        const shakeThresholdRow = new Adw.ActionRow({
            title: 'Direction Changes',
            subtitle: 'Number of left-right changes needed (lower = more sensitive)'
        });
        const shakeThresholdSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 2,
                upper: 6,
                step_increment: 1,
                value: settings.get_int('shake-threshold')
            }),
            valign: Gtk.Align.CENTER
        });
        shakeThresholdSpin.connect('value-changed', (widget) => {
            settings.set_int('shake-threshold', widget.get_value());
        });
        shakeThresholdRow.add_suffix(shakeThresholdSpin);
        shakeGroup.add(shakeThresholdRow);

        // Shake time window
        const shakeTimeRow = new Adw.ActionRow({
            title: 'Time Window (ms)',
            subtitle: 'Milliseconds within which shakes must occur'
        });
        const shakeTimeSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 200,
                upper: 1000,
                step_increment: 50,
                value: settings.get_int('shake-time-window')
            }),
            valign: Gtk.Align.CENTER
        });
        shakeTimeSpin.connect('value-changed', (widget) => {
            settings.set_int('shake-time-window', widget.get_value());
        });
        shakeTimeRow.add_suffix(shakeTimeSpin);
        shakeGroup.add(shakeTimeRow);

        // Shake minimum movement
        const shakeMovementRow = new Adw.ActionRow({
            title: 'Minimum Movement (px)',
            subtitle: 'Pixels of movement to count as a direction change'
        });
        const shakeMovementSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 100,
                step_increment: 5,
                value: settings.get_int('shake-min-movement')
            }),
            valign: Gtk.Align.CENTER
        });
        shakeMovementSpin.connect('value-changed', (widget) => {
            settings.set_int('shake-min-movement', widget.get_value());
        });
        shakeMovementRow.add_suffix(shakeMovementSpin);
        shakeGroup.add(shakeMovementRow);

        behaviorPage.add(shakeGroup);

        // Zone Split Group
        const zoneSplitGroup = new Adw.PreferencesGroup({
            title: 'Zone Splitting',
            description: 'Drop on zone edges to snap to half the zone'
        });

        // Enable zone splitting
        const zoneSplitEnabledRow = new Adw.ActionRow({
            title: 'Enable Zone Splitting',
            subtitle: 'Drop near edges to snap to half-zones'
        });
        const zoneSplitEnabledSwitch = new Gtk.Switch({
            active: settings.get_boolean('zone-split-enabled'),
            valign: Gtk.Align.CENTER
        });
        settings.bind('zone-split-enabled', zoneSplitEnabledSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        zoneSplitEnabledRow.add_suffix(zoneSplitEnabledSwitch);
        zoneSplitEnabledRow.activatable_widget = zoneSplitEnabledSwitch;
        zoneSplitGroup.add(zoneSplitEnabledRow);

        // Zone split threshold
        const zoneSplitThresholdRow = new Adw.ActionRow({
            title: 'Edge Threshold',
            subtitle: 'How close to edge to trigger split (% of zone)'
        });
        const zoneSplitThresholdScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0.15,
                upper: 0.45,
                step_increment: 0.05,
                page_increment: 0.1
            }),
            digits: 2,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER
        });
        zoneSplitThresholdScale.set_value(settings.get_double('zone-split-threshold'));
        zoneSplitThresholdScale.connect('value-changed', (scale) => {
            settings.set_double('zone-split-threshold', scale.get_value());
        });
        zoneSplitThresholdRow.add_suffix(zoneSplitThresholdScale);
        zoneSplitGroup.add(zoneSplitThresholdRow);

        behaviorPage.add(zoneSplitGroup);

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

        advancedPage.add(performanceGroup);

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
        const expander = new Adw.ExpanderRow({
            title: title,
            subtitle: subtitle
        });

        // Parse current color
        const colorString = settings.get_string(key);
        const rgba = new Gdk.RGBA();
        if (!rgba.parse(colorString)) {
            rgba.parse('rgba(0, 0, 0, 0.5)');
        }

        // Convert RGBA to HSV
        const rgbToHsv = (r, g, b) => {
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const d = max - min;
            let h = 0;
            const s = max === 0 ? 0 : d / max;
            const v = max;

            if (max !== min) {
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return [h * 360, s * 100, v * 100];
        };

        // Convert HSV to RGBA
        const hsvToRgb = (h, s, v) => {
            h = h / 360;
            s = s / 100;
            v = v / 100;

            let r, g, b;
            const i = Math.floor(h * 6);
            const f = h * 6 - i;
            const p = v * (1 - s);
            const q = v * (1 - f * s);
            const t = v * (1 - (1 - f) * s);

            switch (i % 6) {
                case 0: r = v; g = t; b = p; break;
                case 1: r = q; g = v; b = p; break;
                case 2: r = p; g = v; b = t; break;
                case 3: r = p; g = q; b = v; break;
                case 4: r = t; g = p; b = v; break;
                case 5: r = v; g = p; b = q; break;
            }
            return [r, g, b];
        };

        let [h, s, v] = rgbToHsv(rgba.red, rgba.green, rgba.blue);
        let alpha = rgba.alpha;

        // Color preview swatch
        const previewArea = new Gtk.DrawingArea({
            width_request: 32,
            height_request: 32,
            valign: Gtk.Align.CENTER
        });

        const updatePreview = () => {
            const [r, g, b] = hsvToRgb(h, s, v);
            previewArea.set_draw_func((area, cr, width, height) => {
                // Draw checkerboard for transparency
                const checkSize = 4;
                for (let y = 0; y < height; y += checkSize) {
                    for (let x = 0; x < width; x += checkSize) {
                        const isLight = ((x / checkSize) + (y / checkSize)) % 2 === 0;
                        cr.setSourceRGBA(isLight ? 0.8 : 0.6, isLight ? 0.8 : 0.6, isLight ? 0.8 : 0.6, 1);
                        cr.rectangle(x, y, checkSize, checkSize);
                        cr.fill();
                    }
                }
                // Draw color with alpha
                cr.setSourceRGBA(r, g, b, alpha);
                cr.rectangle(0, 0, width, height);
                cr.fill();
                // Border
                cr.setSourceRGBA(0.5, 0.5, 0.5, 1);
                cr.setLineWidth(1);
                cr.rectangle(0.5, 0.5, width - 1, height - 1);
                cr.stroke();
            });
            previewArea.queue_draw();
        };

        const saveColor = () => {
            const [r, g, b] = hsvToRgb(h, s, v);
            const colorStr = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha.toFixed(2)})`;
            settings.set_string(key, colorStr);
            updatePreview();
        };

        expander.add_suffix(previewArea);
        updatePreview();

        // Hue slider (0-360)
        const hueRow = new Adw.ActionRow({ title: 'Hue' });
        const hueScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 360, step_increment: 1, value: h }),
            digits: 0,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER
        });
        // Color gradient for hue
        hueScale.add_css_class('hue-slider');
        hueScale.connect('value-changed', (scale) => {
            h = scale.get_value();
            saveColor();
        });
        hueRow.add_suffix(hueScale);
        expander.add_row(hueRow);

        // Saturation slider (0-100)
        const satRow = new Adw.ActionRow({ title: 'Saturation' });
        const satScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 1, value: s }),
            digits: 0,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER
        });
        satScale.connect('value-changed', (scale) => {
            s = scale.get_value();
            saveColor();
        });
        satRow.add_suffix(satScale);
        expander.add_row(satRow);

        // Brightness/Value slider (0-100)
        const valRow = new Adw.ActionRow({ title: 'Brightness' });
        const valScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 1, value: v }),
            digits: 0,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER
        });
        valScale.connect('value-changed', (scale) => {
            v = scale.get_value();
            saveColor();
        });
        valRow.add_suffix(valScale);
        expander.add_row(valRow);

        // Alpha/Opacity slider (0-100)
        const alphaRow = new Adw.ActionRow({ title: 'Opacity' });
        const alphaScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 1, value: alpha * 100 }),
            digits: 0,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER
        });
        alphaScale.connect('value-changed', (scale) => {
            alpha = scale.get_value() / 100;
            saveColor();
        });
        alphaRow.add_suffix(alphaScale);
        expander.add_row(alphaRow);

        // Hex input row
        const hexRow = new Adw.ActionRow({ title: 'Hex Color' });
        const hexEntry = new Gtk.Entry({
            valign: Gtk.Align.CENTER,
            width_chars: 9,
            max_length: 9,
            placeholder_text: '#RRGGBBAA'
        });

        const updateHexEntry = () => {
            const [r, g, b] = hsvToRgb(h, s, v);
            const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
            hexEntry.set_text(`#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(alpha)}`);
        };
        updateHexEntry();

        hexEntry.connect('activate', (entry) => {
            const hex = entry.get_text().trim();
            const match = hex.match(/^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?$/);
            if (match) {
                const r = parseInt(match[1], 16) / 255;
                const g = parseInt(match[2], 16) / 255;
                const b = parseInt(match[3], 16) / 255;
                const a = match[4] ? parseInt(match[4], 16) / 255 : alpha;

                [h, s, v] = rgbToHsv(r, g, b);
                alpha = a;

                hueScale.set_value(h);
                satScale.set_value(s);
                valScale.set_value(v);
                alphaScale.set_value(alpha * 100);
                saveColor();
                updateHexEntry();
            }
        });

        // Update hex when sliders change
        const origSave = saveColor;
        const wrappedSaveColor = () => {
            origSave();
            updateHexEntry();
        };
        hueScale.connect('value-changed', updateHexEntry);
        satScale.connect('value-changed', updateHexEntry);
        valScale.connect('value-changed', updateHexEntry);
        alphaScale.connect('value-changed', updateHexEntry);

        hexRow.add_suffix(hexEntry);
        expander.add_row(hexRow);

        return expander;
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
