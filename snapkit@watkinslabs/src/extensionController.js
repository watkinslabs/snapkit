/**
 * ExtensionController - Main controller orchestrating all systems
 *
 * Responsibilities:
 * - Initialize ServiceContainer with all services
 * - Wire EventBus events from all layers
 * - Coordinate state transitions
 * - Handle all request events from interaction layer
 * - Manage lifecycle (enable/disable/destroy)
 * - Load/save settings via GSettings
 *
 * This is the main integration point that brings all layers together.
 */

import { Logger } from './core/logger.js';
import { ServiceContainer } from './core/serviceContainer.js';
import { ComponentManager } from './core/componentManager.js';
import { EventBus } from './core/eventBus.js';
import { registerServices } from './app/dependencyGraph.js';
import { initializeComponents } from './app/componentLifecycle.js';
import { wireEventHandlers } from './app/eventSubscriptions.js';
import { initializeSettings, hasSettingsKey } from './app/settingsLifecycle.js';
import { State } from './state/extensionState.js';
import { KeybindingManager } from './interaction/keybindingManager.js';

import Meta from 'gi://Meta';

export class ExtensionController {
    constructor() {
        this._logger = new Logger('ExtensionController');

        // Core systems
        this._serviceContainer = null;
        this._componentManager = null;
        this._eventBus = null;
        this._settings = null;
        this._keybindingManager = null;

        // State
        this._enabled = false;
        this._eventSubscriptions = [];
        this._missingSettingsKeys = new Set();
        this._settingsSignalIds = [];
    }

    /**
     * Initialize extension
     */
    initialize() {
        if (this._enabled) {
            this._logger.warn('Already initialized');
            return;
        }

        try {
            this._logger.info('Initializing SnapKit extension');

            // Create GSettings
            this._initializeSettings();

            // Create core systems
            this._serviceContainer = new ServiceContainer();
            this._componentManager = new ComponentManager();
            this._eventBus = new EventBus();

            // Register services
            this._registerServices();

            // Initialize components
            this._initializeComponents();

            // Initialize global keybindings (requires EventBus and Settings)
            this._initializeKeybindings();

            // Wire event handlers
            this._wireEventHandlers();

            // Load settings (placeholder - will use GSettings in production)
            this._loadSettings();

            this._enabled = true;
            this._logger.info('SnapKit extension initialized successfully');
        } catch (error) {
            this._logger.error('Failed to initialize extension', { error });
            this.destroy();
            throw error;
        }
    }

    /**
     * Initialize GSettings
     * @private
     */
    _initializeSettings() {
        initializeSettings(this);
    }

    /**
     * Check whether the loaded settings schema exposes a key.
     * @private
     * @param {string} key
     * @returns {boolean}
     */
    _hasSettingsKey(key) {
        return hasSettingsKey(this, key);
    }

    /**
     * Initialize global keybindings
     * @private
     */
    _initializeKeybindings() {
        if (!this._settings) {
            this._logger.warn('No settings available, skipping keybindings');
            return;
        }

        try {
            this._keybindingManager = new KeybindingManager(this._eventBus, this._settings);
            this._keybindingManager.initialize();
            this._logger.debug('Keybindings initialized');
        } catch (error) {
            this._logger.error('Failed to initialize keybindings', { error });
        }
    }

    /**
     * Register all services in DI container
     * @private
     */
    _registerServices() {
        registerServices(this);
    }

    /**
     * Initialize components
     * @private
     */
    _initializeComponents() {
        initializeComponents(this);
    }

    /**
     * Wire event handlers
     * @private
     */
    _wireEventHandlers() {
        wireEventHandlers(this);
    }

    /**
     * Resolve the configured default layout ID with safety fallbacks.
     * @private
     * @returns {string|null}
     */
    _getConfiguredDefaultLayoutId() {
        const layoutManager = this._serviceContainer.get('layoutManager');
        const configuredDefault = this._settings?.get_string('default-layout') || null;

        if (configuredDefault && layoutManager.hasLayout(configuredDefault)) {
            return configuredDefault;
        }

        if (configuredDefault) {
            this._logger.warn('Configured default layout is unavailable, using fallback', {
                layoutId: configuredDefault
            });
        }

        if (layoutManager.hasLayout('grid-2x2')) {
            return 'grid-2x2';
        }
        if (layoutManager.hasLayout('half-split')) {
            return 'half-split';
        }

        const firstLayoutId = layoutManager.getAllLayouts()?.[0]?.id || null;
        return firstLayoutId;
    }

    /**
     * Resolve monitor layout, falling back to configured default when needed.
     * @private
     * @param {number} monitorIndex
     * @returns {string|null}
     */
    _resolveLayoutIdForMonitor(monitorIndex) {
        const layoutState = this._serviceContainer.get('layoutState');
        const layoutManager = this._serviceContainer.get('layoutManager');
        const monitorLayoutId = layoutState.getLayoutForMonitor(monitorIndex);

        if (monitorLayoutId && layoutManager.hasLayout(monitorLayoutId)) {
            return monitorLayoutId;
        }

        if (monitorLayoutId) {
            this._logger.warn('Per-monitor layout is unavailable, using default layout', {
                monitorIndex,
                layoutId: monitorLayoutId
            });
        }

        return this._getConfiguredDefaultLayoutId();
    }

    /**
     * Handle open overlay request
     * @private
     * @param {Object} data
     */
    _handleOpenOverlay(data) {
        const { monitorIndex, pinnedOpen = false } = data;
        const extensionState = this._serviceContainer.get('extensionState');
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');

        // Transition to OPEN only from CLOSED. During drag we can display picker without state transition.
        if (extensionState.current === State.CLOSED && extensionState.canTransitionTo(State.OPEN)) {
            extensionState.transitionTo(State.OPEN);
        }

        const activeLayoutId = this._resolveLayoutIdForMonitor(monitorIndex);
        if (!activeLayoutId) {
            this._logger.warn('No layout available to open picker', { monitorIndex });
            return;
        }

        // Show the layout picker bar (Windows 11 style)
        layoutPickerBar.show(monitorIndex, { pinnedOpen, activeLayoutId });

        this._logger.debug('Layout picker bar opened', { monitorIndex });
    }

    /**
     * Handle close overlay request
     * @private
     */
    _handleCloseOverlay() {
        const extensionState = this._serviceContainer.get('extensionState');
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');

        // Hide layout picker bar
        layoutPickerBar.hide();

        // Transition to CLOSED
        extensionState.transitionTo(State.CLOSED);

        this._logger.debug('Layout picker bar closed');
    }

    /**
     * Handle snap preview request
     * @private
     * @param {Object} data
     */
    _handleSnapPreview(data) {
        const { monitorIndex, window } = data;
        const snapPreviewOverlay = this._serviceContainer.get('snapPreviewOverlay');
        const layoutManager = this._serviceContainer.get('layoutManager');
        const overrideStore = this._serviceContainer.get('overrideStore');

        // Resolve layout for monitor with configured default fallback.
        const layoutId = this._resolveLayoutIdForMonitor(monitorIndex);
        if (!layoutId) {
            this._logger.error('No layout available for snap preview', { monitorIndex });
            return;
        }

        const layout = layoutManager.getLayout(layoutId);

        if (!layout) {
            this._logger.error('Layout not found for snap preview', { layoutId, monitorIndex });
            return;
        }

        // Get any divider overrides for this layout/monitor
        const overrides = overrideStore.getOverrides(layoutId, monitorIndex);

        // Show snap preview with overrides and window for size validation
        snapPreviewOverlay.showPreview(monitorIndex, layout, { overrides, window });

        this._logger.debug('Snap preview shown', { monitorIndex, layoutId, overrideCount: overrides.length });
    }

    /**
     * Handle update snap preview
     * @private
     * @param {Object} data
     */
    _handleUpdateSnapPreview(data) {
        const { position, zonesActive = true } = data;
        const snapPreviewOverlay = this._serviceContainer.get('snapPreviewOverlay');
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');

        if (!zonesActive) {
            snapPreviewOverlay.hide();
            layoutPickerBar.hide();
            return;
        }

        if (!position) {
            return;
        }

        // Update highlighted zone based on cursor position
        snapPreviewOverlay.highlightZoneAtCursor(position.x, position.y);
        layoutPickerBar.highlightZoneAtCursor(position.x, position.y);
    }

