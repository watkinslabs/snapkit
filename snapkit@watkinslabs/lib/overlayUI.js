import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { isFullSpecLayout } from './layoutValidator.js';

/**
 * Extract zones with normalized coordinates for display purposes.
 * Works with both simple format (zones array) and full-spec format (root tree).
 * Does NOT modify the layout - just reads it.
 * @param {object} layout
 * @returns {Array<{id: string, x: number, y: number, width: number, height: number}>}
 */
function getZonesForDisplay(layout) {
    if (!layout) return [];

    // Simple format - already has zones array with normalized coords
    if (!isFullSpecLayout(layout)) {
        return layout.zones || [];
    }

    // Full-spec format - traverse tree to extract leaf positions
    const zones = [];
    traverseForZones(layout.root, 0, 0, 1, 1, zones);
    return zones;
}

/**
 * Recursively traverse the layout tree to extract zone positions.
 * Calculates normalized (0-1) coordinates for each leaf.
 * @param {object} node - Current node in tree
 * @param {number} x - Current x position (0-1)
 * @param {number} y - Current y position (0-1)
 * @param {number} width - Current width (0-1)
 * @param {number} height - Current height (0-1)
 * @param {Array} zones - Output array (mutated)
 */
function traverseForZones(node, x, y, width, height, zones) {
    if (!node) return;

    if (node.type === 'leaf') {
        zones.push({
            id: node.id,
            x: x,
            y: y,
            width: width,
            height: height
        });
        return;
    }

    if (node.type === 'split' && node.children && node.children.length > 0) {
        const isRow = node.dir === 'row'; // row = horizontal split (children stack vertically)
        const isCol = node.dir === 'col'; // col = vertical split (children side by side)

        // Calculate sizes for children
        // First, collect size specs and identify which have explicit sizes
        const childSizes = [];
        let totalFrac = 0;
        let fracCount = 0;

        for (const child of node.children) {
            if (child.size && child.size.kind === 'frac' && child.size.value) {
                childSizes.push({ frac: child.size.value });
                totalFrac += child.size.value;
                fracCount++;
            } else {
                // Default: equal distribution
                childSizes.push({ frac: null });
                fracCount++;
            }
        }

        // Normalize fractions - if no explicit fracs, distribute equally
        const numChildren = node.children.length;
        let normalizedSizes = [];

        if (totalFrac > 0) {
            // Some children have explicit fracs - fill in the rest
            let remainingFrac = 1.0;
            let unspecifiedCount = 0;

            for (const cs of childSizes) {
                if (cs.frac !== null) {
                    remainingFrac -= cs.frac / totalFrac;
                } else {
                    unspecifiedCount++;
                }
            }

            // Distribute remaining to unspecified (or if all specified, normalize)
            for (const cs of childSizes) {
                if (cs.frac !== null) {
                    normalizedSizes.push(cs.frac / totalFrac);
                } else if (unspecifiedCount > 0) {
                    normalizedSizes.push(remainingFrac / unspecifiedCount);
                } else {
                    normalizedSizes.push(1 / numChildren);
                }
            }
        } else {
            // No explicit fracs - equal distribution
            for (let i = 0; i < numChildren; i++) {
                normalizedSizes.push(1 / numChildren);
            }
        }

        // Traverse children with calculated positions
        let offset = 0;
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const size = normalizedSizes[i];

            let childX, childY, childW, childH;

            if (isCol) {
                // Columns: children are side by side horizontally
                childX = x + offset * width;
                childY = y;
                childW = size * width;
                childH = height;
                offset += size;
            } else {
                // Rows: children stack vertically
                childX = x;
                childY = y + offset * height;
                childW = width;
                childH = size * height;
                offset += size;
            }

            traverseForZones(child, childX, childY, childW, childH, zones);
        }
    }
}

/**
 * LayoutOverlay - Full-screen overlay displaying snap layout grid
 */
