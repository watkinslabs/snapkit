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

import { ExtensionState, State } from './state/extensionState.js';
import { DragState } from './state/dragState.js';
import { InteractiveSelectState } from './state/interactiveSelectState.js';
import { LayoutState } from './state/layoutState.js';

import { LayoutTree } from './btree/tree/layoutTree.js';
import { LayoutValidator } from './btree/validator/layoutValidator.js';
import { LayoutResolver } from './btree/resolver/layoutResolver.js';
import { LayoutManager } from './btree/manager/layoutManager.js';
import { OverrideStore } from './btree/overrideStore.js';

import { MonitorManager } from './tiling/monitorManager.js';
import { WindowTracker } from './tiling/windowTracker.js';
import { SnapHandler } from './tiling/snapHandler.js';
import { TileManager } from './tiling/tileManager.js';

import { LayoutOverlay } from './overlay/layoutOverlay.js';
import { SnapPreviewOverlay } from './overlay/snapPreviewOverlay.js';
import { ZonePositioningOverlay } from './overlay/zonePositioningOverlay.js';

import { EventCoordinator } from './interaction/eventCoordinator.js';
import { MouseHandler } from './interaction/mouseHandler.js';
import { DragDetector } from './interaction/dragDetector.js';
import { KeyboardHandler } from './interaction/keyboardHandler.js';
import { InteractionStateManager } from './interaction/interactionStateManager.js';

import { WindowSelector } from './ui/windowSelector.js';
import { LayoutEditor } from './ui/layoutEditor.js';
import { LayoutSwitcher } from './ui/layoutSwitcher.js';

import { AppearancePreferences } from './preferences/appearancePreferences.js';
import { BehaviorPreferences } from './preferences/behaviorPreferences.js';
import { LayoutPreferences } from './preferences/layoutPreferences.js';