    /**
     * Handle snap to zone request
     * @private
     * @param {Object} data
     */
    _handleSnapToZone(data) {
        const { window, position, monitorIndex, zonesActive = true } = data;
        const snapPreviewOverlay = this._serviceContainer.get('snapPreviewOverlay');
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');
        const layoutState = this._serviceContainer.get('layoutState');
        const layoutManager = this._serviceContainer.get('layoutManager');
        const overrideStore = this._serviceContainer.get('overrideStore');
        const snapHandler = this._serviceContainer.get('snapHandler');
        const windowTracker = this._serviceContainer.get('windowTracker');

        if (!position || typeof monitorIndex !== 'number') {
            this._logger.warn('Invalid drag drop payload for snap-to-zone', {
                hasWindow: !!window,
                position,
                monitorIndex
            });
            snapPreviewOverlay.hide();
            layoutPickerBar.hide();
            return;
        }

        // Resolve drop target from layout picker first (works during active drag),
        // then fallback to preview highlight.
        const hoveredZone = zonesActive ? layoutPickerBar.highlightZoneAtCursor(position.x, position.y) : null;
        const previewZoneIndex = zonesActive ? snapPreviewOverlay.highlightZoneAtCursor(position.x, position.y) : null;
        const zoneIndex = hoveredZone?.zoneIndex ?? previewZoneIndex;

        const debugDropBase = {
            event: 'request-snap-to-zone',
            monitorIndex,
            position: { x: position.x, y: position.y },
            zonesActive,
            previewZoneIndex,
            hoveredZoneIndex: hoveredZone?.zoneIndex ?? null,
            hoveredLayoutId: hoveredZone?.layoutData?.id ?? null,
            draggedWindowTitle: window?.get_title?.() ?? 'unknown'
        };

        if (zoneIndex === null || zoneIndex === undefined) {
            const trackedInfo = windowTracker.getWindowInfo(window);
            const wasUntracked = trackedInfo
                ? windowTracker.untrackWindow(window, { restore: this._shouldRestoreOnUnsnap() })
                : false;

            this._emitDropDebugSnapshot(
                wasUntracked ? 'rejected-no-zone-unsnapped' : 'rejected-no-zone',
                {
                    ...debugDropBase,
                    resolvedLayoutId: trackedInfo?.layoutId ?? null,
                    sourceZoneIndex: trackedInfo?.zoneIndex ?? null,
                    targetZoneIndex: null
                },
                windowTracker,
                monitorIndex
            );

            if (wasUntracked) {
                this._logger.info('Window unsnapped after drop outside zones', {
                    monitorIndex: trackedInfo.monitorIndex,
                    layoutId: trackedInfo.layoutId,
                    zoneIndex: trackedInfo.zoneIndex,
                    windowTitle: window?.get_title?.() ?? 'unknown'
                });
            }

            // No zone under cursor, hide preview
            snapPreviewOverlay.hide();
            layoutPickerBar.hide();
            return;
        }

        // Use hovered template layout when available.
        const layoutId = hoveredZone?.layoutData?.id ||
            this._resolveLayoutIdForMonitor(monitorIndex);
        if (!layoutId) {
            this._logger.error('No layout available for snap', { monitorIndex, zoneIndex });
            snapPreviewOverlay.hide();
            layoutPickerBar.hide();
            return;
        }
        const layout = layoutManager.getLayout(layoutId);

        if (!layout) {
            this._emitDropDebugSnapshot(
                'rejected-missing-layout',
                { ...debugDropBase, resolvedLayoutId: layoutId, sourceZoneIndex: null, targetZoneIndex: zoneIndex },
                windowTracker,
                monitorIndex
            );

            this._logger.error('Layout not found for snap', { layoutId, monitorIndex });
            snapPreviewOverlay.hide();
            return;
        }

        // Get divider overrides
        const overrides = overrideStore.getOverrides(layoutId, monitorIndex);

        const zones = snapHandler.getZoneRects(monitorIndex, layout, { overrides }) || [];
        const trackedInfo = windowTracker.getWindowInfo(window);
        const sourceZoneIndex = trackedInfo &&
            trackedInfo.monitorIndex === monitorIndex &&
            trackedInfo.layoutId === layoutId
            ? trackedInfo.zoneIndex
            : null;

        this._emitDropDebugSnapshot(
            'before-snap',
            {
                ...debugDropBase,
                resolvedLayoutId: layoutId,
                sourceZoneIndex,
                targetZoneIndex: zoneIndex
            },
            windowTracker,
            monitorIndex
        );

        const snapped = hoveredZone
            ? this._populateLayoutFromDrop(
                window,
                monitorIndex,
                layoutId,
                zoneIndex,
                layout,
                zones,
                { overrides }
            )
            : this._assignWindowToZoneNonIntrusive(
                window,
                monitorIndex,
                layoutId,
                zoneIndex,
                layout,
                zones,
                { overrides },
                sourceZoneIndex
            );

        if (!snapped) {
            this._emitDropDebugSnapshot(
                'snap-failed',
                {
                    ...debugDropBase,
                    resolvedLayoutId: layoutId,
                    sourceZoneIndex,
                    targetZoneIndex: zoneIndex
                },
                windowTracker,
                monitorIndex
            );

            this._logger.warn('Failed to snap window via drag drop', {
                monitorIndex,
                layoutId,
                zoneIndex
            });
            snapPreviewOverlay.hide();
            layoutPickerBar.hide();
            return;
        }

        // Remember layout for this monitor
        layoutState.setLayoutForMonitor(monitorIndex, layoutId);
        this._saveLayoutState();

        this._emitDropDebugSnapshot(
            'snap-succeeded',
            {
                ...debugDropBase,
                resolvedLayoutId: layoutId,
                sourceZoneIndex,
                targetZoneIndex: zoneIndex
            },
            windowTracker,
            monitorIndex
        );

        // Hide preview
        snapPreviewOverlay.hide();
        layoutPickerBar.hide();

        this._logger.debug('Window snapped via drag', { zoneIndex, monitorIndex, layoutId });
    }

    /**
     * Build a serializable snapshot of tracked windows and zone attachments.
     * @private
     * @param {WindowTracker} windowTracker
     * @param {number} monitorIndex
     * @returns {Object[]}
     */
    _buildTrackedWindowSnapshot(windowTracker, monitorIndex) {
        return windowTracker.getWindowsOnMonitor(monitorIndex).map(window => {
            const info = windowTracker.getWindowInfo(window);
            let rect = null;
            let title = 'unknown';
            let wmClass = 'unknown';

            try {
                const frameRect = window.get_frame_rect();
                rect = {
                    x: frameRect.x,
                    y: frameRect.y,
                    width: frameRect.width,
                    height: frameRect.height
                };
                title = window.get_title();
                wmClass = window.get_wm_class();
            } catch (_error) {
                // Keep partial snapshot data for windows destroyed mid-capture.
            }

            return {
                title,
                wmClass,
                monitorIndex: info?.monitorIndex ?? null,
                layoutId: info?.layoutId ?? null,
                zoneIndex: info?.zoneIndex ?? null,
                rect
            };
        });
    }

    /**
     * Emit/log a structured drop snapshot for debugging.
     * @private
     * @param {string} stage
     * @param {Object} details
     * @param {WindowTracker} windowTracker
     * @param {number} monitorIndex
     */
    _emitDropDebugSnapshot(stage, details, windowTracker, monitorIndex) {
        const payload = {
            stage,
            ...details,
            trackedWindows: this._buildTrackedWindowSnapshot(windowTracker, monitorIndex)
        };

        this._logger.info('Drop debug snapshot', payload);
    }

    /**
     * Non-intrusive zone assignment for main-screen drop:
     * keep existing snapped windows in place except explicit swap/displacement.
     * @private
     */
    _assignWindowToZoneNonIntrusive(window, monitorIndex, layoutId, targetZoneIndex, layout, zones, options, sourceZoneIndex = null) {
        const snapHandler = this._serviceContainer.get('snapHandler');
        const windowTracker = this._serviceContainer.get('windowTracker');

        const zoneIndices = zones.map(z => z.zoneIndex).sort((a, b) => a - b);
        if (!zoneIndices.includes(targetZoneIndex)) {
            return false;
        }

        const targetOccupant = windowTracker.getWindowInZone(monitorIndex, layoutId, targetZoneIndex);
        const hasSourceZone = sourceZoneIndex !== null && sourceZoneIndex !== undefined &&
            zoneIndices.includes(sourceZoneIndex);

        // Same-layout move: strict swap with target occupant; no other windows move.
        if (hasSourceZone) {
            if (targetOccupant && targetOccupant !== window) {
                const swapped = snapHandler.snapToZone(
                    targetOccupant,
                    monitorIndex,
                    layoutId,
                    sourceZoneIndex,
                    layout,
                    options
                );
                if (!swapped) {
                    return false;
                }
            }

            return snapHandler.snapToZone(
                window,
                monitorIndex,
                layoutId,
                targetZoneIndex,
                layout,
                options
            );
        }

        // Unsnapped/incoming move: preserve snapped windows; only displace target if there is free capacity.
        if (targetOccupant && targetOccupant !== window) {
            const freeZone = zoneIndices.find(i => !windowTracker.getWindowInZone(monitorIndex, layoutId, i));
            if (freeZone === undefined) {
                // Layout full and no swap source available; don't reshuffle existing snapped windows.
                return false;
            }

            const displaced = snapHandler.snapToZone(
                targetOccupant,
                monitorIndex,
                layoutId,
                freeZone,
                layout,
                options
            );
            if (!displaced) {
                return false;
            }
        }

        return snapHandler.snapToZone(
            window,
            monitorIndex,
            layoutId,
            targetZoneIndex,
            layout,
            options
        );
    }