export const LayoutOverlay = GObject.registerClass({
    Signals: {
        'zone-selected': {param_types: [GObject.TYPE_STRING, GObject.TYPE_JSOBJECT]}
    }
}, class LayoutOverlay extends St.BoxLayout {
    _init(layoutManager, settings) {
        super._init({
            style_class: 'snapkit-overlay',
            vertical: false,
            reactive: true,
            visible: false,
            opacity: 0,
            clip_to_allocation: true
        });

        this._layoutManager = layoutManager;
        this._settings = settings;
        this._layoutWidgets = [];
        this._selectedZone = null;
        this._hoveredLayout = null;
        this._hoveredZone = null;
        this._currentMonitor = Main.layoutManager.primaryMonitor;

        // Add as TOP chrome to ensure it's always above all windows including maximized
        Main.layoutManager.addTopChrome(this, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen: false
        });
        this._positionOverlay(this._currentMonitor);

        // Build the layout grid
        this._buildLayoutGrid();

        // Connect to monitor changes
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._currentMonitor = Main.layoutManager.primaryMonitor;
            this._positionOverlay(this._currentMonitor);
        });

        // Connect to settings changes
        this._settingsChangedId = this._settings.connect('changed',
            this._onSettingsChanged.bind(this));

        // Connect right-click to open preferences
        this.connect('button-press-event', this._onButtonPress.bind(this));
    }

    _sanitizeColor(colorString) {
        // Validate RGBA/RGB color format to prevent CSS injection
        const rgbaRegex = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/;
        if (!rgbaRegex.test(colorString)) {
            this._debug(`Invalid color format: ${colorString}, using fallback`);
            return 'rgba(100, 100, 100, 0.5)';
        }
        return colorString;
    }

    _debug(message) {
        try {
            if (this._settings && this._settings.get_boolean('debug-mode')) {
                log(`SnapKit: ${message}`);
            }
        } catch (e) {
            // Silently fail to avoid recursion
        }
    }

    _onButtonPress(actor, event) {
        const button = event.get_button();
        this._debug(`Overlay _onButtonPress: button=${button}`);

        // Right-click (button 3) opens preferences
        if (button === 3) {
            this._debug('Right-click detected, opening preferences');
            try {
                // Use gnome-extensions to open preferences
                const proc = Gio.Subprocess.new(
                    ['gnome-extensions', 'prefs', 'snapkit@watkinslabs'],
                    Gio.SubprocessFlags.NONE
                );
                return Clutter.EVENT_STOP;
            } catch (e) {
                this._debug(`Failed to open preferences: ${e.message}`);
                Main.notify('SnapKit', 'Failed to open preferences');
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _positionOverlay(monitor) {
        if (!monitor) {
            monitor = Main.layoutManager.primaryMonitor;
        }
        this._currentMonitor = monitor;

        // Make overlay a compact strip at the trigger edge
        const triggerEdge = this._settings.get_string('trigger-edge');
        let stripSize = this._settings.get_int('overlay-strip-size');

        // Get overlay scale
        let scale = 1.0;
        try {
            scale = this._settings.get_double('overlay-scale');
            if (scale <= 0) scale = 1.0;
        } catch (e) {
            this._debug(`Failed to get overlay-scale: ${e.message}`);
            scale = 1.0;
        }

        // Apply scale to strip size
        stripSize = Math.floor(stripSize * scale);

        // Calculate total content dimensions based on scale
        const layoutWidth = Math.floor(160 * scale);
        // Reduce height when layout names are hidden (no title row)
        const showLayoutNames = this._settings.get_boolean('show-layout-names');
        const layoutHeight = Math.floor((showLayoutNames ? 140 : 115) * scale);
        const layoutMargin = Math.floor(10 * scale); // margin on each side
        const layoutPadding = Math.floor(8 * scale); // internal padding
        const containerSpacing = Math.floor(this._settings.get_int('layout-spacing') * scale); // spacing between layouts

        // Get number of enabled layouts
        const numLayouts = this._layoutManager.getEnabledLayouts().length;

        // Calculate total size needed for all layouts
        // Orientation depends on trigger edge: horizontal for top/bottom, vertical for left/right
        let totalContentWidth, totalContentHeight;
        if (triggerEdge === 'left' || triggerEdge === 'right') {
            // Vertical layout (column) - layouts stacked vertically
            totalContentWidth = layoutWidth + layoutMargin * 2;
            totalContentHeight = (layoutHeight + layoutMargin * 2) * numLayouts + containerSpacing * (numLayouts - 1);
        } else {
            // Horizontal layout (row) - layouts side by side
            totalContentWidth = (layoutWidth + layoutMargin * 2) * numLayouts + containerSpacing * (numLayouts - 1);
            totalContentHeight = layoutHeight + layoutMargin * 2;
        }

        // Add padding to prevent going off screen
        const screenPadding = 40;
        const maxWidth = monitor.width - screenPadding * 2;
        const maxHeight = monitor.height - screenPadding * 2;

        let x, y, width, height;

        switch (triggerEdge) {
            case 'top':
                // Width based on content (clamped to max), height from strip size
                width = Math.min(totalContentWidth, maxWidth);
                height = Math.min(stripSize, maxHeight);
                x = monitor.x + (monitor.width - width) / 2; // Centered horizontally
                y = monitor.y;
                break;
            case 'bottom':
                width = Math.min(totalContentWidth, maxWidth);
                height = Math.min(stripSize, maxHeight);
                x = monitor.x + (monitor.width - width) / 2; // Centered horizontally
                y = monitor.y + monitor.height - height;
                break;
            case 'left':
                // Width from strip size, height based on content
                width = Math.min(stripSize, maxWidth);
                height = Math.min(totalContentHeight, maxHeight);
                x = monitor.x;
                y = monitor.y + (monitor.height - height) / 2; // Centered vertically
                break;
            case 'right':
                width = Math.min(stripSize, maxWidth);
                height = Math.min(totalContentHeight, maxHeight);
                x = monitor.x + monitor.width - width;
                y = monitor.y + (monitor.height - height) / 2; // Centered vertically
                break;
            default:
                width = Math.min(totalContentWidth, maxWidth);
                height = Math.min(stripSize, maxHeight);
                x = monitor.x + (monitor.width - width) / 2;
                y = monitor.y;
        }

        this.set_position(x, y);
        this.set_size(width, height);
    }

    updateMonitor(monitor) {
        if (monitor && monitor !== this._currentMonitor) {
            this._positionOverlay(monitor);
        }
    }

    _buildLayoutGrid() {
        // Clear existing widgets
        this.destroy_all_children();
        this._layoutWidgets = [];

        // Get overlay scale for spacing
        let scale = 1.0;
        try {
            scale = this._settings.get_double('overlay-scale');
            if (scale <= 0) scale = 1.0;
        } catch (e) {
            scale = 1.0;
        }
        const containerSpacing = Math.floor(this._settings.get_int('layout-spacing') * scale);

        // Determine orientation based on trigger edge
        const triggerEdge = this._settings.get_string('trigger-edge');
        const isVertical = (triggerEdge === 'left' || triggerEdge === 'right');

        // Create container for layouts - clip content to container bounds
        const container = new St.BoxLayout({
            style_class: 'snapkit-layout-container',
            vertical: isVertical,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true
        });
        // Apply scaled spacing
        container.set_style(`spacing: ${containerSpacing}px; padding: 0px;`);

        // Get enabled layouts
        const layouts = this._layoutManager.getEnabledLayouts();

        // Create widget for each layout
        for (let i = 0; i < layouts.length; i++) {
            const layout = layouts[i];
            const layoutWidget = this._createLayoutWidget(layout);

            container.add_child(layoutWidget);
            this._layoutWidgets.push({layout, widget: layoutWidget});
        }

        this.add_child(container);

        // Apply settings-based styling
        this._applySettings();
    }

    _createLayoutWidget(layout) {
        // Get overlay scale
        let scale = 1.0;
        try {
            scale = this._settings.get_double('overlay-scale');
            if (scale <= 0) scale = 1.0;
        } catch (e) {
            scale = 1.0;
        }

        // Apply scale to dimensions
        const layoutWidth = Math.floor(160 * scale);
        // Reduce height when layout names are hidden (no title row)
        const showLayoutNames = this._settings.get_boolean('show-layout-names');
        const layoutHeight = Math.floor((showLayoutNames ? 140 : 115) * scale);
        const zoneWidth = Math.floor(140 * scale);
        const zoneHeight = Math.floor(100 * scale);
        const fontSize = Math.floor(11 * scale);
        const padding = Math.floor(4 * scale);
        const margin = Math.floor(10 * scale);
        const layoutPadding = Math.floor(8 * scale);
        const borderRadius = Math.floor(12 * scale);
        const zoneBorderWidth = Math.max(1, Math.floor(2 * scale));
        const zoneGap = Math.max(1, Math.floor(2 * scale));

        // Container for the layout preview
        const layoutBox = new St.BoxLayout({
            style_class: 'snapkit-layout-item',
            vertical: true,
            reactive: true,
            track_hover: true,
            width: layoutWidth,
            height: layoutHeight
        });
        // Apply scaled margin
        layoutBox.set_style(`margin: ${margin}px; padding: ${layoutPadding}px; border-radius: ${borderRadius}px;`);

        // Layout name label (only add if setting is enabled)
        if (showLayoutNames) {
            const nameLabel = new St.Label({
                text: layout.name,
                style_class: 'snapkit-layout-name',
                x_align: Clutter.ActorAlign.CENTER,
                style: `font-size: ${fontSize}px; padding: ${padding}px;`
            });
            layoutBox.add_child(nameLabel);
        }

        // Zone preview container (shows the window divisions)
        const zoneContainer = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            width: zoneWidth,
            height: zoneHeight,
            reactive: false  // Don't capture events - let layoutBox handle motion
        });

        // Create zone widgets - supports both simple and full-spec layouts
        const zoneWidgets = [];
        const zones = getZonesForDisplay(layout);
        if (zones.length === 0) {
            this._debug(`Layout ${layout.name || layout.id} has no zones`);
        }
        for (let zone of zones) {
            const zoneWidget = this._createZoneWidget(zone, layout);
            zoneContainer.add_child(zoneWidget);
            zoneWidgets.push({zone, widget: zoneWidget});
        }

        layoutBox.add_child(zoneContainer);

        // Store zone widgets for later reference
        layoutBox._zoneContainer = zoneContainer;
        layoutBox._zoneWidgets = zoneWidgets;
        layoutBox._zones = zones; // Store zones array to avoid recreating objects
        layoutBox._layout = layout;
        layoutBox._scale = scale; // Store scale for zone positioning

        // Update zone positions when container is allocated
        zoneContainer.connect('notify::allocation', () => {
            const [containerWidth, containerHeight] = zoneContainer.get_size();
            if (containerWidth > 0 && containerHeight > 0) {
                // Use scaled values for border calculations
                const scaledBorderWidth = zoneBorderWidth * 2; // border on each side
                const usableWidth = containerWidth - scaledBorderWidth;
                const usableHeight = containerHeight - scaledBorderWidth;
                const borderOffset = zoneBorderWidth;

                for (let {zone, widget: zoneWidget} of zoneWidgets) {
                    // Calculate positions within the usable area
                    const x = borderOffset + Math.floor(zone.x * usableWidth);
                    const y = borderOffset + Math.floor(zone.y * usableHeight);
                    // Subtract gap to prevent zones from overlapping/overflowing
                    const width = Math.max(1, Math.floor(zone.width * usableWidth) - zoneGap);
                    const height = Math.max(1, Math.floor(zone.height * usableHeight) - zoneGap);

                    zoneWidget.set_position(x, y);
                    zoneWidget.set_size(width, height);
                }
            }
        });

        // Connect hover events
        layoutBox.connect('enter-event', () => {
            this._onLayoutEnter(layoutBox);
        });

        layoutBox.connect('leave-event', () => {
            this._onLayoutLeave(layoutBox);
        });

        layoutBox.connect('motion-event', (actor, event) => {
            this._onLayoutMotion(layoutBox, event);
            return Clutter.EVENT_PROPAGATE;
        });

        layoutBox.connect('button-press-event', (actor, event) => {
            this._debug(`layoutBox button-press-event: layout=${layout.name || layout.id}`);
            this._onLayoutClick(layoutBox);
            return Clutter.EVENT_STOP;
        });

        return layoutBox;
    }

    _createZoneWidget(zone, layout) {
        const zoneWidget = new St.Bin({
            style_class: 'snapkit-zone',
            reactive: false,  // Don't capture events - let layoutBox handle motion
            track_hover: false
        });

        zoneWidget._zone = zone;
        zoneWidget._layout = layout;

        return zoneWidget;
    }

    _onLayoutEnter(layoutBox) {
        this._hoveredLayout = layoutBox._layout;
    }

    _onLayoutLeave(layoutBox) {
        if (this._hoveredLayout === layoutBox._layout) {
            this._hoveredLayout = null;
        }

        // Clear zone highlight
        this._clearZoneHighlight();
    }

    _onLayoutMotion(layoutBox, event) {
        // Get mouse position relative to zone container
        const zoneContainer = layoutBox._zoneContainer;
        const [x, y] = event.get_coords();
        const [containerX, containerY] = zoneContainer.get_transformed_position();
        const [containerWidth, containerHeight] = zoneContainer.get_size();

        if (containerWidth <= 0 || containerHeight <= 0) {
            return;
        }

        const relX = (x - containerX) / containerWidth;
        const relY = (y - containerY) / containerHeight;

        // Find which zone the mouse is over using stored zones (normalized coords)
        let foundZone = null;
        const zones = layoutBox._zones || [];

        for (const zone of zones) {
            if (relX >= zone.x && relX < zone.x + zone.width &&
                relY >= zone.y && relY < zone.y + zone.height) {
                foundZone = zone;
                break;
            }
        }

        // Compare by ID to handle both simple and full-spec layouts
        const hoveredId = this._hoveredZone?.id ?? null;
        const foundId = foundZone?.id ?? null;

        if (foundId !== hoveredId) {
            this._hoveredZone = foundZone;
            this._debug(`Hovered zone changed to: ${foundZone ? foundZone.id : 'none'} (relX=${relX.toFixed(2)}, relY=${relY.toFixed(2)})`);
            this._updateZoneHighlight(layoutBox, foundZone);
        }
    }

    _onLayoutClick(layoutBox, event) {
        this._debug(`_onLayoutClick called`);
        try {
            // Calculate zone at click time (don't rely on cached _hoveredZone which may be stale)
            const zoneContainer = layoutBox._zoneContainer;
            const [x, y] = global.get_pointer();
            const [containerX, containerY] = zoneContainer.get_transformed_position();
            const [containerWidth, containerHeight] = zoneContainer.get_size();

            this._debug(`Click: pointer=(${x}, ${y}), container=(${containerX}, ${containerY}), size=(${containerWidth}x${containerHeight})`);

            let zone = null;
            if (containerWidth > 0 && containerHeight > 0) {
                const relX = (x - containerX) / containerWidth;
                const relY = (y - containerY) / containerHeight;

                this._debug(`Click at relX=${relX.toFixed(3)}, relY=${relY.toFixed(3)}`);

                const zones = layoutBox._zones || [];
                this._debug(`Layout has ${zones.length} zones:`);
                for (const z of zones) {
                    const inZone = relX >= z.x && relX < z.x + z.width &&
                                   relY >= z.y && relY < z.y + z.height;
                    this._debug(`  Zone ${z.id}: x=${z.x}, y=${z.y}, w=${z.width}, h=${z.height} -> ${inZone ? 'HIT' : 'miss'}`);
                    if (inZone && !zone) {
                        zone = z;
                    }
                }
            }

            // Fall back to first zone if none found
            if (!zone) {
                const zones = layoutBox._zones || [];
                zone = zones[0];
                this._debug(`No zone at click position, using first zone: ${zone ? zone.id : 'none'}`);
            }

            if (zone) {
                const layoutId = this._layoutManager.getLayoutId(layoutBox._layout);
                this._debug(`Emitting zone-selected for layout ${layoutId}, zone ${zone.id}`);
                this.emit('zone-selected', layoutId, zone);
            } else {
                this._debug(`ERROR: Layout has no zones`);
            }
        } catch (e) {
            log(`SnapKit OverlayUI: Error in _onLayoutClick: ${e.message}\n${e.stack}`);
        }
    }

    _updateZoneHighlight(layoutBox, zone) {
        // Clear previous highlights
        this._clearZoneHighlight();

        if (!zone) return;

        // Find and highlight the zone widget by ID
        for (let {zone: z, widget} of layoutBox._zoneWidgets) {
            if (z.id === zone.id) {
                const highlightColor = this._sanitizeColor(
                    this._settings.get_string('overlay-highlight-color')
                );
                // Save original style before overwriting
                if (!widget._originalStyle) {
                    widget._originalStyle = widget.get_style();
                }
                widget.set_style(`background-color: ${highlightColor}; border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 4px; box-sizing: border-box; margin: 2px;`);
                break;
            }
        }
    }

    _clearZoneHighlight() {
        for (let {widget: layoutWidget} of this._layoutWidgets) {
            for (let {widget: zoneWidget} of layoutWidget._zoneWidgets) {
                // Restore original style if saved
                if (zoneWidget._originalStyle) {
                    zoneWidget.set_style(zoneWidget._originalStyle);
                } else {
                    zoneWidget.set_style('');
                }
            }
        }
        this._hoveredZone = null;
    }

    _applySettings() {
        // Apply background (solid or gradient)
        const bgType = this._settings.get_string('overlay-background-type');
        const bgColor = this._sanitizeColor(
            this._settings.get_string('overlay-background-color')
        );
        const bgColorEnd = this._sanitizeColor(
            this._settings.get_string('overlay-background-color-end')
        );

        // Determine border radius based on trigger edge (round corners not touching edge)
        const triggerEdge = this._settings.get_string('trigger-edge');
        let borderRadius;
        switch (triggerEdge) {
            case 'top':
                borderRadius = '0 0 12px 12px'; // Round bottom corners
                break;
            case 'bottom':
                borderRadius = '12px 12px 0 0'; // Round top corners
                break;
            case 'left':
                borderRadius = '0 12px 12px 0'; // Round right corners
                break;
            case 'right':
                borderRadius = '12px 0 0 12px'; // Round left corners
                break;
            default:
                borderRadius = '0 0 12px 12px';
        }

        let backgroundStyle;
        switch (bgType) {
            case 'gradient-vertical':
                // St toolkit uses different gradient syntax
                backgroundStyle = `background-gradient-direction: vertical; background-gradient-start: ${bgColor}; background-gradient-end: ${bgColorEnd}; border-radius: ${borderRadius};`;
                break;
            case 'gradient-horizontal':
                backgroundStyle = `background-gradient-direction: horizontal; background-gradient-start: ${bgColor}; background-gradient-end: ${bgColorEnd}; border-radius: ${borderRadius};`;
                break;
            case 'gradient-radial':
                // St doesn't support radial gradients natively, fall back to vertical gradient
                this._debug('Radial gradients not supported in St toolkit, using vertical gradient instead');
                backgroundStyle = `background-gradient-direction: vertical; background-gradient-start: ${bgColor}; background-gradient-end: ${bgColorEnd}; border-radius: ${borderRadius};`;
                break;
            default: // solid
                backgroundStyle = `background-color: ${bgColor}; border-radius: ${borderRadius};`;
        }

        this.set_style(backgroundStyle);

        // Apply custom colors to layout cards and zones
        this._applyCustomColors();

        // Update zone positions after layout
        this.connect('notify::mapped', () => {
            if (this.mapped) {
                this._updateZonePositions();
            }
        });
    }

    _applyCustomColors() {
        const layoutCardBg = this._sanitizeColor(
            this._settings.get_string('layout-card-background')
        );
        const layoutCardBorder = this._sanitizeColor(
            this._settings.get_string('layout-card-border')
        );
        const zoneBg = this._sanitizeColor(
            this._settings.get_string('zone-background')
        );
        const zoneBorder = this._sanitizeColor(
            this._settings.get_string('zone-border')
        );
        const gridColor = this._sanitizeColor(
            this._settings.get_string('overlay-grid-color')
        );
        const zoneTooSmallColor = this._sanitizeColor(
            this._settings.get_string('zone-too-small-color')
        );

        // Get minimum zone size settings
        const minZoneWidth = this._settings.get_int('zone-min-width');
        const minZoneHeight = this._settings.get_int('zone-min-height');

        // Get work area for the current monitor to calculate actual zone sizes
        let workArea = null;
        if (this._currentMonitor) {
            workArea = Main.layoutManager.getWorkAreaForMonitor(this._currentMonitor.index);
        }

        // Get scale for proper sizing
        let scale = 1.0;
        try {
            scale = this._settings.get_double('overlay-scale');
            if (scale <= 0) scale = 1.0;
        } catch (e) {
            scale = 1.0;
        }

        const borderWidth = Math.max(1, Math.floor(2 * scale));
        const borderRadius = Math.floor(12 * scale);
        const padding = Math.floor(8 * scale);
        const margin = Math.floor(10 * scale);
        const zoneBorderRadius = Math.floor(4 * scale);
        const zoneContainerRadius = Math.floor(8 * scale);
        const zoneMargin = Math.max(1, Math.floor(2 * scale));

        for (let {widget: layoutWidget} of this._layoutWidgets) {
            // Apply card styling with scaled values
            layoutWidget.set_style(`background-color: ${layoutCardBg}; border: ${borderWidth}px solid ${layoutCardBorder}; border-radius: ${borderRadius}px; padding: ${padding}px; margin: ${margin}px;`);

            // Apply zone container styling
            const zoneContainer = layoutWidget._zoneContainer;
            if (zoneContainer) {
                zoneContainer.set_style(`border: ${borderWidth}px solid ${gridColor}; border-radius: ${zoneContainerRadius}px; background-color: ${layoutCardBg};`);
            }

            // Apply zone styling - check if zone is too small
            for (let {zone, widget: zoneWidget} of layoutWidget._zoneWidgets) {
                let bgColor = zoneBg;

                // Check if zone would be too small on the actual monitor
                if (workArea && zone) {
                    const actualWidth = Math.round(zone.width * workArea.width);
                    const actualHeight = Math.round(zone.height * workArea.height);

                    if (actualWidth < minZoneWidth || actualHeight < minZoneHeight) {
                        bgColor = zoneTooSmallColor;
                    }
                }

                zoneWidget.set_style(`background-color: ${bgColor}; border: 1px solid ${zoneBorder}; border-radius: ${zoneBorderRadius}px; box-sizing: border-box; margin: ${zoneMargin}px;`);
            }
        }
    }

    _updateZonePositions() {
        // Get scale for proper sizing
        let scale = 1.0;
        try {
            scale = this._settings.get_double('overlay-scale');
            if (scale <= 0) scale = 1.0;
        } catch (e) {
            scale = 1.0;
        }

        const zoneBorderWidth = Math.max(1, Math.floor(2 * scale));
        const zoneGap = Math.max(1, Math.floor(2 * scale));

        for (let {widget: layoutWidget} of this._layoutWidgets) {
            const zoneContainer = layoutWidget._zoneContainer;
            const [containerWidth, containerHeight] = zoneContainer.get_size();

            // Skip if container not sized yet
            if (containerWidth === 0 || containerHeight === 0) {
                continue;
            }

            // Use scaled values for border calculations
            const scaledBorderWidth = zoneBorderWidth * 2;
            const usableWidth = containerWidth - scaledBorderWidth;
            const usableHeight = containerHeight - scaledBorderWidth;
            const borderOffset = zoneBorderWidth;

            for (let {zone, widget: zoneWidget} of layoutWidget._zoneWidgets) {
                // Calculate positions within the usable area
                const x = borderOffset + Math.floor(zone.x * usableWidth);
                const y = borderOffset + Math.floor(zone.y * usableHeight);
                // Subtract gap to prevent zones from overlapping/overflowing
                const width = Math.max(1, Math.floor(zone.width * usableWidth) - zoneGap);
                const height = Math.max(1, Math.floor(zone.height * usableHeight) - zoneGap);

                zoneWidget.set_position(x, y);
                zoneWidget.set_size(width, height);
            }
        }
    }

    _onSettingsChanged(settings, key) {
        if (key === 'enabled-layouts' || key === 'trigger-edge' || key === 'show-layout-names' || key === 'overlay-scale' || key === 'layout-spacing') {
            // Rebuild grid with new layouts, alignment, scale, or spacing
            this._buildLayoutGrid();
            // Also reposition overlay when scale, layout names visibility, spacing, or trigger edge changes
            if (key === 'overlay-scale' || key === 'show-layout-names' || key === 'layout-spacing' || key === 'trigger-edge') {
                this._positionOverlay(this._currentMonitor);
            }
        } else if (key === 'trigger-zone-height') {
            // If we're showing trigger zone, update it
            if (this.visible && this.get_children().every(child => !child.visible)) {
                this.showHitbox(this._currentMonitor);
            }
        } else if (key.startsWith('overlay-')) {
            // Update visual settings
            this._applySettings();
        } else if (key.startsWith('layout-card-') || key.startsWith('zone-')) {
            // Update colors
            this._applyCustomColors();
        }
    }

    showHitbox(monitor) {
        this._debug('=== SHOW HITBOX START ===');
        this._debug('showHitbox called');

        try {
            // Stop any ongoing animations to prevent color interpolation
            this.remove_all_transitions();

            if (!monitor) {
                monitor = Main.layoutManager.primaryMonitor;
            }
            this._currentMonitor = monitor;

            const triggerEdge = this._settings.get_string('trigger-edge') || 'top';
            const triggerZoneHeight = this._settings.get_int('trigger-zone-height') || 10;
            this._debug(`Trigger edge: ${triggerEdge}, height: ${triggerZoneHeight}`);
        
        // Calculate content width to match open state
        let scale = 1.0;
        try {
            scale = this._settings.get_double('overlay-scale');
            if (scale <= 0) scale = 1.0;
        } catch (e) {
            scale = 1.0;
        }
        
        const layoutWidth = Math.floor(160 * scale);
        const showLayoutNames = this._settings.get_boolean('show-layout-names');
        const layoutHeight = Math.floor((showLayoutNames ? 140 : 115) * scale);
        const layoutMargin = Math.floor(10 * scale);
        const containerSpacing = Math.floor(this._settings.get_int('layout-spacing') * scale);
        const numLayouts = this._layoutManager.getEnabledLayouts().length;

        // Calculate total size based on orientation (same logic as _positionOverlay)
        let totalContentWidth, totalContentHeight;
        if (triggerEdge === 'left' || triggerEdge === 'right') {
            // Vertical layout (column) - layouts stacked vertically
            totalContentWidth = layoutWidth + layoutMargin * 2;
            totalContentHeight = (layoutHeight + layoutMargin * 2) * numLayouts + containerSpacing * (numLayouts - 1);
        } else {
            // Horizontal layout (row) - layouts side by side
            totalContentWidth = (layoutWidth + layoutMargin * 2) * numLayouts + containerSpacing * (numLayouts - 1);
            totalContentHeight = layoutHeight + layoutMargin * 2;
        }
        
        const screenPadding = 40;
        const maxWidth = monitor.width - screenPadding * 2;
        const maxHeight = monitor.height - screenPadding * 2;
        
        let x, y, width, height;
        let startX, startY; // Starting position for slide-in animation
        let borderRadius = '';

        switch (triggerEdge) {
            case 'top':
                width = Math.min(totalContentWidth, maxWidth);
                height = triggerZoneHeight;
                x = monitor.x + (monitor.width - width) / 2;
                y = monitor.y;
                startX = x;
                startY = monitor.y - height; // Start above screen
                borderRadius = '0 0 12px 12px';
                break;
            case 'bottom':
                width = Math.min(totalContentWidth, maxWidth);
                height = triggerZoneHeight;
                x = monitor.x + (monitor.width - width) / 2;
                y = monitor.y + monitor.height - height;
                startX = x;
                startY = monitor.y + monitor.height; // Start below screen
                borderRadius = '12px 12px 0 0';
                break;
            case 'left':
                width = triggerZoneHeight;
                height = Math.min(totalContentHeight, maxHeight);
                x = monitor.x;
                y = monitor.y + (monitor.height - height) / 2;
                startX = monitor.x - width; // Start left of screen
                startY = y;
                borderRadius = '0 12px 12px 0';
                break;
            case 'right':
                width = triggerZoneHeight;
                height = Math.min(totalContentHeight, maxHeight);
                x = monitor.x + monitor.width - width;
                y = monitor.y + (monitor.height - height) / 2;
                startX = monitor.x + monitor.width; // Start right of screen
                startY = y;
                borderRadius = '12px 0 0 12px';
                break;
            default:
                width = Math.min(totalContentWidth, maxWidth);
                height = triggerZoneHeight;
                x = monitor.x + (monitor.width - width) / 2;
                y = monitor.y;
                startX = x;
                startY = monitor.y - height;
                borderRadius = '0 0 12px 12px';
        }

        // Store final position for hide animation
        this._hitboxFinalX = x;
        this._hitboxFinalY = y;
        this._hitboxStartX = startX;
        this._hitboxStartY = startY;

        this.set_size(width, height);

        // Set a visible background for the trigger zone
        const hitboxColor = this._sanitizeColor(
            this._settings.get_string('hitbox-background-color')
        );
        this.set_style(`background-color: ${hitboxColor}; border-radius: ${borderRadius};`);

        // Hide layout grid content in trigger zone mode
        this.get_children().forEach(child => {
            child.visible = false;
        });

        // Set final position immediately (don't position off-screen to prevent drawing on other monitors)
        this.set_position(x, y);

        // Check if auto-hide is enabled for slide animation
        const autoHideEnabled = this._settings.get_boolean('auto-hide-enabled');
        const duration = this._settings.get_int('animation-duration');

        if (autoHideEnabled && duration > 0) {
            // Use translation to slide in, keeping the widget bounds on this monitor
            const translateX = startX - x;
            const translateY = startY - y;

            this.translation_x = translateX;
            this.translation_y = translateY;
            this.visible = true;
            this.opacity = 255;

            this.ease({
                translation_x: 0,
                translation_y: 0,
                duration: duration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });
        } else {
            // No animation, just show
            this.translation_x = 0;
            this.translation_y = 0;
            this.visible = true;
            this.opacity = 255;
        }

            this._debug(`Trigger zone shown at (${x}, ${y}) size (${width}x${height})`);
            this._debug(`Visible: ${this.visible}, Opacity: ${this.opacity}`);
            this._debug('=== SHOW HITBOX END ===');
        } catch (e) {
            log(`SnapKit OverlayUI: Error in showHitbox: ${e.message}\n${e.stack}`);
            this._debug('=== SHOW HITBOX ERROR ===');
        }
    }

    hideHitbox() {
        // Stop any ongoing animations first
        this.remove_all_transitions();

        const autoHideEnabled = this._settings.get_boolean('auto-hide-enabled');
        const duration = this._settings.get_int('animation-duration');

        if (autoHideEnabled && duration > 0 && this._hitboxStartX !== undefined && this._hitboxFinalX !== undefined) {
            // Slide out animation using translation (keeps widget bounds on this monitor)
            const translateX = this._hitboxStartX - this._hitboxFinalX;
            const translateY = this._hitboxStartY - this._hitboxFinalY;

            this.ease({
                translation_x: translateX,
                translation_y: translateY,
                duration: duration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this.visible = false;
                    this.translation_x = 0;
                    this.translation_y = 0;
                }
            });
        } else {
            // No animation, just hide
            this.visible = false;
            this.translation_x = 0;
            this.translation_y = 0;
        }
    }

    showOpen(monitor) {
        this._debug(`=== SHOW OPEN START ===`);
        this._debug(`showOpen called`);

        try {
            // Stop any ongoing animations to prevent color interpolation
            this.remove_all_transitions();

            // Reset translation from hitbox animations
            this.translation_x = 0;
            this.translation_y = 0;

            // Update position if monitor specified
            if (monitor) {
                this._debug(`Positioning overlay for monitor ${monitor.index}`);
                this._positionOverlay(monitor);
            }

            this.visible = true;
            this._debug(`Set visible to true`);

        // Restore background style from settings (after hitbox may have changed it)
        const bgType = this._settings.get_string('overlay-background-type');
        const bgColor = this._sanitizeColor(
            this._settings.get_string('overlay-background-color')
        );
        const bgColorEnd = this._sanitizeColor(
            this._settings.get_string('overlay-background-color-end')
        );

        // Determine border radius based on trigger edge (round corners not touching edge)
        const triggerEdge = this._settings.get_string('trigger-edge');
        let borderRadius;
        switch (triggerEdge) {
            case 'top':
                borderRadius = '0 0 12px 12px'; // Round bottom corners
                break;
            case 'bottom':
                borderRadius = '12px 12px 0 0'; // Round top corners
                break;
            case 'left':
                borderRadius = '0 12px 12px 0'; // Round right corners
                break;
            case 'right':
                borderRadius = '12px 0 0 12px'; // Round left corners
                break;
            default:
                borderRadius = '0 0 12px 12px';
        }

        let backgroundStyle;
        switch (bgType) {
            case 'gradient-vertical':
                // St toolkit uses different gradient syntax
                backgroundStyle = `background-gradient-direction: vertical; background-gradient-start: ${bgColor}; background-gradient-end: ${bgColorEnd}; border-radius: ${borderRadius};`;
                break;
            case 'gradient-horizontal':
                backgroundStyle = `background-gradient-direction: horizontal; background-gradient-start: ${bgColor}; background-gradient-end: ${bgColorEnd}; border-radius: ${borderRadius};`;
                break;
            case 'gradient-radial':
                // St doesn't support radial gradients natively, fall back to vertical gradient
                this._debug('Radial gradients not supported in St toolkit, using vertical gradient instead');
                backgroundStyle = `background-gradient-direction: vertical; background-gradient-start: ${bgColor}; background-gradient-end: ${bgColorEnd}; border-radius: ${borderRadius};`;
                break;
            default: // solid
                backgroundStyle = `background-color: ${bgColor}; border-radius: ${borderRadius};`;
        }
        this.set_style(backgroundStyle);

        // Show layout grid content
        this.get_children().forEach(child => {
            child.visible = true;
        });

        // Animate fade in to full opacity
        const duration = this._settings.get_int('animation-duration');
        const opacity = this._settings.get_double('overlay-opacity') * 255;

        this.ease({
            opacity: opacity,
            duration: duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });

            // Update zone positions
            this._updateZonePositions();

            this._debug(`Fully opened - visible: ${this.visible}, opacity: ${this.opacity}`);
            this._debug(`=== SHOW OPEN END ===`);
        } catch (e) {
            log(`SnapKit OverlayUI: Error in showOpen: ${e.message}\n${e.stack}`);
            this._debug(`=== SHOW OPEN ERROR ===`);
        }
    }

    show(monitor) {
        // Legacy method - calls showOpen for backwards compatibility
        this.showOpen(monitor);
    }

    hide() {
        // Stop any ongoing animations first
        this.remove_all_transitions();

        // Animate fade out
        const duration = this._settings.get_int('animation-duration');

        this.ease({
            opacity: 0,
            duration: duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.visible = false;
                this._clearZoneHighlight();
            }
        });
    }

    destroy() {
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        Main.layoutManager.removeChrome(this);
        super.destroy();
    }
});
