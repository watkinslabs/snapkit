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
import { DividerSyncManager } from './tiling/dividerSyncManager.js';

import { LayoutOverlay } from './overlay/layoutOverlay.js';
import { SnapPreviewOverlay } from './overlay/snapPreviewOverlay.js';
import { ZonePositioningOverlay } from './overlay/zonePositioningOverlay.js';

import { EventCoordinator } from './interaction/eventCoordinator.js';
import { MouseHandler } from './interaction/mouseHandler.js';
import { DragDetector } from './interaction/dragDetector.js';
import { KeyboardHandler } from './interaction/keyboardHandler.js';
import { KeybindingManager } from './interaction/keybindingManager.js';
import { InteractionStateManager } from './interaction/interactionStateManager.js';

import { WindowSelector } from './ui/windowSelector.js';
import { LayoutEditor } from './ui/layoutEditor.js';
import { LayoutSwitcher } from './ui/layoutSwitcher.js';
import { LayoutPickerBar } from './ui/layoutPickerBar.js';

import { AppearancePreferences } from './preferences/appearancePreferences.js';
import { BehaviorPreferences } from './preferences/behaviorPreferences.js';
import { LayoutPreferences } from './preferences/layoutPreferences.js';

import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Extension settings schema ID
const SCHEMA_ID = 'org.gnome.shell.extensions.turtle';

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
        try {
            // Get the schema source from the extension's schemas directory
            const schemaDir = Gio.File.new_for_path(
                import.meta.url.replace('file://', '').replace('/src/extensionController.js', '/schemas')
            );

            let schemaSource;
            if (schemaDir.query_exists(null)) {
                schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                    schemaDir.get_path(),
                    Gio.SettingsSchemaSource.get_default(),
                    false
                );
            } else {
                schemaSource = Gio.SettingsSchemaSource.get_default();
            }

            const schema = schemaSource.lookup(SCHEMA_ID, true);
            if (!schema) {
                throw new Error(`Schema ${SCHEMA_ID} not found`);
            }

            this._settings = new Gio.Settings({ settings_schema: schema });
            this._logger.debug('GSettings initialized');
        } catch (error) {
            this._logger.error('Failed to initialize GSettings', { error });
            // Continue without settings - keybindings won't work but extension can still function
            this._settings = null;
        }
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
            sc.get('monitorManager')
        ), true);
        sc.register('tileManager', () => new TileManager(
            sc.get('layoutResolver'),
            sc.get('overrideStore'),
            sc.get('windowTracker'),
            sc.get('snapHandler'),
            sc.get('eventBus')
        ), true);
        sc.register('dividerSyncManager', () => new DividerSyncManager(
            sc.get('windowTracker'),
            sc.get('overrideStore'),
            sc.get('layoutResolver'),
            sc.get('layoutManager'),
            sc.get('monitorManager'),
            sc.get('snapHandler'),
            sc.get('eventBus')
        ), true);

        // Overlay services
        sc.register('layoutOverlay', () => new LayoutOverlay(
            sc.get('eventBus'),
            sc.get('layoutResolver'),
            sc.get('monitorManager')
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
        sc.register('layoutPickerBar', () => new LayoutPickerBar(
            sc.get('layoutManager'),
            sc.get('layoutResolver'),
            sc.get('monitorManager'),
            sc.get('snapHandler'),
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
            mm.initialize(Main.layoutManager);
            return mm;
        });

        // Initialize interaction system
        cm.register('interactionStateManager', () => {
            const ism = this._serviceContainer.get('interactionStateManager');
            ism.initialize();
            return ism;
        });

        // Initialize divider sync manager
        cm.register('dividerSyncManager', () => {
            const dsm = this._serviceContainer.get('dividerSyncManager');
            dsm.initialize();
            return dsm;
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

        cm.register('layoutPickerBar', () => {
            const lpb = this._serviceContainer.get('layoutPickerBar');
            lpb.initialize(Main.uiGroup);
            return lpb;
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
            const le = this._serviceContainer.get('layoutEditor');
            lp.setLayoutEditor(le);
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

        // Layout picker bar events
        this._eventSubscriptions.push(
            this._eventBus.on('layout-picker-hidden', () => {
                this._handleLayoutPickerHidden();
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('zone-snapped', (data) => {
                this._handleZoneSnapped(data);
            })
        );

        // Global keybinding events
        this._eventSubscriptions.push(
            this._eventBus.on('keyboard-snap-window', (data) => {
                this._handleKeyboardSnapWindow(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('keyboard-cycle-layout', () => {
                this._handleKeyboardCycleLayout();
            })
        );

        // Custom layout management events
        this._eventSubscriptions.push(
            this._eventBus.on('layout-created', (data) => {
                this._handleLayoutCreated(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('layout-updated', (data) => {
                this._handleLayoutUpdated(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('layout-deleted', (data) => {
                this._handleLayoutDeleted(data);
            })
        );

        // Divider override events (save when changed)
        this._eventSubscriptions.push(
            this._eventBus.on('divider-moved', (data) => {
                this._handleDividerMoved(data);
            })
        );

        // Import/export events
        this._eventSubscriptions.push(
            this._eventBus.on('layouts-export-requested', () => {
                this._handleExportLayouts();
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('layouts-import-requested', () => {
                this._handleImportLayouts();
            })
        );

        // Layout editor events
        this._eventSubscriptions.push(
            this._eventBus.on('layout-editor-create', (data) => {
                this._handleLayoutEditorCreate(data);
            })
        );

        this._eventSubscriptions.push(
            this._eventBus.on('layout-editor-update', (data) => {
                this._handleLayoutEditorUpdate(data);
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
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');

        // Transition to OPEN state
        extensionState.transitionTo(State.OPEN);

        // Show the layout picker bar (Windows 11 style)
        layoutPickerBar.show(monitorIndex);

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
        const layoutState = this._serviceContainer.get('layoutState');
        const snapPreviewOverlay = this._serviceContainer.get('snapPreviewOverlay');
        const layoutManager = this._serviceContainer.get('layoutManager');
        const overrideStore = this._serviceContainer.get('overrideStore');

        // Debug: show all layouts in state
        const allLayouts = layoutState.getAllLayouts();
        console.log(`SnapKit DEBUG: _handleSnapPreview - checking monitor ${monitorIndex}`);
        console.log(`SnapKit DEBUG: All layouts in state:`, JSON.stringify(Array.from(allLayouts.entries())));

        // Get layout for monitor - this should use the layout set by zone-snapped
        const rawLayoutId = layoutState.getLayoutForMonitor(monitorIndex);
        const layoutId = rawLayoutId || 'half-split';

        // Log for debugging
        console.log(`SnapKit DEBUG: Drag snap preview - rawLayoutId=${rawLayoutId}, using layout ${layoutId} for monitor ${monitorIndex}`);

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
        const layoutManager = this._serviceContainer.get('layoutManager');
        const overrideStore = this._serviceContainer.get('overrideStore');

        // Get highlighted zone from preview
        const zoneIndex = snapPreviewOverlay.highlightZoneAtCursor(position.x, position.y);

        if (zoneIndex === null) {
            // No zone under cursor, hide preview
            snapPreviewOverlay.hide();
            return;
        }

        // Get layout - same logic as snap preview
        const layoutId = layoutState.getLayoutForMonitor(monitorIndex) || 'half-split';
        const layout = layoutManager.getLayout(layoutId);

        if (!layout) {
            this._logger.error('Layout not found for snap', { layoutId, monitorIndex });
            snapPreviewOverlay.hide();
            return;
        }

        // Get divider overrides
        const overrides = overrideStore.getOverrides(layoutId, monitorIndex);

        // Log for debugging
        console.log(`SnapKit: Snapping window to zone ${zoneIndex} in layout ${layoutId} on monitor ${monitorIndex}`);

        // Snap window to zone with overrides
        snapHandler.snapToZone(window, monitorIndex, layoutId, zoneIndex, layout, { overrides });

        // Hide preview
        snapPreviewOverlay.hide();

        this._logger.debug('Window snapped via drag', { zoneIndex, monitorIndex, layoutId });
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

        // Debug: check layout state at this point
        const allLayouts = layoutState.getAllLayouts();
        console.log(`SnapKit DEBUG: _handleLayoutPickerHidden - current layouts before state transition:`, JSON.stringify(Array.from(allLayouts.entries())));

        // Transition to CLOSED if still OPEN
        if (extensionState.current === State.OPEN) {
            extensionState.transitionTo(State.CLOSED);
        }

        // Check again after transition
        const afterLayouts = layoutState.getAllLayouts();
        console.log(`SnapKit DEBUG: _handleLayoutPickerHidden - current layouts after state transition:`, JSON.stringify(Array.from(afterLayouts.entries())));

        this._logger.debug('Layout picker hidden, state closed');
    }

    /**
     * Handle zone snapped event from layout picker
     * @private
     * @param {Object} data
     */
    _handleZoneSnapped(data) {
        console.log(`SnapKit DEBUG: _handleZoneSnapped CALLED with data:`, JSON.stringify({
            layoutId: data.layoutId,
            zoneIndex: data.zoneIndex,
            monitorIndex: data.monitorIndex,
            windowTitle: data.window?.get_title()
        }));

        const { layoutId, zoneIndex, monitorIndex, window } = data;
        const layoutState = this._serviceContainer.get('layoutState');

        // Log BEFORE setting
        const beforeLayoutId = layoutState.getLayoutForMonitor(monitorIndex);
        console.log(`SnapKit DEBUG: BEFORE setLayoutForMonitor - monitor ${monitorIndex} has layout: ${beforeLayoutId}`);

        // Update layout state for this monitor - this is critical for drag/snap to work
        layoutState.setLayoutForMonitor(monitorIndex, layoutId);

        // Verify the layout was set
        const verifyLayoutId = layoutState.getLayoutForMonitor(monitorIndex);

        // Log all monitors state
        const allMonitors = layoutState.getAllLayouts();
        console.log(`SnapKit DEBUG: AFTER setLayoutForMonitor - all layouts:`, JSON.stringify(Array.from(allMonitors.entries())));

        this._logger.info('Zone snapped via picker - layout set for monitor', {
            layoutId,
            verifyLayoutId,
            zoneIndex,
            monitorIndex,
            windowTitle: window?.get_title()
        });

        // Also log to console for debugging
        console.log(`SnapKit DEBUG: Layout ${layoutId} set for monitor ${monitorIndex} (verified: ${verifyLayoutId})`);
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
            monitorIndex = monitorManager.getPrimaryMonitor();
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
    }

    /**
     * Handle export layouts request
     * @private
     */
    _handleExportLayouts() {
        this._logger.info('Export layouts requested');
        // In a real implementation, this would open a file chooser dialog
        // For now, just log the export data
        const layoutManager = this._serviceContainer.get('layoutManager');
        const json = layoutManager.exportAllCustomLayouts();
        this._logger.info('Custom layouts JSON', { json });

        // Emit event with data for UI to handle file save
        this._eventBus.emit('layouts-export-data', { json });
    }

    /**
     * Handle import layouts request
     * @private
     */
    _handleImportLayouts() {
        this._logger.info('Import layouts requested');
        // In a real implementation, this would open a file chooser dialog
        // Emit event for UI to handle file selection
        this._eventBus.emit('layouts-import-dialog-requested', {});
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
        const { settings } = data;
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');

        // Apply appearance settings to layout picker bar
        layoutPickerBar.updateConfig({
            backgroundColor: settings.overlayBackgroundColor,
            borderRadius: settings.overlayBorderRadius,
            zoneColor: settings.zoneColor,
            zoneHoverColor: settings.zoneHoverColor,
            zoneBorderColor: settings.zoneBorderColor,
            zoneBorderHoverColor: settings.zoneBorderHoverColor,
            textColor: settings.textColor,
            thumbnailWidth: settings.thumbnailWidth,
            thumbnailHeight: settings.thumbnailHeight,
            animationDuration: settings.animationDuration
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
        const { settings } = data;
        const mouseHandler = this._serviceContainer.get('mouseHandler');
        const keyboardHandler = this._serviceContainer.get('keyboardHandler');
        const layoutPickerBar = this._serviceContainer.get('layoutPickerBar');

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
     * Save appearance settings
     * @private
     * @param {Object} settings
     */
    _saveAppearanceSettings(settings) {
        // Save appearance settings to GSettings
        // This can be expanded as needed
        this._logger.debug('Appearance settings saved');
    }

    /**
     * Save behavior settings
     * @private
     * @param {Object} settings
     */
    _saveBehaviorSettings(settings) {
        // Save behavior settings to GSettings
        if (settings.triggerEdge) {
            this._settings.set_string('trigger-edge', settings.triggerEdge);
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
            const json = JSON.stringify(settings.perMonitorLayouts);
            this._settings.set_string('per-monitor-layouts', json);
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