    /**
     * Populate dropped layout zones with priority:
     * 1) dragged window, 2) snapped windows, 3) other windows.
     * @private
     */
    _populateLayoutFromDrop(draggedWindow, monitorIndex, layoutId, targetZoneIndex, layout, zones, options) {
        const snapHandler = this._serviceContainer.get('snapHandler');
        const windowTracker = this._serviceContainer.get('windowTracker');
        const monitorManager = this._serviceContainer.get('monitorManager');

        const zoneIndices = zones.map(z => z.zoneIndex).sort((a, b) => a - b);
        if (!zoneIndices.includes(targetZoneIndex)) {
            return false;
        }

        // Same-layout drag into an occupied zone must be a strict swap.
        const draggedInfo = windowTracker.getWindowInfo(draggedWindow);
        const sourceZoneIndex = draggedInfo &&
            draggedInfo.monitorIndex === monitorIndex &&
            draggedInfo.layoutId === layoutId &&
            zoneIndices.includes(draggedInfo.zoneIndex)
            ? draggedInfo.zoneIndex
            : null;

        const targetOccupant = windowTracker.getWindowInZone(monitorIndex, layoutId, targetZoneIndex);
        if (sourceZoneIndex !== null &&
            sourceZoneIndex !== targetZoneIndex &&
            targetOccupant &&
            targetOccupant !== draggedWindow) {
            const swapped = snapHandler.snapToZone(
                targetOccupant,
                monitorIndex,
                layoutId,
                sourceZoneIndex,
                layout,
                options
            );
            if (!swapped) {
                return false;
            }

            return snapHandler.snapToZone(
                draggedWindow,
                monitorIndex,
                layoutId,
                targetZoneIndex,
                layout,
                options
            );
        }

        const zoneOrder = [targetZoneIndex, ...this._rotationOrder(zoneIndices, targetZoneIndex)];

        // 1) Already-snapped windows on this monitor (excluding dragged), stable by previous zone/timestamp.
        const snappedCandidates = windowTracker
            .getWindowsOnMonitor(monitorIndex)
            .filter(w => w !== draggedWindow && this._isSnappableWindow(w))
            .sort((a, b) => {
                const ai = windowTracker.getWindowInfo(a);
                const bi = windowTracker.getWindowInfo(b);
                if (!ai || !bi) return 0;
                if (ai.layoutId === bi.layoutId) {
                    return ai.zoneIndex - bi.zoneIndex;
                }
                return ai.timestamp - bi.timestamp;
            });

        // 2) Other regular windows on this monitor not currently snapped.
        const snappedSet = new Set(snappedCandidates);
        const otherCandidates = global.get_window_actors()
            .map(a => a.get_meta_window())
            .filter(w => w &&
                w !== draggedWindow &&
                !snappedSet.has(w) &&
                this._isSnappableWindow(w) &&
                !windowTracker.isWindowTracked(w) &&
                this._getWindowMonitorIndex(w, monitorManager) === monitorIndex);

        const candidates = [draggedWindow, ...snappedCandidates, ...otherCandidates];
        const maxAssignments = Math.min(zoneOrder.length, candidates.length);
        const assigned = new Set();

        for (let i = 0; i < maxAssignments; i++) {
            const win = candidates[i];
            const zone = zoneOrder[i];
            const ok = snapHandler.snapToZone(win, monitorIndex, layoutId, zone, layout, options);
            if (!ok) {
                return false;
            }
            assigned.add(win);
        }

        // Untrack previously snapped windows on this monitor that no longer fit in zone count.
        for (const tracked of windowTracker.getWindowsOnMonitor(monitorIndex)) {
            if (!assigned.has(tracked)) {
                windowTracker.untrackWindow(tracked, { restore: this._shouldRestoreOnUnsnap() });
            }
        }

        return true;
    }