export class ExtensionController {
    constructor() {
        this._logger = new Logger('ExtensionController');

        // Core systems
        this._serviceContainer = null;
        this._componentManager = null;
        this._eventBus = null;

        // State
        this._enabled = false;
        this._eventSubscriptions = [];
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

            // Create core systems
            this._serviceContainer = new ServiceContainer();
            this._componentManager = new ComponentManager();
            this._eventBus = new EventBus();

            // Register services
            this._registerServices();

            // Initialize components
            this._initializeComponents();

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
     * Register all services in DI container
     * @private
     */
    _registerServices() {
        const sc = this._serviceContainer;

        // Core services
        sc.register('eventBus', () => this._eventBus, true);
        sc.register('componentManager', () => this._componentManager, true);

        // State services
        sc.register('extensionState', () => new ExtensionState(sc.get('eventBus')), true);
        sc.register('dragState', () => new DragState(sc.get('eventBus')), true);
        sc.register('interactiveSelectState', () => new InteractiveSelectState(sc.get('eventBus')), true);
        sc.register('layoutState', () => new LayoutState(sc.get('eventBus')), true);

        // BTree services
        sc.register('layoutValidator', () => new LayoutValidator(), true);
        sc.register('layoutResolver', () => new LayoutResolver(sc.get('layoutValidator')), true);
        sc.register('layoutManager', () => new LayoutManager(sc.get('layoutValidator')), true);
        sc.register('overrideStore', () => new OverrideStore(), true);

        // Tiling services
        sc.register('monitorManager', () => new MonitorManager(sc.get('layoutManager'), sc.get('eventBus')), true);
        sc.register('windowTracker', () => new WindowTracker(sc.get('eventBus')), true);
        sc.register('snapHandler', () => new SnapHandler(
            sc.get('layoutResolver'),
            sc.get('windowTracker'),
            sc.get('eventBus')
        ), true);
        sc.register('tileManager', () => new TileManager(
            sc.get('layoutResolver'),
            sc.get('overrideStore'),
            sc.get('windowTracker'),
            sc.get('snapHandler'),
            sc.get('eventBus')
        ), true);

        // Overlay services
        sc.register('layoutOverlay', () => new LayoutOverlay(
            sc.get('layoutResolver'),
            sc.get('monitorManager'),
            sc.get('eventBus')
        ), true);
        sc.register('snapPreviewOverlay', () => new SnapPreviewOverlay(
            sc.get('layoutResolver'),
            sc.get('monitorManager')
        ), true);
        sc.register('zonePositioningOverlay', () => new ZonePositioningOverlay(
            sc.get('layoutResolver'),
            sc.get('monitorManager')
        ), true);

        // Interaction services
        sc.register('eventCoordinator', () => new EventCoordinator(
            sc.get('extensionState'),
            sc.get('eventBus')
        ), true);
        sc.register('mouseHandler', () => new MouseHandler(
            sc.get('eventCoordinator'),
            sc.get('extensionState'),
            sc.get('monitorManager'),
            sc.get('eventBus')
        ), true);
        sc.register('dragDetector', () => new DragDetector(
            sc.get('extensionState'),
            sc.get('dragState'),
            sc.get('eventBus')
        ), true);
        sc.register('keyboardHandler', () => new KeyboardHandler(
            sc.get('eventCoordinator'),
            sc.get('extensionState'),
            sc.get('eventBus')
        ), true);
        sc.register('interactionStateManager', () => new InteractionStateManager(
            sc.get('eventCoordinator'),
            sc.get('mouseHandler'),
            sc.get('dragDetector'),
            sc.get('keyboardHandler'),
            sc.get('extensionState'),
            sc.get('eventBus'),
            sc.get('monitorManager')
        ), true);

        // UI services
        sc.register('windowSelector', () => new WindowSelector(sc.get('eventBus')), true);
        sc.register('layoutEditor', () => new LayoutEditor(
            sc.get('layoutResolver'),
            sc.get('layoutManager'),
            sc.get('eventBus')
        ), true);
        sc.register('layoutSwitcher', () => new LayoutSwitcher(
            sc.get('layoutManager'),
            sc.get('layoutResolver'),
            sc.get('eventBus')
        ), true);

        // Preferences services
        sc.register('appearancePreferences', () => new AppearancePreferences(sc.get('eventBus')), true);
        sc.register('behaviorPreferences', () => new BehaviorPreferences(sc.get('eventBus')), true);
        sc.register('layoutPreferences', () => new LayoutPreferences(
            sc.get('layoutManager'),
            sc.get('monitorManager'),
            sc.get('eventBus')
        ), true);

        this._logger.debug('Services registered');
    }

    /**
     * Initialize components
     * @private
     */
    _initializeComponents() {
        const cm = this._componentManager;

        // Initialize monitors first
        cm.register('monitorManager', () => {
            const mm = this._serviceContainer.get('monitorManager');
            mm.initialize(this._serviceContainer.get('layoutManager'));
            return mm;
        });

        // Initialize interaction system
        cm.register('interactionStateManager', () => {
            const ism = this._serviceContainer.get('interactionStateManager');
            ism.initialize();
            return ism;
        });

        // Initialize overlays
        cm.register('layoutOverlay', () => {
            const lo = this._serviceContainer.get('layoutOverlay');
            lo.initialize(Main.uiGroup);
            return lo;
        });

        cm.register('snapPreviewOverlay', () => {
            const spo = this._serviceContainer.get('snapPreviewOverlay');
            spo.initialize(Main.uiGroup);
            return spo;
        });

        cm.register('zonePositioningOverlay', () => {
            const zpo = this._serviceContainer.get('zonePositioningOverlay');
            zpo.initialize(Main.uiGroup);
            return zpo;
        });

        // Initialize UI components
        cm.register('windowSelector', () => {
            const ws = this._serviceContainer.get('windowSelector');
            ws.initialize(Main.uiGroup);
            return ws;
        });

        cm.register('layoutEditor', () => {
            const le = this._serviceContainer.get('layoutEditor');
            le.initialize(Main.uiGroup);
            return le;
        });

        cm.register('layoutSwitcher', () => {
            const ls = this._serviceContainer.get('layoutSwitcher');
            ls.initialize(Main.uiGroup);
            return ls;
        });

        // Initialize preferences
        cm.register('appearancePreferences', () => {
            const ap = this._serviceContainer.get('appearancePreferences');
            ap.initialize(Main.uiGroup);
            return ap;
        });

        cm.register('behaviorPreferences', () => {
            const bp = this._serviceContainer.get('behaviorPreferences');
            bp.initialize(Main.uiGroup);
            return bp;
        });

        cm.register('layoutPreferences', () => {
            const lp = this._serviceContainer.get('layoutPreferences');
            lp.initialize(Main.uiGroup);
            return lp;
        });

        this._logger.debug('Components initialized');
    }

    /**
     * Wire event handlers
     * @private
     */
    _wireEventHandlers() {
        // Request events from interaction layer
        this._eventSubscriptions.push(
            this._eventBus.on('request-open-overlay', (data) => {
                this._handleOpenOverlay(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('request-close-overlay', () => {
                this._handleCloseOverlay();
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('request-snap-preview', (data) => {
                this._handleSnapPreview(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('update-snap-preview', (data) => {
                this._handleUpdateSnapPreview(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('request-snap-to-zone', (data) => {
                this._handleSnapToZone(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('request-cancel', () => {
                this._handleCancel();
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('request-zone-navigation', (data) => {
                this._handleZoneNavigation(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('request-zone-select', () => {
                this._handleZoneSelect();
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('request-direct-zone-select', (data) => {
                this._handleDirectZoneSelect(data);
            })
        );

        // Zone selection from overlay
        this._eventSubscriptions.push(
            this._eventBus.on('zone-selected', (data) => {
                this._handleZoneSelected(data);
            })
        );

        // Window selection
        this._eventSubscriptions.push(
            this._eventBus.on('window-selected', (data) => {
                this._handleWindowSelected(data);
            })
        );

        // Layout switching
        this._eventSubscriptions.push(
            this._eventBus.on('layout-switched', (data) => {
                this._handleLayoutSwitched(data);
            })
        );

        // Settings changes
        this._eventSubscriptions.push(
            this._eventBus.on('appearance-settings-changed', (data) => {
                this._handleAppearanceSettings(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('behavior-settings-changed', (data) => {
                this._handleBehaviorSettings(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('layout-settings-changed', (data) => {
                this._handleLayoutSettings(data);
            })
        );

        this._logger.debug('Event handlers wired');
    }

    /**
     * Handle open overlay request
     * @private
     * @param {Object} data
     */
    _handleOpenOverlay(data) {
        const { monitorIndex } = data;
        const extensionState = this._serviceContainer.get('extensionState');
        const layoutState = this._serviceContainer.get('layoutState');
        const layoutOverlay = this._serviceContainer.get('layoutOverlay');

        // Transition to OPEN state
        extensionState.transitionTo(State.OPEN);

        // Get layout for monitor
        const layoutId = layoutState.getLayoutForMonitor(monitorIndex) || 'grid-2x2';
        const layoutManager = this._serviceContainer.get('layoutManager');
        const layout = layoutManager.getLayout(layoutId);

        if (!layout) {
            this._logger.error('Layout not found', { layoutId });
            return;
        }

        // Show overlay
        layoutOverlay.showLayout(monitorIndex, layout);

        this._logger.debug('Overlay opened', { monitorIndex, layoutId });
    }

    /**
     * Handle close overlay request
     * @private
     */
    _handleCloseOverlay() {
        const extensionState = this._serviceContainer.get('extensionState');
        const layoutOverlay = this._serviceContainer.get('layoutOverlay');

        // Hide overlay
        layoutOverlay.hide();

        // Transition to CLOSED
        extensionState.transitionTo(State.CLOSED);

        this._logger.debug('Overlay closed');
    }

    /**
     * Handle snap preview request
     * @private
     * @param {Object} data
     */
    _handleSnapPreview(data) {
        const { monitorIndex, window } = data;
        const layoutState = this._serviceContainer.get('layoutState');
        const snapPreviewOverlay = this._serviceContainer.get('snapPreviewOverlay');

        // Get layout for monitor
        const layoutId = layoutState.getLayoutForMonitor(monitorIndex) || 'grid-2x2';
        const layoutManager = this._serviceContainer.get('layoutManager');
        const layout = layoutManager.getLayout(layoutId);

        if (!layout) {
            return;
        }

        // Show snap preview
        snapPreviewOverlay.showPreview(monitorIndex, layout);

        this._logger.debug('Snap preview shown', { monitorIndex });
    }

    /**
     * Handle update snap preview
     * @private
     * @param {Object} data
     */
    _handleUpdateSnapPreview(data) {
        const { position } = data;
        const snapPreviewOverlay = this._serviceContainer.get('snapPreviewOverlay');

        // Update highlighted zone based on cursor position
        snapPreviewOverlay.highlightZoneAtCursor(position.x, position.y);
    }

    /**
     * Handle snap to zone request
     * @private
     * @param {Object} data
     */
    _handleSnapToZone(data) {
        const { window, position, monitorIndex } = data;
        const snapPreviewOverlay = this._serviceContainer.get('snapPreviewOverlay');
        const snapHandler = this._serviceContainer.get('snapHandler');
        const layoutState = this._serviceContainer.get('layoutState');

        // Get highlighted zone from preview
        const zoneIndex = snapPreviewOverlay.highlightZoneAtCursor(position.x, position.y);

        if (zoneIndex === null) {
            // No zone under cursor, hide preview
            snapPreviewOverlay.hide();
            return;
        }

        // Get layout
        const layoutId = layoutState.getLayoutForMonitor(monitorIndex) || 'grid-2x2';
        const layoutManager = this._serviceContainer.get('layoutManager');
        const layout = layoutManager.getLayout(layoutId);

        if (!layout) {
            snapPreviewOverlay.hide();
            return;
        }

        // Snap window to zone
        snapHandler.snapToZone(window, monitorIndex, layoutId, zoneIndex, layout);

        // Hide preview
        snapPreviewOverlay.hide();

        this._logger.debug('Window snapped', { zoneIndex, monitorIndex });
    }

    /**
     * Handle cancel request
     * @private
     */
    _handleCancel() {
        const extensionState = this._serviceContainer.get('extensionState');

        // Handle based on current state
        switch (extensionState.current) {
            case State.OPEN:
                this._handleCloseOverlay();
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
     * Handle appearance settings changed
     * @private
     * @param {Object} data
     */
    _handleAppearanceSettings(data) {
        const { settings } = data;

        // Apply appearance settings to overlays
        // In full implementation, would update overlay styles

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
        const { settings } = data;
        const mouseHandler = this._serviceContainer.get('mouseHandler');
        const keyboardHandler = this._serviceContainer.get('keyboardHandler');

        // Apply trigger zone settings
        mouseHandler.updateConfig({
            edgeSize: settings.edgeSize,
            cornerSize: settings.cornerSize,
            enableEdges: settings.enableEdges,
            enableCorners: settings.enableCorners,
            debounceDelay: settings.debounceDelay
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

        this._logger.info('Behavior settings applied', settings);

        // Save to GSettings
        this._saveSettings('behavior', settings);
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
     * Load settings (placeholder for GSettings)
     * @private
     */
    _loadSettings() {
        // In production, load from GSettings
        // For now, use defaults
        this._logger.debug('Settings loaded (defaults)');
    }

    /**
     * Save settings (placeholder for GSettings)
     * @private
     * @param {string} category
     * @param {Object} settings
     */
    _saveSettings(category, settings) {
        // In production, save to GSettings
        this._logger.debug('Settings saved (placeholder)', { category });
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

        // Destroy all components (in reverse order)
        if (this._componentManager) {
            this._componentManager.destroy();
            this._componentManager = null;
        }

        // Clear service container
        if (this._serviceContainer) {
            this._serviceContainer = null;
        }

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
