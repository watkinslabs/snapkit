import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * ZonePositioningOverlay - Shows the selected layout with zone highlighting during positioning
 */
export const ZonePositioningOverlay = GObject.registerClass({
}, class ZonePositioningOverlay extends St.Widget {
    _init(layout, currentZoneIndex, settings) {
        super._init({
            reactive: true,
            can_focus: false,
            track_hover: false,
            visible: false,
            opacity: 0
        });

        this._layout = layout;
        this._currentZoneIndex = currentZoneIndex;
        this._settings = settings;
        this._zoneWidgets = [];

        // Add to uiGroup
        Main.layoutManager.uiGroup.add_child(this);

        // Position fullscreen
        this._positionFullscreen();

        // Build UI
        this._buildUI();
    }

    _debug(message) {
        if (this._settings && this._settings.get_boolean('debug-mode')) {
            console.log(`SnapKit ZonePositioningOverlay: ${message}`);
        }
    }

    _positionFullscreen() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            return;
        }
        this.set_position(monitor.x, monitor.y);
        this.set_size(monitor.width, monitor.height);
    }

    _buildUI() {
        // Semi-transparent background (less opaque than window selector to show layout clearly)
        const background = new St.Bin({
            style_class: 'zone-positioning-background',
            reactive: true,
            x_expand: true,
            y_expand: true
        });
        background.set_style('background-color: rgba(0, 0, 0, 0.7);');
        this.add_child(background);

        // Main container
        const container = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
            style: 'padding-top: 80px;'
        });
        background.set_child(container);

        // Layout name label
        const layoutName = new St.Label({
            text: this._layout.name,
            style_class: 'zone-positioning-layout-name'
        });
        layoutName.set_style('font-size: 32pt; color: white; font-weight: bold; margin-bottom: 20px;');
        container.add_child(layoutName);

        // Zone preview container (larger than in overlay)
        const previewWidth = 600;
        const previewHeight = 400;

        const previewBox = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            style: `background-color: rgba(40, 40, 40, 0.95); border: 3px solid rgba(255, 255, 255, 0.4); border-radius: 16px; padding: 24px;`
        });
        container.add_child(previewBox);

        // Zone container
        const zoneContainer = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            width: previewWidth,
            height: previewHeight,
            reactive: false
        });
        previewBox.add_child(zoneContainer);

        // Create zone widgets
        for (let i = 0; i < this._layout.zones.length; i++) {
            const zone = this._layout.zones[i];
            const zoneWidget = this._createZoneWidget(zone, i);
            zoneContainer.add_child(zoneWidget);
            this._zoneWidgets.push({zone, widget: zoneWidget, index: i});
        }

        // Position zones when container is allocated
        zoneContainer.connect('notify::allocation', () => {
            const [containerWidth, containerHeight] = zoneContainer.get_size();
            if (containerWidth > 0 && containerHeight > 0) {
                this._positionZones(containerWidth, containerHeight);
            }
        });

        // Instruction label
        const instruction = new St.Label({
            text: `Positioning zone: ${this._layout.zones[this._currentZoneIndex].id || (this._currentZoneIndex + 1)}`,
            style_class: 'zone-positioning-instruction'
        });
        instruction.set_style('font-size: 18pt; color: rgba(255, 255, 255, 0.9); margin-top: 24px;');
        container.add_child(instruction);

        this._instructionLabel = instruction;
    }

    _createZoneWidget(zone, index) {
        const zoneWidget = new St.Bin({
            style_class: 'zone-positioning-zone',
            reactive: false
        });

        // Style based on whether this is the current zone
        if (index === this._currentZoneIndex) {
            // Current zone - bright highlight
            zoneWidget.set_style(`
                background-color: rgba(53, 132, 228, 0.7);
                border: 3px solid rgba(255, 255, 255, 0.9);
                border-radius: 8px;
                box-sizing: border-box;
            `);
        } else if (index < this._currentZoneIndex) {
            // Already filled zone - green tint
            zoneWidget.set_style(`
                background-color: rgba(38, 162, 105, 0.5);
                border: 2px solid rgba(255, 255, 255, 0.5);
                border-radius: 8px;
                box-sizing: border-box;
            `);
        } else {
            // Future zone - dim
            zoneWidget.set_style(`
                background-color: rgba(100, 100, 100, 0.3);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                box-sizing: border-box;
            `);
        }

        zoneWidget._zone = zone;
        zoneWidget._index = index;

        return zoneWidget;
    }

    _positionZones(containerWidth, containerHeight) {
        const borderWidth = 4;
        const zoneGap = 6;
        const usableWidth = containerWidth - borderWidth * 2;
        const usableHeight = containerHeight - borderWidth * 2;
        const borderOffset = borderWidth;

        for (let {zone, widget: zoneWidget} of this._zoneWidgets) {
            const x = borderOffset + Math.floor(zone.x * usableWidth);
            const y = borderOffset + Math.floor(zone.y * usableHeight);
            const width = Math.max(1, Math.floor(zone.width * usableWidth) - zoneGap);
            const height = Math.max(1, Math.floor(zone.height * usableHeight) - zoneGap);

            zoneWidget.set_position(x, y);
            zoneWidget.set_size(width, height);
        }
    }

    /**
     * Update to show the next zone as current
     */
    updateCurrentZone(newIndex) {
        this._debug(`Updating current zone to index ${newIndex}`);
        this._currentZoneIndex = newIndex;

        // Update zone widget styles
        for (let {widget: zoneWidget, index} of this._zoneWidgets) {
            if (index === this._currentZoneIndex) {
                // Current zone - bright highlight
                zoneWidget.set_style(`
                    background-color: rgba(53, 132, 228, 0.7);
                    border: 3px solid rgba(255, 255, 255, 0.9);
                    border-radius: 8px;
                    box-sizing: border-box;
                `);
            } else if (index < this._currentZoneIndex) {
                // Already filled zone - green tint
                zoneWidget.set_style(`
                    background-color: rgba(38, 162, 105, 0.5);
                    border: 2px solid rgba(255, 255, 255, 0.5);
                    border-radius: 8px;
                    box-sizing: border-box;
                `);
            } else {
                // Future zone - dim
                zoneWidget.set_style(`
                    background-color: rgba(100, 100, 100, 0.3);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 8px;
                    box-sizing: border-box;
                `);
            }
        }

        // Update instruction text
        if (this._instructionLabel && this._currentZoneIndex < this._layout.zones.length) {
            const zone = this._layout.zones[this._currentZoneIndex];
            this._instructionLabel.set_text(`Positioning zone: ${zone.id || (this._currentZoneIndex + 1)}`);
        }
    }

    show() {
        this.visible = true;
        this.opacity = 0;

        // Fade in animation
        this.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    }

    hide() {
        this.ease({
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.visible = false;
            }
        });
    }

    destroy() {
        Main.layoutManager.uiGroup.remove_child(this);
        super.destroy();
    }
});