    /**
     * Get monitor index for a window by its center point.
     * @private
     */
    _getWindowMonitorIndex(window, monitorManager) {
        try {
            const rect = window.get_frame_rect();
            return monitorManager.getMonitorAtPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2
            );
        } catch (_e) {
            return -1;
        }
    }

    /**
     * Check if window is eligible for snapping.
     * @private
     */
    _isSnappableWindow(window) {
        try {
            if (!window) {
                return false;
            }
            if (window.get_window_type() !== Meta.WindowType.NORMAL) {
                return false;
            }
            if (window.is_skip_taskbar() || window.is_override_redirect()) {
                return false;
            }
            return true;
        } catch (_e) {
            return false;
        }
    }

    /**
     * Handle snap preview cancellation (e.g., shake gesture)
     * @private
     * @param {Object} data
     */
    _handleCancelSnapPreview(data) {
        const snapPreviewOverlay = this._serviceContainer.get('snapPreviewOverlay');
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');
        const extensionState = this._serviceContainer.get('extensionState');
        const windowTracker = this._serviceContainer.get('windowTracker');
        const reason = data?.reason || 'unknown';

        // Hide any active preview
        snapPreviewOverlay.hide();
        layoutPickerBar.hide();

        if (reason === 'shake' && data?.window) {
            const wasTracked = windowTracker.untrackWindow(
                data.window,
                { restore: this._shouldRestoreOnUnsnap() }
            );
            if (wasTracked) {
                this._logger.info('Window unsnapped after shake cancel', {
                    windowTitle: data.window?.get_title?.() ?? 'unknown',
                    monitorIndex: data?.monitorIndex ?? null
                });
            }
        }

        // Transition back to CLOSED if possible
        if (extensionState.current !== State.CLOSED && extensionState.canTransitionTo(State.CLOSED)) {
            try {
                extensionState.transitionTo(State.CLOSED);
            } catch (error) {
                this._logger.warn('Failed to transition to CLOSED after snap cancel', { error });
            }
        }

        this._logger.info('Snap preview cancelled', { reason });
    }

    /**
     * Handle cancel request
     * @private
     */
    _handleCancel() {
        const extensionState = this._serviceContainer.get('extensionState');
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');

        // Handle based on current state
        switch (extensionState.current) {
            case State.OPEN:
                layoutPickerBar.hide();
                extensionState.transitionTo(State.CLOSED);
                break;

            case State.SELECT_WINDOW:
                // Cancel window selection
                const windowSelector = this._serviceContainer.get('windowSelector');
                windowSelector.cancel();
                extensionState.transitionTo(State.CLOSED);
                break;

            case State.DRAG_MODE:
                // Already handled by drag detector
                break;
        }
    }

    /**
     * Handle zone navigation
     * @private
     * @param {Object} data
     */
    _handleZoneNavigation(data) {
        const { direction } = data;
        const layoutOverlay = this._serviceContainer.get('layoutOverlay');

        // Forward navigation to overlay
        // In a full implementation, layoutOverlay would handle this
        this._logger.debug('Zone navigation', { direction });
    }

    /**
     * Handle zone select
     * @private
     */
    _handleZoneSelect() {
        const extensionState = this._serviceContainer.get('extensionState');
        const layoutOverlay = this._serviceContainer.get('layoutOverlay');

        // Get current zone from overlay (simplified)
        // In full implementation, would get selected zone index

        // Transition to SELECT_WINDOW state
        extensionState.transitionTo(State.SELECT_WINDOW);

        // Show window selector
        const windowSelector = this._serviceContainer.get('windowSelector');
        windowSelector.show();

        this._logger.debug('Zone selected, showing window selector');
    }

    /**
     * Handle direct zone select
     * @private
     * @param {Object} data
     */
    _handleDirectZoneSelect(data) {
        const { zoneIndex } = data;

        // Similar to zone select but with specific zone
        this._handleZoneSelect();

        this._logger.debug('Direct zone selected', { zoneIndex });
    }

    /**
     * Handle zone selected from overlay
     * @private
     * @param {Object} data
     */
    _handleZoneSelected(data) {
        const { zoneIndex } = data;

        // Transition to window selection
        this._handleZoneSelect();
    }

    /**
     * Handle window selected
     * @private
     * @param {Object} data
     */
    _handleWindowSelected(data) {
        const { window } = data;
        const extensionState = this._serviceContainer.get('extensionState');
        const interactiveSelectState = this._serviceContainer.get('interactiveSelectState');

        // Get zone from interactive select state
        const zoneIndex = interactiveSelectState.getSelectedZone();
        const monitorIndex = interactiveSelectState.getMonitor();
        const layoutId = interactiveSelectState.getLayoutId();

        if (zoneIndex === null || monitorIndex === null || layoutId === null) {
            this._logger.warn('Invalid interactive select state');
            extensionState.transitionTo(State.CLOSED);
            return;
        }

        // Get layout
        const layoutManager = this._serviceContainer.get('layoutManager');
        const layout = layoutManager.getLayout(layoutId);

        if (!layout) {
            extensionState.transitionTo(State.CLOSED);
            return;
        }

        // Snap window
        const snapHandler = this._serviceContainer.get('snapHandler');
        snapHandler.snapToZone(window, monitorIndex, layoutId, zoneIndex, layout);

        // Close overlay and transition to CLOSED
        const layoutOverlay = this._serviceContainer.get('layoutOverlay');
        layoutOverlay.hide();
        extensionState.transitionTo(State.CLOSED);

        this._logger.debug('Window selected and snapped', { zoneIndex });
    }

    /**
     * Handle layout picker hidden
     * @private
     */
    _handleLayoutPickerHidden() {
        const extensionState = this._serviceContainer.get('extensionState');
        const layoutState = this._serviceContainer.get('layoutState');

        // Transition to CLOSED if still OPEN
        if (extensionState.current === State.OPEN) {
            extensionState.transitionTo(State.CLOSED);
        }

        this._logger.debug('Layout picker hidden, state closed');
    }

    /**
     * Handle zone snapped event from layout picker
     * @private
     * @param {Object} data
     */
    _handleZoneSnapped(data) {
        const { layoutId, zoneIndex, monitorIndex, window } = data;
        const layoutState = this._serviceContainer.get('layoutState');

        // Update layout state for this monitor - this is critical for drag/snap to work
        layoutState.setLayoutForMonitor(monitorIndex, layoutId);

        // Verify the layout was set
        const verifyLayoutId = layoutState.getLayoutForMonitor(monitorIndex);

        this._logger.info('Zone snapped via picker - layout set for monitor', {
            layoutId,
            verifyLayoutId,
            zoneIndex,
            monitorIndex,
            windowTitle: window?.get_title()
        });

        // Persist per-monitor layout selection
        this._saveLayoutState();
    }

    /**
     * Handle zone snap request from picker UI using centralized occupancy policy.
     * @private
     * @param {Object} data
     */
    _handleRequestZoneSnap(data) {
        const { layoutId, zoneIndex, monitorIndex, window } = data;
        if (!window || typeof zoneIndex !== 'number' || typeof monitorIndex !== 'number' || !layoutId) {
            this._logger.warn('Invalid zone snap request payload', { layoutId, zoneIndex, monitorIndex });
            return;
        }

        const layoutManager = this._serviceContainer.get('layoutManager');
        const snapHandler = this._serviceContainer.get('snapHandler');
        const windowTracker = this._serviceContainer.get('windowTracker');
        const overrideStore = this._serviceContainer.get('overrideStore');

        const layout = layoutManager.getLayout(layoutId);
        if (!layout) {
            this._logger.warn('Zone snap request failed: layout not found', { layoutId, monitorIndex, zoneIndex });
            return;
        }

        const overrides = overrideStore.getOverrides(layoutId, monitorIndex);
        const zones = snapHandler.getZoneRects(monitorIndex, layout, { overrides }) || [];

        const trackedInfo = windowTracker.getWindowInfo(window);
        const sourceInTargetLayout = trackedInfo &&
            trackedInfo.monitorIndex === monitorIndex &&
            trackedInfo.layoutId === layoutId;
        const sourceZoneIndex = sourceInTargetLayout ? trackedInfo.zoneIndex : null;

        const useLayoutPopulateFlow = !sourceInTargetLayout;

        this._emitDropDebugSnapshot(
            'picker-before-snap',
            {
                event: 'request-zone-snap',
                monitorIndex,
                draggedWindowTitle: window?.get_title?.() ?? 'unknown',
                resolvedLayoutId: layoutId,
                sourceZoneIndex,
                targetZoneIndex: zoneIndex,
                flow: useLayoutPopulateFlow ? 'populate-layout' : 'zone-policy'
            },
            windowTracker,
            monitorIndex
        );

        const snapped = useLayoutPopulateFlow
            ? this._populateLayoutFromDrop(
                window,
                monitorIndex,
                layoutId,
                zoneIndex,
                layout,
                zones,
                { overrides }
            )
            : this._assignWindowToZoneWithPolicy(
                window,
                monitorIndex,
                layoutId,
                zoneIndex,
                layout,
                zones,
                { overrides },
                sourceZoneIndex
            );

        if (!snapped) {
            this._emitDropDebugSnapshot(
                'picker-snap-failed',
                {
                    event: 'request-zone-snap',
                    monitorIndex,
                    draggedWindowTitle: window?.get_title?.() ?? 'unknown',
                    resolvedLayoutId: layoutId,
                    sourceZoneIndex,
                    targetZoneIndex: zoneIndex,
                    flow: useLayoutPopulateFlow ? 'populate-layout' : 'zone-policy'
                },
                windowTracker,
                monitorIndex
            );
            this._logger.warn('Zone snap request failed via policy', { layoutId, monitorIndex, zoneIndex });
            return;
        }

        this._emitDropDebugSnapshot(
            'picker-snap-succeeded',
            {
                event: 'request-zone-snap',
                monitorIndex,
                draggedWindowTitle: window?.get_title?.() ?? 'unknown',
                resolvedLayoutId: layoutId,
                sourceZoneIndex,
                targetZoneIndex: zoneIndex,
                flow: useLayoutPopulateFlow ? 'populate-layout' : 'zone-policy'
            },
            windowTracker,
            monitorIndex
        );

        this._eventBus.emit('zone-snapped', {
            layoutId,
            zoneIndex,
            monitorIndex,
            window
        });
    }

    /**
     * Handle layout switched
     * @private
     * @param {Object} data
     */
    _handleLayoutSwitched(data) {
        const { layoutId, monitorIndex } = data;
        const layoutState = this._serviceContainer.get('layoutState');
        const tileManager = this._serviceContainer.get('tileManager');
        const layoutManager = this._serviceContainer.get('layoutManager');

        // Update layout state
        layoutState.setLayoutForMonitor(monitorIndex, layoutId);
        this._saveLayoutState();

        // Get layout
        const layout = layoutManager.getLayout(layoutId);
        if (!layout) {
            return;
        }

        // Re-snap all windows in this layout
        tileManager.resnapLayout(monitorIndex, layoutId, layout);

        this._logger.info('Layout switched', { monitorIndex, layoutId });
    }

    /**
     * Handle keyboard snap window (global keybinding)
     * @private
     * @param {Object} data - {window, layoutId, zoneIndex}
     */
    _handleKeyboardSnapWindow(data) {
        const { window, layoutId, zoneIndex } = data;

        if (!window) {
            this._logger.debug('No window for keyboard snap');
            return;
        }

        const layoutManager = this._serviceContainer.get('layoutManager');
        const snapHandler = this._serviceContainer.get('snapHandler');
        const monitorManager = this._serviceContainer.get('monitorManager');
        const layoutState = this._serviceContainer.get('layoutState');
        const overrideStore = this._serviceContainer.get('overrideStore');

        // Get the layout
        const layout = layoutManager.getLayout(layoutId);
        if (!layout) {
            this._logger.error('Layout not found for keyboard snap', { layoutId });
            return;
        }

        // Get monitor for the window
        const rect = window.get_frame_rect();
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        const monitorIndex = monitorManager.getMonitorAtPoint(centerX, centerY);

        // Get divider overrides
        const overrides = overrideStore.getOverrides(layoutId, monitorIndex);

        // Snap the window
        snapHandler.snapToZone(window, monitorIndex, layoutId, zoneIndex, layout, { overrides });

        // Update layout state
        layoutState.setLayoutForMonitor(monitorIndex, layoutId);
        this._saveLayoutState();

        this._logger.info('Window snapped via keyboard', {
            layoutId,
            zoneIndex,
            monitorIndex,
            windowTitle: window.get_title()
        });
    }

    /**
     * Handle keyboard cycle layout (global keybinding)
     * @private
     */
    _handleKeyboardCycleLayout() {
        const layoutManager = this._serviceContainer.get('layoutManager');
        const layoutState = this._serviceContainer.get('layoutState');
        const monitorManager = this._serviceContainer.get('monitorManager');
        const snapHandler = this._serviceContainer.get('snapHandler');
        const overrideStore = this._serviceContainer.get('overrideStore');

        // Get focused window to determine monitor
        const focusedWindow = global.display.focus_window;
        let monitorIndex = 0;

        if (focusedWindow) {
            const rect = focusedWindow.get_frame_rect();
            const centerX = rect.x + rect.width / 2;
            const centerY = rect.y + rect.height / 2;
            monitorIndex = monitorManager.getMonitorAtPoint(centerX, centerY);
        } else {
            monitorIndex = monitorManager.getPrimaryMonitorIndex();
        }

        // Get all layouts - getAllLayouts returns an array of layout objects
        const allLayouts = layoutManager.getAllLayouts();
        const layoutIds = allLayouts.map(l => l.id);

        if (layoutIds.length === 0) {
            this._logger.warn('No layouts available to cycle');
            return;
        }

        // Get current layout for monitor
        const currentLayoutId = layoutState.getLayoutForMonitor(monitorIndex) || layoutIds[0];

        // Find next layout
        const currentIndex = layoutIds.indexOf(currentLayoutId);
        const nextIndex = (currentIndex + 1) % layoutIds.length;
        const nextLayoutId = layoutIds[nextIndex];

        // Get the next layout
        const nextLayout = layoutManager.getLayout(nextLayoutId);
        if (!nextLayout) {
            this._logger.error('Next layout not found', { nextLayoutId });
            return;
        }

        // Update layout state
        layoutState.setLayoutForMonitor(monitorIndex, nextLayoutId);
        this._saveLayoutState();

        // Get overrides for new layout
        const overrides = overrideStore.getOverrides(nextLayoutId, monitorIndex);

        // Re-snap windows using snapHandler
        snapHandler.resnapLayout(monitorIndex, nextLayoutId, nextLayout, { overrides });

        this._logger.info('Layout cycled via keyboard', {
            fromLayout: currentLayoutId,
            toLayout: nextLayoutId,
            monitorIndex
        });
    }

    /**
     * Handle keyboard move window between zones.
     * @private
     * @param {Object} data - {window, command}
     */
    _handleKeyboardMoveWindowZone(data) {
        const command = data?.command;
        const window = data?.window || global.display.focus_window;
        if (!window || !command) {
            return;
        }

        const layoutManager = this._serviceContainer.get('layoutManager');
        const layoutState = this._serviceContainer.get('layoutState');
        const monitorManager = this._serviceContainer.get('monitorManager');
        const snapHandler = this._serviceContainer.get('snapHandler');
        const overrideStore = this._serviceContainer.get('overrideStore');
        const windowTracker = this._serviceContainer.get('windowTracker');

        const rect = window.get_frame_rect();
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        const detectedMonitorIndex = monitorManager.getMonitorAtPoint(centerX, centerY);
        const monitorIndex = detectedMonitorIndex !== -1
            ? detectedMonitorIndex
            : monitorManager.getPrimaryMonitorIndex();

        const trackedInfo = windowTracker.getWindowInfo(window);
        const trackedInMonitor = trackedInfo && trackedInfo.monitorIndex === monitorIndex;
        const trackedLayoutId = trackedInMonitor && trackedInfo?.layoutId &&
            layoutManager.hasLayout(trackedInfo.layoutId)
            ? trackedInfo.layoutId
            : null;
        if (trackedInMonitor && trackedInfo?.layoutId && !trackedLayoutId) {
            this._logger.warn('Tracked window layout is unavailable, using monitor default', {
                monitorIndex,
                layoutId: trackedInfo.layoutId
            });
        }

        const layoutId = trackedLayoutId || this._resolveLayoutIdForMonitor(monitorIndex);
        if (!layoutId) {
            this._logger.warn('Keyboard move aborted: no layout available', { monitorIndex, command });
            return;
        }

        const layout = layoutManager.getLayout(layoutId);
        if (!layout) {
            this._logger.warn('Keyboard move aborted: layout not found', { layoutId, command });
            return;
        }

        const overrides = overrideStore.getOverrides(layoutId, monitorIndex);
        const zones = snapHandler.getZoneRects(monitorIndex, layout, { overrides }) || [];
        if (zones.length === 0) {
            this._logger.warn('Keyboard move aborted: no zones resolved', { layoutId, monitorIndex });
            return;
        }

        // Spec contract: if not tracked, snap first, then move.
        if (!trackedInMonitor || trackedInfo.layoutId !== layoutId) {
            this._assignWindowToZoneWithPolicy(
                window,
                monitorIndex,
                layoutId,
                0,
                layout,
                zones,
                { overrides },
                null
            );
        }

        const currentInfo = windowTracker.getWindowInfo(window);
        const currentZoneIndex = currentInfo?.zoneIndex ?? 0;
        const targetZoneIndex = this._resolveKeyboardMoveTargetZone(command, currentZoneIndex, zones);

        if (targetZoneIndex === null) {
            this._logger.warn('Keyboard move target unavailable', { command, currentZoneIndex });
            return;
        }

        if (targetZoneIndex === currentZoneIndex) {
            return;
        }

        const success = this._assignWindowToZoneWithPolicy(
            window,
            monitorIndex,
            layoutId,
            targetZoneIndex,
            layout,
            zones,
            { overrides },
            currentZoneIndex
        );

        if (!success) {
            this._logger.warn('Keyboard move failed', { command, targetZoneIndex });
            return;
        }

        layoutState.setLayoutForMonitor(monitorIndex, layoutId);
        this._saveLayoutState();
    }

    /**
     * Determine target zone for a keyboard move command.
     * @private
     * @param {string} command
     * @param {number} currentZoneIndex
     * @param {Array} zones
     * @returns {number|null}
     */
    _resolveKeyboardMoveTargetZone(command, currentZoneIndex, zones) {
        const zoneByIndex = new Map(zones.map(z => [z.zoneIndex, z]));
        const sortedIndices = [...zoneByIndex.keys()].sort((a, b) => a - b);

        if (command.startsWith('index:')) {
            const parsed = Number.parseInt(command.slice('index:'.length), 10);
            const zoneIndex = parsed - 1;
            return Number.isInteger(zoneIndex) && zoneByIndex.has(zoneIndex) ? zoneIndex : null;
        }

        if (!zoneByIndex.has(currentZoneIndex)) {
            return sortedIndices[0] ?? null;
        }

        if (command === 'next') {
            const idx = sortedIndices.indexOf(currentZoneIndex);
            return sortedIndices[(idx + 1) % sortedIndices.length];
        }
        if (command === 'prev') {
            const idx = sortedIndices.indexOf(currentZoneIndex);
            return sortedIndices[(idx - 1 + sortedIndices.length) % sortedIndices.length];
        }

        const currentZone = zoneByIndex.get(currentZoneIndex);
        const currentCx = currentZone.x + currentZone.width / 2;
        const currentCy = currentZone.y + currentZone.height / 2;

        let best = null;
        let bestPrimary = Number.POSITIVE_INFINITY;
        let bestSecondary = Number.POSITIVE_INFINITY;

        for (const zone of zones) {
            if (zone.zoneIndex === currentZoneIndex) {
                continue;
            }

            const cx = zone.x + zone.width / 2;
            const cy = zone.y + zone.height / 2;
            const dx = cx - currentCx;
            const dy = cy - currentCy;

            let primary;
            let secondary;

            if (command === 'left' && dx < 0) {
                primary = Math.abs(dx);
                secondary = Math.abs(dy);
            } else if (command === 'right' && dx > 0) {
                primary = Math.abs(dx);
                secondary = Math.abs(dy);
            } else if (command === 'up' && dy < 0) {
                primary = Math.abs(dy);
                secondary = Math.abs(dx);
            } else if (command === 'down' && dy > 0) {
                primary = Math.abs(dy);
                secondary = Math.abs(dx);
            } else {
                continue;
            }

            if (primary < bestPrimary || (primary === bestPrimary && secondary < bestSecondary)) {
                best = zone.zoneIndex;
                bestPrimary = primary;
                bestSecondary = secondary;
            }
        }

        return best;
    }

    /**
     * Assign a window to a target zone with deterministic occupancy behavior.
     * @private
     */
    _assignWindowToZoneWithPolicy(window, monitorIndex, layoutId, targetZoneIndex, layout, zones, options, sourceZoneIndex = null) {
        const snapHandler = this._serviceContainer.get('snapHandler');
        const windowTracker = this._serviceContainer.get('windowTracker');

        const zoneIndices = zones.map(z => z.zoneIndex).sort((a, b) => a - b);
        if (!zoneIndices.includes(targetZoneIndex)) {
            return false;
        }

        const assignments = new Map();
        for (const zoneIndex of zoneIndices) {
            const occupant = windowTracker.getWindowInZone(monitorIndex, layoutId, zoneIndex);
            if (occupant && occupant !== window) {
                assignments.set(zoneIndex, occupant);
            }
        }

        if (sourceZoneIndex !== null && sourceZoneIndex !== undefined) {
            assignments.delete(sourceZoneIndex);
        }

        const targetOccupant = assignments.get(targetZoneIndex) || null;
        let evicted = null;

        if (!targetOccupant) {
            assignments.set(targetZoneIndex, window);
        } else if (sourceZoneIndex !== null && sourceZoneIndex !== undefined) {
            assignments.set(sourceZoneIndex, targetOccupant);
            assignments.set(targetZoneIndex, window);
        } else {
            assignments.set(targetZoneIndex, window);

            const freeZoneIndex = zoneIndices.find(i => i !== targetZoneIndex && !assignments.has(i));
            if (freeZoneIndex !== undefined) {
                assignments.set(freeZoneIndex, targetOccupant);
            } else {
                const order = this._rotationOrder(zoneIndices, targetZoneIndex);
                let carry = targetOccupant;
                for (const zoneIndex of order) {
                    const nextCarry = assignments.get(zoneIndex) || null;
                    assignments.set(zoneIndex, carry);
                    carry = nextCarry;
                    if (!carry) {
                        break;
                    }
                }
                evicted = carry;
            }
        }

        for (const zoneIndex of zoneIndices) {
            const assignedWindow = assignments.get(zoneIndex);
            if (!assignedWindow) {
                continue;
            }
            const snapped = snapHandler.snapToZone(
                assignedWindow,
                monitorIndex,
                layoutId,
                zoneIndex,
                layout,
                options
            );
            if (!snapped) {
                return false;
            }
        }

        if (evicted && windowTracker.isWindowTracked(evicted)) {
            windowTracker.untrackWindow(evicted, { restore: this._shouldRestoreOnUnsnap() });
        }

        return true;
    }

    /**
     * Rotation order starting after target, wrapping around.
     * @private
     * @param {number[]} zoneIndices
     * @param {number} targetZoneIndex
     * @returns {number[]}
     */
    _rotationOrder(zoneIndices, targetZoneIndex) {
        const idx = zoneIndices.indexOf(targetZoneIndex);
        if (idx === -1) {
            return [...zoneIndices];
        }
        return [...zoneIndices.slice(idx + 1), ...zoneIndices.slice(0, idx)];
    }

    /**
     * Handle layout created
     * @private
     * @param {Object} data - {layoutId, layoutDef}
     */
    _handleLayoutCreated(data) {
        this._logger.info('Layout created', { layoutId: data.layoutId });
        this.saveCustomLayouts();
    }

    /**
     * Handle layout updated
     * @private
     * @param {Object} data - {layoutId, layoutDef}
     */
    _handleLayoutUpdated(data) {
        this._logger.info('Layout updated', { layoutId: data.layoutId });
        this.saveCustomLayouts();
    }

    /**
     * Handle layout deleted
     * @private
     * @param {Object} data - {layoutId}
     */
    _handleLayoutDeleted(data) {
        this._logger.info('Layout deleted', { layoutId: data.layoutId });
        this.saveCustomLayouts();
    }

    /**
     * Handle divider moved
     * @private
     * @param {Object} data - {layoutId, monitorIndex, path, ratio}
     */
    _handleDividerMoved(data) {
        this._logger.debug('Divider moved', data);
        // Save overrides (debounced in real implementation)
        this.saveDividerOverrides();
        this._saveLayoutState();
    }

    /**
     * Handle import layouts request
     * @private
     */
    _handleImportLayouts() {
        this._logger.info('Import layouts requested');
        // In a real implementation, this would open a file chooser dialog
    }

    /**
     * Handle layout editor create
     * @private
     * @param {Object} data - {layoutId, layoutDef}
     */
    _handleLayoutEditorCreate(data) {
        const { layoutId, layoutDef } = data;
        const layoutManager = this._serviceContainer.get('layoutManager');

        // Register the new layout
        const success = layoutManager.registerLayout(layoutId, layoutDef);
        if (success) {
            this._logger.info('Layout created via editor', { layoutId });
            // Emit event for UI updates
            this._eventBus.emit('layout-created', { layoutId, layoutDef });
            // Save to GSettings
            this.saveCustomLayouts();
        } else {
            this._logger.error('Failed to create layout', { layoutId });
        }
    }

    /**
     * Handle layout editor update
     * @private
     * @param {Object} data - {layoutId, layoutDef}
     */
    _handleLayoutEditorUpdate(data) {
        const { layoutId, layoutDef } = data;
        const layoutManager = this._serviceContainer.get('layoutManager');

        // Update the layout
        const success = layoutManager.updateLayout(layoutId, layoutDef);
        if (success) {
            this._logger.info('Layout updated via editor', { layoutId });
            // Emit event for UI updates
            this._eventBus.emit('layout-updated', { layoutId, layoutDef });
            // Save to GSettings
            this.saveCustomLayouts();
        } else {
            this._logger.error('Failed to update layout', { layoutId });
        }
    }

    /**
     * Handle appearance settings changed
     * @private
     * @param {Object} data
     */
    _handleAppearanceSettings(data) {
        const settings = data?.settings || {};
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');
        const mouseHandler = this._serviceContainer.get('mouseHandler');
        const zoneColor = settings.zoneColor ?? settings.zoneBgColor;
        const zoneHighlightColor = settings.zoneHoverColor ??
            settings.zoneBorderHoverColor ??
            settings.zoneHighlightColor;
        const animationDuration = settings.animationDuration ?? settings.animationSpeed;

        // Apply appearance settings to layout picker bar
        layoutPickerBar.updateConfig({
            backgroundColor: settings.overlayBackgroundColor,
            borderRadius: settings.overlayBorderRadius,
            zoneColor,
            zoneHoverColor: zoneHighlightColor,
            zoneBorderColor: settings.zoneBorderColor,
            zoneBorderHoverColor: zoneHighlightColor,
            textColor: settings.textColor,
            activeLayoutBorderColor: settings.activeLayoutBorderColor,
            activeLayoutTextColor: settings.activeLayoutTextColor,
            thumbnailWidth: settings.thumbnailWidth,
            thumbnailHeight: settings.thumbnailHeight,
            animationDuration
        });

        // Keep edge hitbox span aligned with template sizing updates.
        mouseHandler.updateConfig({
            thumbnailWidth: settings.thumbnailWidth,
            thumbnailHeight: settings.thumbnailHeight
        });

        this._logger.info('Appearance settings applied', settings);

        // Save to GSettings
        this._saveSettings('appearance', settings);
    }

    /**
     * Handle behavior settings changed
     * @private
     * @param {Object} data
     */
    _handleBehaviorSettings(data) {
        const settings = data?.settings || {};
        this._applyBehaviorSettings(settings);

        this._logger.info('Behavior settings applied', settings);

        // Save to GSettings
        this._saveSettings('behavior', settings);
    }

    /**
     * Apply behavior settings to live runtime components.
     * @private
     * @param {Object} settings
     */
    _applyBehaviorSettings(settings) {
        const mouseHandler = this._serviceContainer.get('mouseHandler');
        const keyboardHandler = this._serviceContainer.get('keyboardHandler');
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');
        const dragDetector = this._serviceContainer.get('dragDetector');
        const interactionStateManager = this._serviceContainer.get('interactionStateManager');
        const dividerSyncManager = this._serviceContainer.get('dividerSyncManager');

        // Apply trigger zone settings
        mouseHandler.updateConfig({
            edgeSize: settings.edgeSize,
            cornerSize: settings.cornerSize,
            enableEdges: settings.enableEdges,
            enableCorners: settings.enableCorners,
            debounceDelay: settings.debounceDelay,
            triggerEdge: settings.triggerEdge
        });

        // Apply layout picker bar settings
        layoutPickerBar.updateConfig({
            edge: settings.triggerEdge || 'top'
        });

        // Apply keyboard shortcuts
        keyboardHandler.updateConfig({
            toggleOverlay: settings.toggleOverlay,
            navigateUp: settings.navigateUp,
            navigateDown: settings.navigateDown,
            navigateLeft: settings.navigateLeft,
            navigateRight: settings.navigateRight,
            selectZone: settings.selectZone,
            cancel: settings.cancel
        });

        // Apply shake-to-exit configuration
        dragDetector.updateConfig({
            shakeEnabled: settings.shakeEnabled,
            shakeWindowMs: settings.shakeWindowMs,
            shakeMinDelta: settings.shakeMinDelta,
            shakeDirectionChanges: settings.shakeDirectionChanges
        });

        interactionStateManager.updateDragZoneModifierConfig({
            autoSnapOnDrag: settings.autoSnapOnDrag,
            dragZoneModifierDisablesZones: settings.dragZoneModifierDisablesZones,
            dragZoneModifierKey: settings.dragZoneModifierKey
        });

        dividerSyncManager.updateConfig({
            liveResizeUpdates: settings.liveResizeUpdates
        });
    }

    /**
     * Handle layout settings changed
     * @private
     * @param {Object} data
     */
    _handleLayoutSettings(data) {
        const { settings } = data;

        // Apply layout settings
        // perMonitorLayouts, defaultLayout, etc.

        this._logger.info('Layout settings applied', settings);

        // Save to GSettings
        this._saveSettings('layout', settings);
    }

    /**
     * Load settings from GSettings
     * @private
     */
    _loadSettings() {
        if (!this._settings) {
            this._logger.warn('No settings available');
            return;
        }

        try {
            // Load custom layouts
            this._loadCustomLayouts();

            // Load divider overrides
            this._loadDividerOverrides();

            // Load layout state (per-monitor layouts)
            this._loadLayoutState();

            // Load appearance settings
            this._loadAppearanceSettings();

            // Load behavior settings
            this._loadBehaviorSettingsFromGSettings();
            this._watchBehaviorSettings();

            this._logger.info('Settings loaded from GSettings');
        } catch (error) {
            this._logger.error('Failed to load settings', { error });
        }
    }

    /**
     * Load custom layouts from GSettings
     * @private
     */
    _loadCustomLayouts() {
        try {
            const layoutManager = this._serviceContainer.get('layoutManager');
            const customLayoutsJson = this._settings.get_string('custom-layouts');

            if (!customLayoutsJson || customLayoutsJson === '{}' || customLayoutsJson === '[]') {
                this._logger.debug('No custom layouts to load');
                return;
            }

            // Parse and import layouts
            const customLayouts = JSON.parse(customLayoutsJson);

            // Support both object and array formats
            const layoutsArray = Array.isArray(customLayouts)
                ? customLayouts
                : Object.values(customLayouts);

            let loadedCount = 0;
            for (const layoutDef of layoutsArray) {
                if (layoutDef.id && layoutDef.layout) {
                    if (layoutManager.registerLayout(layoutDef.id, layoutDef)) {
                        loadedCount++;
                    }
                }
            }

            this._logger.info(`Loaded ${loadedCount} custom layouts from GSettings`);
        } catch (error) {
            this._logger.error('Failed to load custom layouts', { error });
        }
    }

    /**
     * Load divider overrides from GSettings
     * @private
     */
    _loadDividerOverrides() {
        try {
            const overrideStore = this._serviceContainer.get('overrideStore');
            const overridesJson = this._settings.get_string('divider-overrides');

            if (!overridesJson || overridesJson === '{}') {
                this._logger.debug('No divider overrides to load');
                return;
            }

            const success = overrideStore.deserialize(overridesJson);
            if (success) {
                this._logger.info(`Loaded divider overrides from GSettings (${overrideStore.size} keys)`);
            }
        } catch (error) {
            this._logger.error('Failed to load divider overrides', { error });
        }
    }

    /**
     * Load layout state from GSettings
     * @private
     */
    _loadLayoutState() {
        try {
            if (!this._hasSettingsKey('per-monitor-layouts')) {
                this._logger.warn('Skipping per-monitor layout load because schema key is unavailable');
                return;
            }

            const layoutState = this._serviceContainer.get('layoutState');
            const perMonitorLayoutsJson = this._settings.get_string('per-monitor-layouts');

            if (!perMonitorLayoutsJson || perMonitorLayoutsJson === '{}') {
                this._logger.debug('No per-monitor layouts to load');
                return;
            }

            const perMonitorLayouts = JSON.parse(perMonitorLayoutsJson);
            for (const [monitorIndexStr, layoutId] of Object.entries(perMonitorLayouts)) {
                const monitorIndex = parseInt(monitorIndexStr, 10);
                if (!isNaN(monitorIndex) && typeof layoutId === 'string') {
                    layoutState.setLayoutForMonitor(monitorIndex, layoutId);
                }
            }

            this._logger.info('Loaded per-monitor layouts from GSettings');
        } catch (error) {
            this._logger.error('Failed to load layout state', { error });
        }
    }

    /**
     * Load appearance settings from GSettings
     * @private
     */
    _loadAppearanceSettings() {
        try {
            const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');
            layoutPickerBar.updateConfig({
                zoneColor: this._settings.get_string('zone-bg-color'),
                zoneBorderColor: this._settings.get_string('zone-border-color'),
                zoneBorderHoverColor: this._settings.get_string('zone-highlight-color'),
                activeLayoutBorderColor: this._settings.get_string('active-layout-border-color'),
                activeLayoutTextColor: this._settings.get_string('active-layout-text-color')
            });

            this._logger.info('Loaded appearance settings from GSettings');
        } catch (error) {
            this._logger.error('Failed to load appearance settings', { error });
        }
    }

    /**
     * Load behavior settings from GSettings and apply them to runtime services.
     * @private
     */
    _loadBehaviorSettingsFromGSettings() {
        try {
            const toggleOverlayBindings = this._hasSettingsKey('toggle-overlay')
                ? this._settings.get_strv('toggle-overlay')
                : [];

            const settings = {
                triggerEdge: this._hasSettingsKey('trigger-edge')
                    ? this._settings.get_string('trigger-edge')
                    : 'top',
                edgeSize: this._hasSettingsKey('edge-size')
                    ? this._settings.get_int('edge-size')
                    : 2,
                cornerSize: this._hasSettingsKey('corner-size')
                    ? this._settings.get_int('corner-size')
                    : 10,
                enableEdges: this._hasSettingsKey('enable-edges')
                    ? this._settings.get_boolean('enable-edges')
                    : true,
                enableCorners: this._hasSettingsKey('enable-corners')
                    ? this._settings.get_boolean('enable-corners')
                    : true,
                debounceDelay: this._hasSettingsKey('debounce-delay')
                    ? this._settings.get_int('debounce-delay')
                    : 100,
                toggleOverlay: toggleOverlayBindings[0] || '<Super>space',
                navigateUp: this._hasSettingsKey('navigate-up')
                    ? this._settings.get_string('navigate-up')
                    : 'Up',
                navigateDown: this._hasSettingsKey('navigate-down')
                    ? this._settings.get_string('navigate-down')
                    : 'Down',
                navigateLeft: this._hasSettingsKey('navigate-left')
                    ? this._settings.get_string('navigate-left')
                    : 'Left',
                navigateRight: this._hasSettingsKey('navigate-right')
                    ? this._settings.get_string('navigate-right')
                    : 'Right',
                selectZone: this._hasSettingsKey('select-zone')
                    ? this._settings.get_string('select-zone')
                    : 'Return',
                cancel: this._hasSettingsKey('cancel')
                    ? this._settings.get_string('cancel')
                    : 'Escape',
                autoSnapOnDrag: this._hasSettingsKey('auto-snap-on-drag')
                    ? this._settings.get_boolean('auto-snap-on-drag')
                    : true,
                restoreOnUnsnap: this._hasSettingsKey('restore-on-unsnap')
                    ? this._settings.get_boolean('restore-on-unsnap')
                    : true,
                dragZoneModifierDisablesZones: this._hasSettingsKey('drag-zone-modifier-disables-zones')
                    ? this._settings.get_boolean('drag-zone-modifier-disables-zones')
                    : true,
                dragZoneModifierKey: this._hasSettingsKey('drag-zone-modifier-key')
                    ? this._settings.get_string('drag-zone-modifier-key')
                    : 'control',
                shakeEnabled: this._hasSettingsKey('shake-enabled')
                    ? this._settings.get_boolean('shake-enabled')
                    : true,
                shakeWindowMs: this._hasSettingsKey('shake-window-ms')
                    ? this._settings.get_int('shake-window-ms')
                    : 500,
                shakeMinDelta: this._hasSettingsKey('shake-min-delta')
                    ? this._settings.get_int('shake-min-delta')
                    : 35,
                shakeDirectionChanges: this._hasSettingsKey('shake-direction-changes')
                    ? this._settings.get_int('shake-direction-changes')
                    : 4,
                liveResizeUpdates: this._hasSettingsKey('live-resize-updates')
                    ? this._settings.get_boolean('live-resize-updates')
                    : true
            };

            this._applyBehaviorSettings(settings);
            this._logger.info('Loaded behavior settings from GSettings', {
                triggerEdge: settings.triggerEdge,
                autoSnapOnDrag: settings.autoSnapOnDrag,
                dragZoneModifierDisablesZones: settings.dragZoneModifierDisablesZones,
                dragZoneModifierKey: settings.dragZoneModifierKey,
                shakeEnabled: settings.shakeEnabled,
                liveResizeUpdates: settings.liveResizeUpdates
            });
        } catch (error) {
            this._logger.error('Failed to load behavior settings', { error });
        }
    }

    /**
     * Watch behavior settings for live updates.
     * @private
     */
    _watchBehaviorSettings() {
        if (!this._settings || this._settingsSignalIds.length > 0) {
            return;
        }

        const keys = [
            'trigger-edge',
            'edge-size',
            'corner-size',
            'enable-edges',
            'enable-corners',
            'debounce-delay',
            'toggle-overlay',
            'navigate-up',
            'navigate-down',
            'navigate-left',
            'navigate-right',
            'select-zone',
            'cancel',
            'auto-snap-on-drag',
            'restore-on-unsnap',
            'drag-zone-modifier-disables-zones',
            'drag-zone-modifier-key',
            'shake-enabled',
            'shake-window-ms',
            'shake-min-delta',
            'shake-direction-changes',
            'live-resize-updates'
        ];

        for (const key of keys) {
            if (!this._hasSettingsKey(key)) {
                continue;
            }

            const signalId = this._settings.connect(`changed::${key}`, () => {
                this._loadBehaviorSettingsFromGSettings();
            });
            this._settingsSignalIds.push(signalId);
        }
    }

    /**
     * Determine whether windows should restore geometry when unsnapped.
     * @private
     * @returns {boolean}
     */
    _shouldRestoreOnUnsnap() {
        if (!this._settings || !this._hasSettingsKey('restore-on-unsnap')) {
            return true;
        }

        try {
            return this._settings.get_boolean('restore-on-unsnap');
        } catch (error) {
            this._logger.warn('Failed reading restore-on-unsnap setting, using default', { error });
            return true;
        }
    }

    /**
     * Save settings to GSettings
     * @private
     * @param {string} category
     * @param {Object} settings
     */
    _saveSettings(category, settings) {
        if (!this._settings) {
            this._logger.warn('No settings available');
            return;
        }

        try {
            switch (category) {
                case 'appearance':
                    this._saveAppearanceSettings(settings);
                    break;
                case 'behavior':
                    this._saveBehaviorSettings(settings);
                    break;
                case 'layout':
                    this._saveLayoutSettings(settings);
                    break;
                default:
                    this._logger.warn(`Unknown settings category: ${category}`);
            }

            this._logger.debug('Settings saved to GSettings', { category });
        } catch (error) {
            this._logger.error('Failed to save settings', { category, error });
        }
    }

    /**
     * Save per-monitor layout selections to GSettings
     * @private
     */
    _saveLayoutState() {
        if (!this._settings) {
            return;
        }

        try {
            if (!this._hasSettingsKey('per-monitor-layouts')) {
                this._logger.warn('Skipping per-monitor layout save because schema key is unavailable');
                return;
            }

            const layoutState = this._serviceContainer.get('layoutState');
            const layouts = layoutState.getAllLayouts();
            const obj = {};
            for (const [monitorIndex, layoutId] of layouts.entries()) {
                obj[monitorIndex] = layoutId;
            }

            this._settings.set_string('per-monitor-layouts', JSON.stringify(obj));
            this._logger.debug('Saved per-monitor layouts', { count: layouts.size });
        } catch (error) {
            this._logger.error('Failed to save layout state', { error });
        }
    }

    /**
     * Save appearance settings
     * @private
     * @param {Object} settings
     */
    _saveAppearanceSettings(settings) {
        const zoneBgColor = settings.zoneBgColor ?? settings.zoneColor;
        const zoneHighlightColor = settings.zoneHighlightColor ??
            settings.zoneHoverColor ??
            settings.zoneBorderHoverColor;

        if (zoneBgColor) {
            this._settings.set_string('zone-bg-color', zoneBgColor);
        }
        if (settings.zoneBorderColor) {
            this._settings.set_string('zone-border-color', settings.zoneBorderColor);
        }
        if (zoneHighlightColor) {
            this._settings.set_string('zone-highlight-color', zoneHighlightColor);
        }
        if (settings.activeLayoutBorderColor) {
            this._settings.set_string('active-layout-border-color', settings.activeLayoutBorderColor);
        }
        if (settings.activeLayoutTextColor) {
            this._settings.set_string('active-layout-text-color', settings.activeLayoutTextColor);
        }
        if (typeof settings.borderWidth === 'number') {
            this._settings.set_int('border-width', Math.max(1, Math.round(settings.borderWidth)));
        }
        if (typeof settings.animationSpeed === 'number' || typeof settings.animationDuration === 'number') {
            const value = settings.animationSpeed ?? settings.animationDuration;
            this._settings.set_int('animation-speed', Math.max(1, Math.round(value)));
        }
        if (typeof settings.enableAnimations === 'boolean') {
            this._settings.set_boolean('enable-animations', settings.enableAnimations);
        }
        if (typeof settings.overlayOpacity === 'number') {
            this._settings.set_double('overlay-opacity', Math.max(0, Math.min(1, settings.overlayOpacity)));
        }
        if (typeof settings.zoneLabelSize === 'number') {
            this._settings.set_int('zone-label-size', Math.max(1, Math.round(settings.zoneLabelSize)));
        }
        if (typeof settings.showZoneNumbers === 'boolean') {
            this._settings.set_boolean('show-zone-numbers', settings.showZoneNumbers);
        }
        this._logger.debug('Appearance settings saved');
    }

    /**
     * Save behavior settings
     * @private
     * @param {Object} settings
     */
    _saveBehaviorSettings(settings) {
        if (settings.triggerEdge && this._hasSettingsKey('trigger-edge')) {
            this._settings.set_string('trigger-edge', settings.triggerEdge);
        }
        if (typeof settings.edgeSize === 'number' && this._hasSettingsKey('edge-size')) {
            this._settings.set_int('edge-size', Math.max(1, Math.round(settings.edgeSize)));
        }
        if (typeof settings.cornerSize === 'number' && this._hasSettingsKey('corner-size')) {
            this._settings.set_int('corner-size', Math.max(1, Math.round(settings.cornerSize)));
        }
        if (typeof settings.enableEdges === 'boolean' && this._hasSettingsKey('enable-edges')) {
            this._settings.set_boolean('enable-edges', settings.enableEdges);
        }
        if (typeof settings.enableCorners === 'boolean' && this._hasSettingsKey('enable-corners')) {
            this._settings.set_boolean('enable-corners', settings.enableCorners);
        }
        if (typeof settings.debounceDelay === 'number' && this._hasSettingsKey('debounce-delay')) {
            this._settings.set_int('debounce-delay', Math.max(0, Math.round(settings.debounceDelay)));
        }
        if (settings.toggleOverlay && this._hasSettingsKey('toggle-overlay')) {
            this._settings.set_strv('toggle-overlay', [settings.toggleOverlay]);
        }
        if (settings.navigateUp && this._hasSettingsKey('navigate-up')) {
            this._settings.set_string('navigate-up', settings.navigateUp);
        }
        if (settings.navigateDown && this._hasSettingsKey('navigate-down')) {
            this._settings.set_string('navigate-down', settings.navigateDown);
        }
        if (settings.navigateLeft && this._hasSettingsKey('navigate-left')) {
            this._settings.set_string('navigate-left', settings.navigateLeft);
        }
        if (settings.navigateRight && this._hasSettingsKey('navigate-right')) {
            this._settings.set_string('navigate-right', settings.navigateRight);
        }
        if (settings.selectZone && this._hasSettingsKey('select-zone')) {
            this._settings.set_string('select-zone', settings.selectZone);
        }
        if (settings.cancel && this._hasSettingsKey('cancel')) {
            this._settings.set_string('cancel', settings.cancel);
        }
        if (typeof settings.autoSnapOnDrag === 'boolean' &&
            this._hasSettingsKey('auto-snap-on-drag')) {
            this._settings.set_boolean('auto-snap-on-drag', settings.autoSnapOnDrag);
        }
        if (typeof settings.focusWindowOnSnap === 'boolean' &&
            this._hasSettingsKey('focus-window-on-snap')) {
            this._settings.set_boolean('focus-window-on-snap', settings.focusWindowOnSnap);
        }
        if (typeof settings.restoreOnUnsnap === 'boolean' &&
            this._hasSettingsKey('restore-on-unsnap')) {
            this._settings.set_boolean('restore-on-unsnap', settings.restoreOnUnsnap);
        }
        if (typeof settings.dragZoneModifierDisablesZones === 'boolean' &&
            this._hasSettingsKey('drag-zone-modifier-disables-zones')) {
            this._settings.set_boolean('drag-zone-modifier-disables-zones', settings.dragZoneModifierDisablesZones);
        }
        if (settings.dragZoneModifierKey &&
            this._hasSettingsKey('drag-zone-modifier-key')) {
            this._settings.set_string('drag-zone-modifier-key', settings.dragZoneModifierKey);
        }
        if (typeof settings.shakeEnabled === 'boolean' &&
            this._hasSettingsKey('shake-enabled')) {
            this._settings.set_boolean('shake-enabled', settings.shakeEnabled);
        }
        if (typeof settings.shakeWindowMs === 'number' &&
            this._hasSettingsKey('shake-window-ms')) {
            this._settings.set_int('shake-window-ms', Math.max(100, Math.round(settings.shakeWindowMs)));
        }
        if (typeof settings.shakeMinDelta === 'number' &&
            this._hasSettingsKey('shake-min-delta')) {
            this._settings.set_int('shake-min-delta', Math.max(5, Math.round(settings.shakeMinDelta)));
        }
        if (typeof settings.shakeDirectionChanges === 'number' &&
            this._hasSettingsKey('shake-direction-changes')) {
            this._settings.set_int('shake-direction-changes', Math.max(1, Math.round(settings.shakeDirectionChanges)));
        }
        if (typeof settings.liveResizeUpdates === 'boolean' &&
            this._hasSettingsKey('live-resize-updates')) {
            this._settings.set_boolean('live-resize-updates', settings.liveResizeUpdates);
        }
        this._logger.debug('Behavior settings saved');
    }

    /**
     * Save layout settings
     * @private
     * @param {Object} settings
     */
    _saveLayoutSettings(settings) {
        if (settings.defaultLayout) {
            this._settings.set_string('default-layout', settings.defaultLayout);
        }
        if (typeof settings.defaultMargin === 'number') {
            this._settings.set_int('default-margin', settings.defaultMargin);
        }
        if (typeof settings.defaultPadding === 'number') {
            this._settings.set_int('default-padding', settings.defaultPadding);
        }
        if (typeof settings.rememberPerWorkspace === 'boolean') {
            this._settings.set_boolean('remember-per-workspace', settings.rememberPerWorkspace);
        }
        if (settings.perMonitorLayouts) {
            if (this._hasSettingsKey('per-monitor-layouts')) {
                const json = JSON.stringify(settings.perMonitorLayouts);
                this._settings.set_string('per-monitor-layouts', json);
            } else {
                this._logger.warn('Skipping per-monitor layout settings save because schema key is unavailable');
            }
        }
        this._logger.debug('Layout settings saved');
    }

    /**
     * Save custom layouts to GSettings
     */
    saveCustomLayouts() {
        if (!this._settings) {
            return;
        }

        try {
            const layoutManager = this._serviceContainer.get('layoutManager');
            const customLayouts = layoutManager.getCustomLayouts();
            const json = JSON.stringify(customLayouts);
            this._settings.set_string('custom-layouts', json);
            this._logger.info(`Saved ${customLayouts.length} custom layouts to GSettings`);
        } catch (error) {
            this._logger.error('Failed to save custom layouts', { error });
        }
    }

    /**
     * Save divider overrides to GSettings
     */
    saveDividerOverrides() {
        if (!this._settings) {
            return;
        }

        try {
            const overrideStore = this._serviceContainer.get('overrideStore');
            const json = overrideStore.serialize();
            this._settings.set_string('divider-overrides', json);
            this._logger.info('Saved divider overrides to GSettings');
        } catch (error) {
            this._logger.error('Failed to save divider overrides', { error });
        }
    }

    /**
     * Enable extension
     */
    enable() {
        if (this._enabled) {
            return;
        }

        this.initialize();
    }

    /**
     * Disable extension
     */
    disable() {
        if (!this._enabled) {
            return;
        }

        this._enabled = false;

        // Unsubscribe from events
        for (const unsubscribe of this._eventSubscriptions) {
            unsubscribe();
        }
        this._eventSubscriptions = [];

        this._logger.info('Extension disabled');
    }

    /**
     * Destroy extension
     */
    destroy() {
        this.disable();

        // Destroy keybinding manager first (unregisters keybindings)
        if (this._keybindingManager) {
            this._keybindingManager.destroy();
            this._keybindingManager = null;
        }

        // Destroy all components (in reverse order)
        if (this._componentManager) {
            this._componentManager.destroy();
            this._componentManager = null;
        }

        // Clear service container
        if (this._serviceContainer) {
            this._serviceContainer = null;
        }

        if (this._settings) {
            for (const signalId of this._settingsSignalIds) {
                try {
                    this._settings.disconnect(signalId);
                } catch (_error) {
                    // Settings may already be torn down.
                }
            }
        }
        this._settingsSignalIds = [];

        // Clear settings
        this._settings = null;

        this._logger.info('Extension destroyed');
    }

    /**
     * Check if enabled
     *
     * @returns {boolean}
     */
    get isEnabled() {
        return this._enabled;
    }
}
