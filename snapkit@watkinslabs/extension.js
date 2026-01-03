import GObject from 'gi://GObject';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {LayoutManager} from './lib/layoutManager.js';
import {LayoutOverlay} from './lib/overlayUI.js';
import {SnapHandler} from './lib/snapHandler.js';
import {WindowSelector} from './lib/windowSelector.js';
import {TileManager} from './lib/tileManager.js';
import {SnapPreviewOverlay} from './lib/snapPreviewOverlay.js';

// Overlay states
const OverlayState = {
    CLOSED: 0,    // Hitbox visible, layout grid hidden
    OPEN: 1,      // Full overlay visible with layout grid
    SNAP_MODE: 2  // Window selector visible for choosing which window to snap
};

export default class SnapKitExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._overlays = new Map(); // Map of monitor index -> overlay
        this._layoutManager = null;
        this._snapHandler = null;
        this._tileManager = null;         // Manages tiled windows for resize sync
        this._grabSignalId = null;
        this._grabEndSignalId = null;
        this._motionSignalId = null;
        this._settingsChangedId = null;
        this._isDragging = false;
        this._draggedWindow = null;
        this._settings = null;
        this._mutterSettings = null;
        this._originalEdgeTiling = null;
        this._overlayState = OverlayState.CLOSED;
        this._pushTimeoutId = null;
        this._lastMotionTime = 0;         // For motion event throttling

        // Per-monitor active layout (monitorIndex -> layoutId)
        this._monitorLayouts = new Map();

        // Drag polling for cursor position
        this._dragPollId = null;

        // Trigger zone polling (for when windows block motion events)
        this._triggerPollId = null;

        // SNAP MODE state
        this._snapModeLayout = null;      // Current layout in SNAP MODE
        this._snapModeZones = [];         // Zones in the current layout
        this._snapModeCurrentIndex = 0;   // Current zone index
        this._snapModeFilledZones = new Set(); // Track filled zone IDs
        this._snapModeMonitor = null;     // Monitor where overlay was shown
        this._windowSelector = null;      // Window selector overlay
        this._positionedWindows = new Set();  // Set of windows already positioned
        this._snapModeTimeoutId = null;   // Timeout to auto-exit SNAP MODE
    }

    _debug(message) {
        if (this._settings && this._settings.get_boolean('debug-mode')) {
            console.log(`SnapKit: ${message}`);
        }
    }

    /**
     * Load per-monitor layout assignments from settings
     */
    _loadMonitorLayouts() {
        try {
            const savedLayouts = this._settings.get_string('monitor-layouts');
            const layoutsObj = JSON.parse(savedLayouts);

            this._monitorLayouts.clear();
            for (const [monitorIndex, layoutId] of Object.entries(layoutsObj)) {
                this._monitorLayouts.set(parseInt(monitorIndex), layoutId);
                this._debug(`Loaded layout ${layoutId} for monitor ${monitorIndex}`);
            }
            this._debug(`Loaded ${this._monitorLayouts.size} monitor layout assignments`);
        } catch (e) {
            this._debug(`Error loading monitor layouts: ${e.message}`);
            this._monitorLayouts.clear();
        }
    }

    /**
     * Save per-monitor layout assignments to settings
     */
    _saveMonitorLayouts() {
        try {
            const layoutsObj = {};
            for (const [monitorIndex, layoutId] of this._monitorLayouts) {
                layoutsObj[monitorIndex] = layoutId;
            }
            const json = JSON.stringify(layoutsObj);
            this._settings.set_string('monitor-layouts', json);
            this._debug(`Saved monitor layouts: ${json}`);
        } catch (e) {
            this._debug(`Error saving monitor layouts: ${e.message}`);
        }
    }

    enable() {
        this._debug('Enabling extension');

        try {
            // Initialize settings
            this._debug('Getting settings...');
            this._settings = this.getSettings();
            this._debug('Settings loaded');

            // Load saved per-monitor layouts from settings
            this._loadMonitorLayouts();

            // Listen for settings changes
            this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
                this._debug(`Setting changed: ${key}`);

                if (key === 'custom-layouts' || key === 'enabled-layouts') {
                    this._debug('Layouts changed, reloading layout manager');
                    if (this._layoutManager) {
                        this._layoutManager.reload();
                    }
                    // Recreate overlays to pick up new layouts
                    this._createOverlays();
                    // Show hitboxes if auto-hide is disabled
                    const autoHideEnabled = this._settings.get_boolean('auto-hide-enabled');
                    if (!autoHideEnabled && this._overlayState === OverlayState.CLOSED) {
                        this._showHitboxes();
                    }
                } else if (key === 'monitor-mode') {
                    this._debug('Monitor mode changed, recreating overlays');

                    // Exit SNAP MODE if active to prevent state corruption
                    if (this._overlayState === OverlayState.SNAP_MODE) {
                        this._debug('Exiting SNAP MODE due to monitor-mode change');
                        this._exitSnapMode();
                    }

                    // Transition to CLOSED state before recreating
                    this._overlayState = OverlayState.CLOSED;

                    this._createOverlays();
                    // Show hitboxes if auto-hide is disabled
                    const autoHideEnabled = this._settings.get_boolean('auto-hide-enabled');
                    if (!autoHideEnabled) {
                        this._showHitboxes();
                    }
                } else if (key === 'auto-hide-enabled') {
                    this._debug('Auto-hide setting changed');

                    // Exit SNAP MODE if active to prevent state issues
                    if (this._overlayState === OverlayState.SNAP_MODE) {
                        this._debug('Exiting SNAP MODE due to auto-hide change');
                        this._exitSnapMode();
                    }

                    // Update visibility based on current state and new setting
                    const autoHideEnabled = this._settings.get_boolean('auto-hide-enabled');
                    if (this._overlayState === OverlayState.CLOSED) {
                        if (autoHideEnabled) {
                            // Hide all hitboxes
                            this._debug('Auto-hide enabled, hiding hitboxes');
                            for (let [monitorIndex, overlay] of this._overlays) {
                                if (overlay.visible) {
                                    overlay.hideHitbox();
                                }
                            }
                        } else {
                            // Show hitboxes
                            this._debug('Auto-hide disabled, showing hitboxes');
                            this._showHitboxes();
                        }
                    }
                }
            });

            // Manage GNOME edge tiling if requested
            this._debug('Managing mutter edge tiling...');
            this._manageMutterEdgeTiling();
            this._debug('Edge tiling managed');

            // Initialize components
            this._debug('Creating layout manager...');
            this._layoutManager = new LayoutManager(this._settings);
            this._debug('Layout manager created');

            this._debug('Creating snap handler...');
            this._snapHandler = new SnapHandler(this._layoutManager, this._settings);
            this._debug('Snap handler created');

            this._debug('Creating tile manager...');
            this._tileManager = new TileManager(this._settings, this._layoutManager);
            this._debug('Tile manager created');

            this._debug('Creating snap preview overlay...');
            this._snapPreview = new SnapPreviewOverlay(this._settings, this._layoutManager);
            this._debug('Snap preview overlay created');

            // Create overlays and show hitboxes
            this._debug('Creating overlays...');
            this._createOverlays();
            this._debug('Overlays created');

            // Show hitboxes immediately in CLOSED state (unless auto-hide is enabled)
            this._debug('Showing initial hitboxes...');
            const autoHideEnabled = this._settings.get_boolean('auto-hide-enabled');
            if (!autoHideEnabled) {
                this._showHitboxes();
                this._debug('Hitboxes shown (auto-hide disabled)');
            } else {
                this._debug('Hitboxes hidden on startup (auto-hide enabled)');
            }

            // Connect to grab events to detect window dragging
            this._debug('Connecting grab events...');
            this._grabSignalId = global.display.connect('grab-op-begin',
                this._onGrabBegin.bind(this));

            this._grabEndSignalId = global.display.connect('grab-op-end',
                this._onGrabEnd.bind(this));
            this._debug('Grab events connected');

            // Always monitor mouse motion to detect trigger zone entry
            this._debug('Connecting motion events...');
            this._motionSignalId = global.stage.connect('motion-event',
                this._onMotionEvent.bind(this));
            this._debug('Motion events connected');

            // Also poll mouse position periodically (for when windows block motion events)
            this._startTriggerPolling();

            this._debug('Extension enabled successfully');
        } catch (e) {
            this._debug(`ERROR in enable(): ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
        }
    }

    disable() {
        this._debug('Disabling extension');

        // Clear any pending push timeout
        if (this._pushTimeoutId) {
            GLib.source_remove(this._pushTimeoutId);
            this._pushTimeoutId = null;
        }

        // Clear SNAP MODE timeout
        if (this._snapModeTimeoutId) {
            GLib.source_remove(this._snapModeTimeoutId);
            this._snapModeTimeoutId = null;
        }

        // Clear drag polling
        this._stopDragPolling();

        // Clear trigger polling
        this._stopTriggerPolling();

        // Restore GNOME edge tiling if we modified it
        this._restoreMutterEdgeTiling();

        // Disconnect signals
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._grabSignalId) {
            global.display.disconnect(this._grabSignalId);
            this._grabSignalId = null;
        }

        if (this._grabEndSignalId) {
            global.display.disconnect(this._grabEndSignalId);
            this._grabEndSignalId = null;
        }

        if (this._motionSignalId) {
            global.stage.disconnect(this._motionSignalId);
            this._motionSignalId = null;
        }

        // Destroy all overlays
        for (let [monitorIndex, overlay] of this._overlays) {
            overlay.destroy();
        }
        this._overlays.clear();

        // Destroy window selector if exists
        if (this._windowSelector) {
            this._windowSelector.destroy();
            this._windowSelector = null;
        }

        if (this._tileManager) {
            this._tileManager.destroy();
            this._tileManager = null;
        }

        if (this._snapPreview) {
            this._snapPreview.destroy();
            this._snapPreview = null;
        }

        if (this._snapHandler) {
            this._snapHandler.destroy();
            this._snapHandler = null;
        }

        if (this._layoutManager) {
            this._layoutManager.destroy();
            this._layoutManager = null;
        }

        this._isDragging = false;
        this._draggedWindow = null;
        this._settings = null;
        this._mutterSettings = null;
        this._overlayState = OverlayState.CLOSED;
    }

    _onGrabBegin(display, window, grabOp) {
        this._debug(`Grab begin - grabOp: ${grabOp}, MOVING: ${Meta.GrabOp.MOVING}`);
        // Check if this is a window move operation
        if (grabOp === Meta.GrabOp.MOVING && this._snapHandler.canSnapWindow(window)) {
            this._debug('Window drag detected, starting motion tracking');
            this._isDragging = true;
            this._draggedWindow = window;
            this._snapDisabledForCurrentDrag = false; // Reset snap disable flag

            // Get the monitor where the window is
            const windowRect = window.get_frame_rect();
            const monitor = Main.layoutManager.monitors.find(m =>
                windowRect.x >= m.x && windowRect.x < m.x + m.width &&
                windowRect.y >= m.y && windowRect.y < m.y + m.height
            ) || Main.layoutManager.primaryMonitor;

            // Get the layout for this monitor
            const layoutId = this._monitorLayouts.get(monitor.index);
            this._debug(`Monitor ${monitor.index} has layout: ${layoutId || 'none (using default)'}`);

            // Show snap preview if enabled
            if (this._settings.get_boolean('snap-preview-enabled') && this._snapPreview) {
                // Check if snap-disable key is held
                if (!this._isSnapDisableKeyHeld()) {
                    this._snapPreview.show(layoutId);
                    this._debug(`Snap preview shown with layout: ${layoutId || 'default'}`);

                    // Start polling cursor position during drag
                    // (motion events don't fire during grab operations)
                    this._startDragPolling();

                    // Listen for key presses to detect Escape/Space during drag
                    this._startDragKeyListener();
                }
            }
        }
    }

    _startDragKeyListener() {
        if (this._dragKeyPressId) {
            global.stage.disconnect(this._dragKeyPressId);
        }

        this._dragKeyPressId = global.stage.connect('key-press-event', (actor, event) => {
            if (!this._isDragging || this._snapDisabledForCurrentDrag) {
                return Clutter.EVENT_PROPAGATE;
            }

            const symbol = event.get_key_symbol();
            const disableKey = this._settings.get_string('snap-disable-key');

            let shouldDisable = false;

            if (disableKey === 'escape' && symbol === Clutter.KEY_Escape) {
                shouldDisable = true;
            } else if (disableKey === 'space' && symbol === Clutter.KEY_space) {
                shouldDisable = true;
            }

            if (shouldDisable) {
                this._debug(`Snap disable key pressed (${disableKey}), hiding snap preview`);
                this._snapPreview.hide();
                this._snapDisabledForCurrentDrag = true;
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    _stopDragKeyListener() {
        if (this._dragKeyPressId) {
            global.stage.disconnect(this._dragKeyPressId);
            this._dragKeyPressId = null;
        }
    }

    _startDragPolling() {
        if (this._dragPollId) {
            GLib.source_remove(this._dragPollId);
        }

        this._dragPollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            if (!this._isDragging || !this._snapPreview) {
                this._dragPollId = null;
                return GLib.SOURCE_REMOVE;
            }

            // Check if disable key is pressed - immediately exit drag snap mode
            if (this._isSnapDisableKeyHeld()) {
                this._debug(`Snap disable key pressed during drag, hiding snap preview`);
                this._snapPreview.hide();
                this._snapDisabledForCurrentDrag = true;
                return GLib.SOURCE_CONTINUE;
            }

            // Skip highlighting if snap was disabled for this drag
            if (this._snapDisabledForCurrentDrag) {
                return GLib.SOURCE_CONTINUE;
            }

            const [x, y] = global.get_pointer();
            const zone = this._snapPreview.updateHighlight(x, y);

            if (zone) {
                this._debug(`Drag poll: zone ${zone.id} at (${x}, ${y})`);
            }

            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopDragPolling() {
        if (this._dragPollId) {
            GLib.source_remove(this._dragPollId);
            this._dragPollId = null;
        }
    }

    _startTriggerPolling() {
        if (this._triggerPollId) {
            GLib.source_remove(this._triggerPollId);
        }

        // Poll every 100ms to detect trigger zone entry even when windows block events
        this._triggerPollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            // Skip if already in OPEN state or SNAP MODE
            if (this._overlayState !== OverlayState.CLOSED) {
                return GLib.SOURCE_CONTINUE;
            }

            // Skip if dragging
            if (this._isDragging) {
                return GLib.SOURCE_CONTINUE;
            }

            const [x, y] = global.get_pointer();
            const triggerSize = this._settings.get_int('trigger-zone-height');
            const triggerEdge = this._settings.get_string('trigger-edge');

            // Check each monitor
            for (const monitor of Main.layoutManager.monitors) {
                if (this._isInTriggerZone(x, y, monitor, triggerSize, triggerEdge)) {
                    const overlay = this._overlays.get(monitor.index);
                    if (overlay && !overlay.visible) {
                        this._debug(`Trigger poll: mouse in trigger zone, showing hitbox`);
                        overlay.showHitbox(monitor);
                        this._hideOtherMonitorOverlays(monitor.index);
                    }

                    // Start push timer if not already running
                    if (!this._pushTimeoutId) {
                        const pushTime = this._settings.get_int('push-time');
                        if (pushTime > 0) {
                            this._pushTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, pushTime, () => {
                                this._pushTimeoutId = null;
                                this._transitionToOpen(monitor);
                                return GLib.SOURCE_REMOVE;
                            });
                        } else {
                            this._transitionToOpen(monitor);
                        }
                    }
                    break;
                }
            }

            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTriggerPolling() {
        if (this._triggerPollId) {
            GLib.source_remove(this._triggerPollId);
            this._triggerPollId = null;
        }
    }

    _onGrabEnd(display, window, grabOp) {
        if (grabOp === Meta.GrabOp.MOVING) {
            this._debug(`Grab end - checking auto-snap`);

            // Stop polling and key listener
            this._stopDragPolling();
            this._stopDragKeyListener();

            // Check for auto-snap before hiding (skip if snap was disabled during this drag)
            if (this._snapPreview && this._settings.get_boolean('snap-preview-auto-snap') && !this._snapDisabledForCurrentDrag) {
                const zone = this._snapPreview.getHighlightedZone();
                this._debug(`Highlighted zone: ${zone ? zone.id : 'none'}, has windowRect: ${zone?.windowRect ? 'yes' : 'no'}`);

                if (zone && this._draggedWindow) {
                    this._debug(`Auto-snapping to zone: ${zone.id}`);
                    this._autoSnapToZone(this._draggedWindow, zone);
                }
            } else {
                if (this._snapDisabledForCurrentDrag) {
                    this._debug(`Auto-snap skipped - snap was disabled during this drag`);
                } else {
                    this._debug(`Auto-snap disabled or no preview: preview=${!!this._snapPreview}, enabled=${this._settings.get_boolean('snap-preview-auto-snap')}`);
                }
            }

            // Hide snap preview
            if (this._snapPreview) {
                this._snapPreview.hide();
            }

            this._isDragging = false;
            this._draggedWindow = null;
            this._snapDisabledForCurrentDrag = false; // Reset flag

            // Hide all overlays
            this._hideOverlays();
        }
    }

    /**
     * Check if the snap-disable key is currently held
     */
    _isSnapDisableKeyHeld() {
        try {
            const disableKey = this._settings.get_string('snap-disable-key');

            // Get current modifier state from global display
            const [, , modState] = global.get_pointer();

            // Check common keys
            if (disableKey === 'space') {
                // Space is not a modifier - can't easily detect
                return false;
            } else if (disableKey === 'ctrl') {
                return (modState & Clutter.ModifierType.CONTROL_MASK) !== 0;
            } else if (disableKey === 'alt') {
                return (modState & Clutter.ModifierType.MOD1_MASK) !== 0;
            } else if (disableKey === 'shift') {
                return (modState & Clutter.ModifierType.SHIFT_MASK) !== 0;
            } else if (disableKey === 'super') {
                return (modState & Clutter.ModifierType.MOD4_MASK) !== 0;
            }
        } catch (e) {
            this._debug(`Error checking modifier state: ${e.message}`);
        }
        return false;
    }

    /**
     * Auto-snap a window to a zone
     */
    _autoSnapToZone(window, zone) {
        this._debug(`_autoSnapToZone called for zone ${zone.id}`);

        if (!zone.windowRect) {
            this._debug(`Zone ${zone.id} has no windowRect, cannot snap`);
            return;
        }

        const rect = zone.windowRect;
        this._debug(`Snapping window to ${rect.x},${rect.y} ${rect.width}x${rect.height}`);

        try {
            window.move_resize_frame(
                true,
                Math.round(rect.x),
                Math.round(rect.y),
                Math.round(rect.width),
                Math.round(rect.height)
            );
            this._debug(`Window moved successfully`);

            // Register with tile manager
            if (this._tileManager && this._snapPreview) {
                const layout = this._snapPreview.getCurrentLayout();
                if (layout) {
                    const monitor = Main.layoutManager.monitors.find(m =>
                        rect.x >= m.x && rect.x < m.x + m.width
                    );
                    if (monitor) {
                        this._tileManager.registerSnappedWindow(
                            window,
                            this._layoutManager.getLayoutId(layout),
                            zone,
                            monitor.index,
                            layout
                        );
                        this._debug(`Window registered with tile manager`);
                    }
                }
            }
        } catch (e) {
            this._debug(`Error auto-snapping: ${e.message}`);
        }
    }

    _onMotionEvent(actor, event) {
        // ARCHITECTURE NOTE:
        // This handler separates MOUSE DETECTION from VISUAL FEEDBACK:
        //
        // CLOSED state:
        //   - Detection: Based on _isInTriggerZone (invisible, fixed zone at screen edge)
        //   - Visual: Overlay widget can slide in/out independently for user feedback
        //   - The trigger zone is ALWAYS active for detection, even when visual is hidden
        //
        // OPEN state:
        //   - Detection: Based on overlay widget bounds (_isOverOverlay)
        //   - Visual: Full layout grid is shown
        try {
            // Throttle motion events for performance
            const now = Date.now();
            const throttleInterval = this._settings.get_int('motion-throttle-interval');
            if (this._lastMotionTime && now - this._lastMotionTime < throttleInterval) {
                return Clutter.EVENT_PROPAGATE;
            }
            this._lastMotionTime = now;

            // Get mouse coordinates
            let [x, y] = event.get_coords();

            // Update snap preview highlight if dragging
            if (this._isDragging && this._snapPreview) {
                const zone = this._snapPreview.updateHighlight(x, y);
                if (zone) {
                    this._debug(`Drag highlight: zone ${zone.id} at (${x}, ${y})`);
                } else {
                    // Log occasionally when no zone found
                    if (!this._lastNoZoneLog || Date.now() - this._lastNoZoneLog > 1000) {
                        this._lastNoZoneLog = Date.now();
                        this._debug(`No zone at cursor (${x}, ${y})`);
                    }
                }
            }

            // Determine which monitor to use based on settings
            let monitor = this._getActiveMonitor(x, y);
            if (!monitor) {
                this._debug(`Motion - No monitor found at (${x}, ${y})`);
                return Clutter.EVENT_PROPAGATE;
            }

            // Get or create overlay for this monitor
            let overlay = this._overlays.get(monitor.index);
            if (!overlay) {
                this._debug(`No overlay for monitor ${monitor.index}`);
                return Clutter.EVENT_PROPAGATE;
            }

            // Verify overlay is still valid (not being destroyed)
            if (!overlay || overlay._inDestruction) {
                this._debug(`Overlay for monitor ${monitor.index} is being destroyed, skipping`);
                return Clutter.EVENT_PROPAGATE;
            }

            // IMPORTANT: Separate visual overlay from mouse detection
            // - inTriggerZone: Are we in the invisible, permanent detection area?
            // - overOverlay: Are we over the visual overlay widget? (used for OPEN state only)
            const triggerSize = this._settings.get_int('trigger-zone-height');
            const triggerEdge = this._settings.get_string('trigger-edge');
            let inTriggerZone = this._isInTriggerZone(x, y, monitor, triggerSize, triggerEdge);
            let overOverlay = this._isOverOverlay(x, y, overlay);

            if (this._overlayState === OverlayState.CLOSED) {
                // Mouse detection is based on TRIGGER ZONE, not visual overlay position
                if (inTriggerZone) {
                    this._debug(`Mouse in trigger zone on monitor ${monitor.index}`);

                    // Show visual indicator if hidden
                    if (!overlay.visible) {
                        this._debug(`Showing visual hitbox indicator`);
                        try {
                            overlay.showHitbox(monitor);
                            // In 'current' mode, hide overlays on other monitors
                            this._hideOtherMonitorOverlays(monitor.index);
                        } catch (e) {
                            this._debug(`ERROR showing hitbox: ${e.message}`);
                            this._debug(`ERROR stack: ${e.stack}`);
                        }
                    }

                    // Start or maintain push timer
                    if (!this._pushTimeoutId) {
                        this._debug(`Starting push timer`);
                        let pushTime = 300; // default
                        try {
                            pushTime = this._settings.get_int('push-time');
                        } catch (e) {
                            this._debug(`Failed to get push-time: ${e.message}, using default 300`);
                        }

                        if (pushTime > 0) {
                            this._pushTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, pushTime, () => {
                                this._debug(`Push time elapsed, transitioning to OPEN on monitor ${monitor.index}`);
                                this._pushTimeoutId = null;
                                try {
                                    this._transitionToOpen(monitor);
                                } catch (e) {
                                    this._debug(`ERROR in push timeout: ${e.message}`);
                                    this._debug(`ERROR stack: ${e.stack}`);
                                }
                                return GLib.SOURCE_REMOVE;
                            });
                        } else {
                            // If push time is 0, open immediately
                            try {
                                this._transitionToOpen(monitor);
                            } catch (e) {
                                this._debug(`ERROR opening immediately: ${e.message}`);
                                this._debug(`ERROR stack: ${e.stack}`);
                            }
                        }
                    }
                } else {
                    // Mouse LEFT the trigger zone (not just the visual overlay)
                    this._debug(`Mouse left trigger zone`);

                    // Cancel push timer if active
                    if (this._pushTimeoutId) {
                        this._debug(`Canceling push timer`);
                        GLib.source_remove(this._pushTimeoutId);
                        this._pushTimeoutId = null;
                    }

                    // Auto-hide the VISUAL indicator if enabled
                    try {
                        const autoHideEnabled = this._settings.get_boolean('auto-hide-enabled');
                        if (autoHideEnabled && overlay.visible) {
                            this._debug(`Auto-hide enabled, hiding visual indicator`);
                            try {
                                overlay.hideHitbox();
                            } catch (e) {
                                this._debug(`ERROR hiding hitbox: ${e.message}`);
                            }
                        }
                    } catch (e) {
                        this._debug(`ERROR in auto-hide: ${e.message}`);
                    }
                }
            } else if (this._overlayState === OverlayState.OPEN) {
                // When fully open, use visual overlay bounds for detection
                if (overOverlay) {
                    this._debug(`Mouse in overlay area on monitor ${monitor.index}, staying OPEN`);
                    try {
                        overlay.updateMonitor(monitor);
                    } catch (e) {
                        this._debug(`ERROR updating monitor: ${e.message}`);
                    }
                } else {
                    this._debug(`Mouse left overlay area from OPEN, returning to CLOSED`);
                    try {
                        this._transitionToClosed();
                    } catch (e) {
                        this._debug(`ERROR transitioning to closed from motion: ${e.message}`);
                        this._debug(`ERROR stack: ${e.stack}`);
                    }
                }
            }

            return Clutter.EVENT_PROPAGATE;
        } catch (e) {
            this._debug(`ERROR in _onMotionEvent: ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _getActiveMonitor(x, y) {
        const monitorMode = this._settings.get_string('monitor-mode');

        switch (monitorMode) {
            case 'primary':
                return Main.layoutManager.primaryMonitor;

            case 'current':
                // Get monitor at current mouse position
                return Main.layoutManager.monitors.find(m =>
                    x >= m.x && x < m.x + m.width &&
                    y >= m.y && y < m.y + m.height
                ) || Main.layoutManager.primaryMonitor;

            case 'all':
                // For 'all' mode, find which monitor mouse is on
                return Main.layoutManager.monitors.find(m =>
                    x >= m.x && x < m.x + m.width &&
                    y >= m.y && y < m.y + m.height
                ) || Main.layoutManager.primaryMonitor;

            default:
                return Main.layoutManager.primaryMonitor;
        }
    }

    _isInTriggerZone(x, y, monitor, triggerSize, edge) {
        // Trigger zone spans 100% of the monitor width (for top/bottom) or height (for left/right)
        switch (edge) {
            case 'top':
                return x >= monitor.x && x <= monitor.x + monitor.width &&
                       y >= monitor.y && y <= monitor.y + triggerSize;

            case 'bottom':
                return x >= monitor.x && x <= monitor.x + monitor.width &&
                       y >= monitor.y + monitor.height - triggerSize &&
                       y <= monitor.y + monitor.height;

            case 'left':
                return y >= monitor.y && y <= monitor.y + monitor.height &&
                       x >= monitor.x && x <= monitor.x + triggerSize;

            case 'right':
                return y >= monitor.y && y <= monitor.y + monitor.height &&
                       x >= monitor.x + monitor.width - triggerSize &&
                       x <= monitor.x + monitor.width;

            default:
                // Default to top
                return x >= monitor.x && x <= monitor.x + monitor.width &&
                       y >= monitor.y && y <= monitor.y + triggerSize;
        }
    }

    _isOverOverlay(x, y, overlay) {
        // Check if mouse is over the specified overlay widget
        if (!overlay || !overlay.visible) {
            return false;
        }

        const [overlayX, overlayY] = overlay.get_position();
        const [overlayWidth, overlayHeight] = overlay.get_size();

        const isOver = x >= overlayX && x <= overlayX + overlayWidth &&
                       y >= overlayY && y <= overlayY + overlayHeight;

        return isOver;
    }

    _createOverlays() {
        // Clear existing overlays
        for (let [monitorIndex, overlay] of this._overlays) {
            overlay.destroy();
        }
        this._overlays.clear();

        // Determine which monitors to create overlays for
        const monitorMode = this._settings.get_string('monitor-mode');
        let monitorsToCreate = [];

        switch (monitorMode) {
            case 'primary':
                monitorsToCreate = [Main.layoutManager.primaryMonitor];
                break;
            case 'current':
                // For current mode, create overlays for all monitors so we can show
                // on whichever monitor the mouse is on, but only show one at a time
                monitorsToCreate = Main.layoutManager.monitors;
                break;
            case 'all':
                // Create overlays for all monitors
                monitorsToCreate = Main.layoutManager.monitors;
                break;
            default:
                monitorsToCreate = [Main.layoutManager.primaryMonitor];
        }

        // Create overlay for each monitor
        for (let monitor of monitorsToCreate) {
            const overlay = new LayoutOverlay(this._layoutManager, this._settings);
            overlay.connect('zone-selected', this._onZoneSelected.bind(this));
            this._overlays.set(monitor.index, overlay);
            this._debug(`Created overlay for monitor ${monitor.index}`);
        }
    }

    _showHitboxes() {
        this._debug(`_showHitboxes called - overlays count: ${this._overlays.size}`);
        try {
            const monitorMode = this._settings.get_string('monitor-mode');

            for (let [monitorIndex, overlay] of this._overlays) {
                const monitor = Main.layoutManager.monitors[monitorIndex];
                if (monitor) {
                    // In 'current' mode, don't show hitboxes initially - wait for mouse motion
                    if (monitorMode === 'current') {
                        this._debug(`Skipping initial hitbox for monitor ${monitorIndex} (current mode - waiting for mouse)`);
                        continue;
                    }

                    this._debug(`Showing hitbox for monitor ${monitorIndex}`);
                    try {
                        overlay.showHitbox(monitor);
                        this._debug(`Hitbox shown for monitor ${monitorIndex}`);
                    } catch (e) {
                        this._debug(`ERROR showing hitbox for monitor ${monitorIndex}: ${e.message}`);
                        this._debug(`ERROR stack: ${e.stack}`);
                    }
                } else {
                    this._debug(`WARNING: Monitor ${monitorIndex} not found`);
                }
            }
        } catch (e) {
            this._debug(`ERROR in _showHitboxes: ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
        }
    }

    _hideOtherMonitorOverlays(activeMonitorIndex) {
        // In 'current' mode, hide overlays on all monitors except the active one
        const monitorMode = this._settings.get_string('monitor-mode');
        if (monitorMode !== 'current') {
            return; // Only hide others in 'current' mode
        }

        for (let [monitorIndex, overlay] of this._overlays) {
            if (monitorIndex !== activeMonitorIndex && overlay.visible) {
                this._debug(`Hiding overlay on monitor ${monitorIndex} (not current)`);
                overlay.hideHitbox();
            }
        }
    }

    _transitionToOpen(monitor) {
        this._debug(`=== TRANSITION TO OPEN START ===`);
        this._debug(`Transitioning to OPEN state on monitor ${monitor.index}`);

        try {
            this._overlayState = OverlayState.OPEN;
            this._debug(`State set to OPEN`);

            // Hide all other monitor overlays, show only the one being activated
            for (let [monitorIndex, overlay] of this._overlays) {
                try {
                    if (monitorIndex === monitor.index) {
                        this._debug(`Opening overlay on monitor ${monitorIndex}`);
                        overlay.showOpen(monitor);
                        this._debug(`Overlay fully opened on monitor ${monitorIndex}`);
                    } else {
                        this._debug(`Hiding overlay on monitor ${monitorIndex}`);
                        overlay.hide();
                    }
                } catch (e) {
                    this._debug(`ERROR managing overlay for monitor ${monitorIndex}: ${e.message}`);
                    this._debug(`ERROR stack: ${e.stack}`);
                }
            }
            this._debug(`=== TRANSITION TO OPEN END ===`);
        } catch (e) {
            this._debug(`ERROR in _transitionToOpen: ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
        }
    }

    _transitionToClosed() {
        this._debug(`=== TRANSITION TO CLOSED START ===`);
        this._debug(`Transitioning to CLOSED state`);

        try {
            this._overlayState = OverlayState.CLOSED;
            this._debug(`State set to CLOSED`);

            // Show visual hitboxes based on auto-hide setting
            const autoHideEnabled = this._settings.get_boolean('auto-hide-enabled');
            if (!autoHideEnabled) {
                this._debug(`Auto-hide disabled, showing visual hitboxes`);
                this._showHitboxes();
            } else {
                this._debug(`Auto-hide enabled, hiding visual hitboxes (detection still active)`);
                // Hide visual indicators but keep detection active via motion events
                for (let [monitorIndex, overlay] of this._overlays) {
                    if (overlay.visible) {
                        try {
                            overlay.hideHitbox();
                        } catch (e) {
                            this._debug(`ERROR hiding overlay ${monitorIndex}: ${e.message}`);
                        }
                    }
                }
            }
            this._debug(`=== TRANSITION TO CLOSED END ===`);
        } catch (e) {
            this._debug(`ERROR in _transitionToClosed: ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
        }
    }

    _hideOverlays() {
        for (let [monitorIndex, overlay] of this._overlays) {
            if (overlay && overlay.visible) {
                // Use hideHitbox for slide-out animation when in CLOSED state
                if (this._overlayState === OverlayState.CLOSED) {
                    overlay.hideHitbox();
                } else {
                    overlay.hide();
                }
            }
        }
    }

    _onZoneSelected(overlay, layoutId, zone) {
        this._debug(`=== ZONE SELECTED START ===`);
        this._debug(`Zone selected - layout: ${layoutId}, zone: ${zone ? zone.id : 'null'}`);

        try {
            // Get the layout object
            const layout = this._layoutManager.getLayout(layoutId);
            if (!layout) {
                this._debug(`ERROR: Layout ${layoutId} not found`);
                return;
            }

            // Get zones for this layout (works with both simple and full-spec)
            const zones = this._layoutManager.getZonesForDisplay(layout);
            if (!zones || zones.length === 0) {
                this._debug(`ERROR: Layout ${layoutId} has no zones`);
                Main.notify('SnapKit', 'Invalid layout: no zones defined');
                return;
            }

            // Find which monitor this overlay is on
            let monitorIndex = -1;
            for (let [index, ovr] of this._overlays) {
                if (ovr === overlay) {
                    monitorIndex = index;
                    break;
                }
            }

            if (monitorIndex === -1) {
                this._debug(`ERROR: Could not find monitor for overlay`);
                return;
            }

            // Enter SNAP MODE
            this._debug(`Entering SNAP MODE for layout ${layoutId} on monitor ${monitorIndex}`);
            this._snapModeLayout = layout;
            this._snapModeZones = zones;
            this._snapModeMonitor = Main.layoutManager.monitors[monitorIndex];
            this._positionedWindows.clear(); // Clear any previously positioned windows
            this._snapModeFilledZones.clear(); // Clear filled zones tracking

            // Save this layout for THIS monitor
            this._monitorLayouts.set(monitorIndex, layoutId);
            this._debug(`Saved ${layoutId} as active layout for monitor ${monitorIndex}`);

            // Clear any existing tile group on this monitor for the new layout
            if (this._tileManager) {
                const existingGroup = this._tileManager.getTileGroup(monitorIndex);
                if (existingGroup && existingGroup.layoutId !== layoutId) {
                    this._debug(`Clearing existing tile group for new layout`);
                    this._tileManager._clearGroup(monitorIndex);
                }
            }

            // Find index of clicked zone by ID (not object reference)
            this._debug(`Looking for zone ${zone.id} in layout zones: ${zones.map(z => z.id).join(', ')}`);
            this._snapModeCurrentIndex = zones.findIndex(z => z.id === zone.id);
            if (this._snapModeCurrentIndex === -1) {
                this._debug(`ERROR: Zone ${zone.id} not found in layout zones, using first zone`);
                this._debug(`Zone object: ${JSON.stringify(zone)}`);
                this._snapModeCurrentIndex = 0;
            }
            this._debug(`Starting SNAP MODE at zone index ${this._snapModeCurrentIndex} (zone.id=${zone.id})`);

            // Validate zone index is within bounds
            if (this._snapModeCurrentIndex >= zones.length) {
                this._debug(`ERROR: Zone index ${this._snapModeCurrentIndex} out of bounds`);
                this._snapModeCurrentIndex = 0;
            }

            this._debug(`Starting with zone ${this._snapModeCurrentIndex} of ${this._snapModeZones.length}`);

            // Check if there are any snappable windows
            const snappableWindows = this._getSnappableWindows();
            if (snappableWindows.length === 0) {
                this._debug(`No snappable windows available, just setting grid layout`);
                // Just set the layout and close - no SNAP MODE needed
                for (let [idx, ovr] of this._overlays) {
                    ovr.hide();
                }
                this._overlayState = OverlayState.CLOSED;
                this._snapModeLayout = null;
                this._snapModeZones = null;
                this._snapModeMonitor = null;
                this._debug(`=== ZONE SELECTED END (GRID SET, NO WINDOWS) ===`);
                return;
            }

            // Transition to SNAP_MODE state
            this._overlayState = OverlayState.SNAP_MODE;

            // Hide layout overlay
            for (let [monitorIndex, overlay] of this._overlays) {
                overlay.hide();
            }

            // Show window selector
            this._showWindowSelector();

            this._debug(`=== ZONE SELECTED END (SNAP MODE ACTIVE) ===`);
        } catch (e) {
            this._debug(`ERROR in _onZoneSelected: ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
            // Exit SNAP MODE on error
            this._exitSnapMode();
        }
    }

    _showWindowSelector() {
        this._debug(`Showing window selector for zone ${this._snapModeCurrentIndex}`);

        try {
            // Set timeout to auto-exit SNAP MODE
            if (this._snapModeTimeoutId) {
                GLib.source_remove(this._snapModeTimeoutId);
            }

            const timeoutSeconds = this._settings.get_int('snap-mode-timeout');
            this._snapModeTimeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                timeoutSeconds,
                () => {
                    this._debug('SNAP MODE timeout, auto-exiting');
                    Main.notify('SnapKit', 'SNAP MODE timed out');
                    this._exitSnapMode();
                    return GLib.SOURCE_REMOVE;
                }
            );
            this._debug(`SNAP MODE timeout set for ${timeoutSeconds} seconds`);

            // Create window selector with zone preview integrated
            if (!this._windowSelector) {
                this._windowSelector = new WindowSelector(
                    this._settings,
                    this._positionedWindows,
                    this._snapModeLayout,
                    this._snapModeZones,
                    this._snapModeCurrentIndex,
                    this._snapModeFilledZones
                );

                // Connect to window selection
                this._windowSelector.connect('window-selected', (selector, window) => {
                    this._onWindowSelected(window);
                });

                // Connect to window deselection
                this._windowSelector.connect('window-deselected', (selector, window) => {
                    this._onWindowDeselected(window);
                });

                // Connect to skip zone
                this._windowSelector.connect('skip-zone', () => {
                    this._onSkipZone();
                });

                // Connect to cancel
                this._windowSelector.connect('cancelled', () => {
                    this._debug('Window selector cancelled');
                    this._exitSnapMode();
                });

                this._windowSelector.connect('zone-clicked', (selector, zoneIndex) => {
                    this._debug(`Zone clicked: ${zoneIndex}`);
                    this._onZoneClicked(zoneIndex);
                });
            }

            // Show window selector (zone preview is integrated)
            this._windowSelector.show();
        } catch (e) {
            this._debug(`ERROR in _showWindowSelector: ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
            this._exitSnapMode();
        }
    }

    _onWindowSelected(window) {
        this._debug(`=== WINDOW SELECTED START ===`);
        this._debug(`Window selected for snapping: ${window ? window.get_title() : 'null'}`);

        try {
            // Validate window is still valid
            if (!window) {
                this._debug('Selected window is null');
                Main.notify('SnapKit', 'Selected window was closed');
                this._exitSnapMode();
                return;
            }

            // Try to access window properties to verify it's still valid
            try {
                window.get_title();
            } catch (e) {
                this._debug('Selected window is no longer valid (destroyed)');
                Main.notify('SnapKit', 'Selected window was closed');
                this._exitSnapMode();
                return;
            }

            // Get current zone
            const zone = this._snapModeZones[this._snapModeCurrentIndex];
            this._debug(`Current zone index: ${this._snapModeCurrentIndex}`);
            this._debug(`Zone: ${zone ? JSON.stringify({id: zone.id, x: zone.x, y: zone.y, width: zone.width, height: zone.height}) : 'null'}`);
            this._debug(`Layout: ${this._snapModeLayout ? this._snapModeLayout.id : 'null'}`);
            this._debug(`Total zones in layout: ${this._snapModeZones.length}`);

            // Snap the window to the monitor where the overlay was shown
            if (window && this._snapHandler.canSnapWindow(window)) {
                const monitorIndex = this._snapModeMonitor ? this._snapModeMonitor.index : null;
                const layoutId = this._layoutManager.getLayoutId(this._snapModeLayout);
                this._debug(`Monitor: ${this._snapModeMonitor ? `${this._snapModeMonitor.index} (x:${this._snapModeMonitor.x} y:${this._snapModeMonitor.y} w:${this._snapModeMonitor.width} h:${this._snapModeMonitor.height})` : 'null'}`);
                this._debug(`Calling snapWindow with: layoutId=${layoutId}, monitorIndex=${monitorIndex}`);

                const success = this._snapHandler.snapWindow(window, layoutId, zone, monitorIndex);
                this._debug(`Snap result: ${success}`);

                if (success) {
                    // Add window to positioned set
                    this._positionedWindows.add(window);
                    this._debug(`Added window to positioned set, total positioned: ${this._positionedWindows.size}`);

                    // Register with tile manager for resize synchronization
                    if (this._tileManager) {
                        const layoutId = this._layoutManager.getLayoutId(this._snapModeLayout);
                        this._tileManager.registerSnappedWindow(
                            window,
                            layoutId,
                            zone,
                            monitorIndex,
                            this._snapModeLayout
                        );
                        this._debug(`Registered window with tile manager, layoutId: ${layoutId}`);
                    }
                } else {
                    Main.notify('SnapKit', 'Failed to snap window');
                    this._debug('Snap failed - see SnapHandler logs for details');
                }
            } else {
                this._debug(`Window cannot be snapped: window=${!!window}, canSnap=${window ? this._snapHandler.canSnapWindow(window) : false}`);
            }

            // Mark current zone as filled
            const currentZone = this._snapModeZones[this._snapModeCurrentIndex];
            if (currentZone) {
                this._snapModeFilledZones.add(currentZone.id);
                this._debug(`Marked zone ${currentZone.id} as filled (${this._snapModeFilledZones.size}/${this._snapModeZones.length} filled)`);
            }

            // Find next unfilled zone
            const nextUnfilledIndex = this._findNextUnfilledZone();

            if (nextUnfilledIndex !== -1) {
                this._snapModeCurrentIndex = nextUnfilledIndex;
                this._debug(`Moving to next unfilled zone ${this._snapModeCurrentIndex} (${this._snapModeZones[nextUnfilledIndex].id})`);

                // Update zone positioning overlay
                if (this._windowSelector) {
                    this._windowSelector.updateCurrentZone(this._snapModeCurrentIndex, this._snapModeFilledZones);
                }

                // Refresh window selector for next zone (reuse instead of recreate)
                if (this._windowSelector) {
                    this._windowSelector.hide();
                    this._windowSelector.refresh();
                    this._windowSelector.show();
                }

                // Check if there are any unpositioned windows left
                if (!this._hasUnpositionedWindows()) {
                    this._debug('No more unpositioned windows available, exiting SNAP MODE');
                    Main.notify('SnapKit', 'All available windows positioned');
                    this._exitSnapMode();
                }
            } else {
                this._debug(`All ${this._snapModeZones.length} zones filled, exiting SNAP MODE`);
                this._exitSnapMode();
            }
            this._debug(`=== WINDOW SELECTED END ===`);
        } catch (e) {
            this._debug(`ERROR in _onWindowSelected: ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
            this._exitSnapMode();
        }
    }

    _onWindowDeselected(window) {
        this._debug(`=== WINDOW DESELECTED START ===`);
        this._debug(`Window deselected: ${window ? window.get_title() : 'null'}`);

        try {
            // Remove from positioned set
            if (this._positionedWindows.has(window)) {
                this._positionedWindows.delete(window);
                this._debug(`Removed window from positioned set, total positioned: ${this._positionedWindows.size}`);
            }

            // Refresh window selector to update UI
            if (this._windowSelector) {
                this._windowSelector.hide();
                this._windowSelector.refresh();
                this._windowSelector.show();
            }

            this._debug(`=== WINDOW DESELECTED END ===`);
        } catch (e) {
            this._debug(`ERROR in _onWindowDeselected: ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
        }
    }

    _onZoneClicked(zoneIndex) {
        this._debug(`=== ZONE CLICKED ===`);
        this._debug(`Switching to zone ${zoneIndex} from ${this._snapModeCurrentIndex}`);

        if (zoneIndex >= 0 && zoneIndex < this._snapModeZones.length) {
            const zone = this._snapModeZones[zoneIndex];

            // Check if zone is already filled
            if (this._snapModeFilledZones.has(zone.id)) {
                this._debug(`Zone ${zone.id} is already filled, ignoring click`);
                return;
            }

            this._snapModeCurrentIndex = zoneIndex;

            // Update the window selector UI
            if (this._windowSelector) {
                this._windowSelector.updateCurrentZone(zoneIndex, this._snapModeFilledZones);
            }
        }
    }

    /**
     * Find the next unfilled zone index
     * @returns {number} Index of next unfilled zone, or -1 if all filled
     */
    _findNextUnfilledZone() {
        // First, try to find unfilled zones after current index
        for (let i = this._snapModeCurrentIndex + 1; i < this._snapModeZones.length; i++) {
            const zone = this._snapModeZones[i];
            if (!this._snapModeFilledZones.has(zone.id)) {
                return i;
            }
        }

        // Then, wrap around and check from beginning
        for (let i = 0; i < this._snapModeCurrentIndex; i++) {
            const zone = this._snapModeZones[i];
            if (!this._snapModeFilledZones.has(zone.id)) {
                return i;
            }
        }

        // All zones filled
        return -1;
    }

    _onSkipZone() {
        this._debug(`=== SKIP ZONE START ===`);
        this._debug(`Skipping zone ${this._snapModeCurrentIndex}`);

        try {
            // Mark current zone as skipped (treat as filled so we don't come back)
            const currentZone = this._snapModeZones[this._snapModeCurrentIndex];
            if (currentZone) {
                this._snapModeFilledZones.add(currentZone.id);
                this._debug(`Marked zone ${currentZone.id} as skipped`);
            }

            // Find next unfilled zone
            const nextUnfilledIndex = this._findNextUnfilledZone();

            if (nextUnfilledIndex !== -1) {
                this._snapModeCurrentIndex = nextUnfilledIndex;
                this._debug(`Moving to next unfilled zone ${this._snapModeCurrentIndex}`);

                // Update zone positioning overlay
                if (this._windowSelector) {
                    this._windowSelector.updateCurrentZone(this._snapModeCurrentIndex, this._snapModeFilledZones);
                }

                // Refresh window selector for next zone
                if (this._windowSelector) {
                    this._windowSelector.hide();
                    this._windowSelector.refresh();
                    this._windowSelector.show();
                }
            } else {
                this._debug(`All zones processed, exiting SNAP MODE`);
                this._exitSnapMode();
            }

            this._debug(`=== SKIP ZONE END ===`);
        } catch (e) {
            this._debug(`ERROR in _onSkipZone: ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
            this._exitSnapMode();
        }
    }

    _hasUnpositionedWindows() {
        try {
            const workspace = global.workspace_manager.get_active_workspace();
            const windows = workspace.list_windows();

            // Filter to snapable windows that are not already positioned
            const unpositionedWindows = windows.filter(w => {
                return w.window_type === Meta.WindowType.NORMAL &&
                       w.allows_move() &&
                       w.allows_resize() &&
                       !w.is_fullscreen() &&
                       !w.minimized &&
                       !this._positionedWindows.has(w);
            });

            this._debug(`Found ${unpositionedWindows.length} unpositioned windows`);
            return unpositionedWindows.length > 0;
        } catch (e) {
            this._debug(`ERROR in _hasUnpositionedWindows: ${e.message}`);
            return true; // Assume there are windows on error
        }
    }

    /**
     * Get all snappable windows (including minimized, excluding already positioned)
     * @returns {Meta.Window[]}
     */
    _getSnappableWindows() {
        try {
            const workspace = global.workspace_manager.get_active_workspace();
            const windows = workspace.list_windows();

            // Filter to snapable windows (including minimized, excluding already positioned)
            const snappableWindows = windows.filter(w => {
                return w.window_type === Meta.WindowType.NORMAL &&
                       w.allows_move() &&
                       w.allows_resize() &&
                       !w.is_fullscreen() &&
                       !this._positionedWindows.has(w);
            });

            this._debug(`Found ${snappableWindows.length} snappable windows`);
            return snappableWindows;
        } catch (e) {
            this._debug(`ERROR in _getSnappableWindows: ${e.message}`);
            return [];
        }
    }

    _exitSnapMode() {
        this._debug(`Exiting SNAP MODE`);

        try {
            // Clear timeout
            if (this._snapModeTimeoutId) {
                GLib.source_remove(this._snapModeTimeoutId);
                this._snapModeTimeoutId = null;
                this._debug('SNAP MODE timeout cleared');
            }

            // Destroy window selector (includes zone preview)
            if (this._windowSelector) {
                this._windowSelector.hide();
                this._windowSelector.destroy();
                this._windowSelector = null;
                this._debug('Window selector destroyed');
            }

            // Reset SNAP MODE state
            this._snapModeLayout = null;
            this._snapModeZones = [];
            this._snapModeCurrentIndex = 0;
            this._snapModeMonitor = null;
            this._positionedWindows.clear();
            this._debug('SNAP MODE state cleared, positioned windows reset');

            // Return to CLOSED state
            this._transitionToClosed();
        } catch (e) {
            this._debug(`ERROR in _exitSnapMode: ${e.message}`);
            this._debug(`ERROR stack: ${e.stack}`);
            // Force state to CLOSED
            this._overlayState = OverlayState.CLOSED;
        }
    }

    _manageMutterEdgeTiling() {
        if (this._settings.get_boolean('disable-native-edge-tiling')) {
            this._mutterSettings = new Gio.Settings({schema: 'org.gnome.mutter'});
            this._originalEdgeTiling = this._mutterSettings.get_boolean('edge-tiling');

            if (this._originalEdgeTiling) {
                this._debug('Disabling native GNOME edge tiling');
                this._mutterSettings.set_boolean('edge-tiling', false);
            }
        }
    }

    _restoreMutterEdgeTiling() {
        if (this._mutterSettings && this._originalEdgeTiling !== null) {
            this._debug('Restoring native GNOME edge tiling');
            this._mutterSettings.set_boolean('edge-tiling', this._originalEdgeTiling);
            this._originalEdgeTiling = null;
        }
    }
}
