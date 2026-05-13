/**
 * InteractionStateManager - Manages interaction layer
 *
 * Coordinates:
 * - EventCoordinator (central event routing)
 * - MouseHandler (edge detection, cursor tracking)
 * - DragDetector (window drag detection)
 * - KeyboardHandler (shortcuts, navigation)
 *
 * Subscribes to all interaction events and coordinates responses.
 * Provides central point for enabling/disabling interactions.
 */

import Clutter from 'gi://Clutter';

import { Logger } from '../core/logger.js';
import { State } from '../state/extensionState.js';

export class InteractionStateManager {
    /**
     * @param {EventCoordinator} eventCoordinator
     * @param {MouseHandler} mouseHandler
     * @param {DragDetector} dragDetector
     * @param {KeyboardHandler} keyboardHandler
     * @param {ExtensionState} extensionState
     * @param {EventBus} eventBus
     * @param {MonitorManager} monitorManager
     */
    constructor(
        eventCoordinator,
        mouseHandler,
        dragDetector,
        keyboardHandler,
        extensionState,
        eventBus,
        monitorManager
    ) {
        if (!eventCoordinator || !mouseHandler || !dragDetector ||
            !keyboardHandler || !extensionState || !eventBus || !monitorManager) {
            throw new Error('All dependencies are required');
        }

        this._eventCoordinator = eventCoordinator;
        this._mouseHandler = mouseHandler;
        this._dragDetector = dragDetector;
        this._keyboardHandler = keyboardHandler;
        this._extensionState = extensionState;
        this._eventBus = eventBus;
        this._monitorManager = monitorManager;
        this._logger = new Logger('InteractionStateManager');

        // Event subscriptions
        this._subscriptions = [];

        // Interaction state
        this._enabled = false;
        this._currentMonitor = null;
        this._triggerZone = null;
        this._dragCancelled = false;
        this._dragOverlayOpen = false;
        this._dragZonesActive = true;
        this._dragZoneModifierConfig = {
            autoSnapOnDrag: true,
            modifierDisablesZones: true,
            modifierKey: 'control'
        };
    }

    /**
     * Initialize interaction manager
     */
    initialize() {
        if (this._enabled) {
            this._logger.warn('Already initialized');
            return;
        }

        // Initialize all components
        this._eventCoordinator.initialize();
        this._mouseHandler.initialize();
        this._dragDetector.initialize();
        this._keyboardHandler.initialize();

        // Subscribe to events
        this._setupEventSubscriptions();

        this._enabled = true;
        this._logger.info('InteractionStateManager initialized');
    }

    /**
     * Setup event subscriptions
     * @private
     */
    _setupEventSubscriptions() {
        // Mouse events
        this._subscriptions.push(
            this._eventBus.on('trigger-zone-entered', (data) => {
                this._onTriggerZoneEntered(data);
            })
        );

        this._subscriptions.push(
            this._eventBus.on('trigger-zone-left', () => {
                this._onTriggerZoneLeft();
            })
        );

        // Drag events
        this._subscriptions.push(
            this._eventBus.on('window-drag-start', (data) => {
                this._onWindowDragStart(data);
            })
        );

        this._subscriptions.push(
            this._eventBus.on('window-drag-move', (data) => {
                this._onWindowDragMove(data);
            })
        );

        this._subscriptions.push(
            this._eventBus.on('window-drag-shake', (data) => {
                this._onWindowDragShake(data);
            })
        );

        this._subscriptions.push(
            this._eventBus.on('window-drag-end', (data) => {
                this._onWindowDragEnd(data);
            })
        );

        // Keyboard events
        this._subscriptions.push(
            this._eventBus.on('keyboard-toggle-overlay', () => {
                this._onKeyboardToggleOverlay();
            })
        );

        this._subscriptions.push(
            this._eventBus.on('keyboard-cancel', () => {
                this._onKeyboardCancel();
            })
        );

        this._subscriptions.push(
            this._eventBus.on('keyboard-navigate', (data) => {
                this._onKeyboardNavigate(data);
            })
        );

        this._subscriptions.push(
            this._eventBus.on('keyboard-cancel-drag', () => {
                this._onKeyboardCancelDrag();
            })
        );

        // State change events
        this._subscriptions.push(
            this._eventBus.on('extension-state-changed', (data) => {
                this._onStateChanged(data);
            })
        );
    }

    /**
     * Handle trigger zone entered
     * @private
     * @param {Object} data
     */
    _onTriggerZoneEntered(data) {
        const { zone, x, y } = data;

        this._logger.debug('Trigger zone entered', {
            type: zone.type,
            edge: zone.edge,
            monitor: zone.monitorIndex
        });

        this._currentMonitor = zone.monitorIndex;
        this._triggerZone = zone;

        // Request overlay open
        this._eventBus.emit('request-open-overlay', {
            monitorIndex: zone.monitorIndex,
            triggerZone: zone,
            position: { x, y }
        });
    }

    /**
     * Handle trigger zone left
     * @private
     */
    _onTriggerZoneLeft() {
        this._triggerZone = null;
    }

    /**
     * Handle window drag start
     * @private
     * @param {Object} data
     */
    _onWindowDragStart(data) {
        const { window, position, modifiers = 0 } = data;

        if (!window) {
            this._logger.warn('Window drag started with null window');
            return;
        }

        // Validate window is still valid
        let rect;
        try {
            rect = window.get_frame_rect();
        } catch (e) {
            this._logger.warn('Window drag started with invalid window');
            return;
        }

        this._logger.debug('Window drag started', {
            windowTitle: window.get_title(),
            position
        });

        this._dragCancelled = false;
        this._dragZonesActive = this._areDragZonesActive(modifiers);

        // Determine monitor
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        const detectedMonitor = this._monitorManager.getMonitorAtPoint(centerX, centerY);
        const monitorIndex = detectedMonitor !== -1
            ? detectedMonitor
            : this._monitorManager.getPrimaryMonitorIndex();

        this._currentMonitor = monitorIndex;

        if (this._dragZonesActive) {
            this._dragOverlayOpen = true;
            this._eventBus.emit('request-open-overlay', {
                monitorIndex,
                triggerZone: null,
                position,
                pinnedOpen: true
            });

            // Request snap preview overlay
            this._eventBus.emit('request-snap-preview', {
                monitorIndex,
                window
            });
        } else {
            this._dragOverlayOpen = false;
            this._eventBus.emit('update-snap-preview', {
                window,
                position,
                monitorIndex,
                zonesActive: false,
                modifiers
            });
        }
    }

    /**
     * Handle window drag move
     * @private
     * @param {Object} data
     */
    _onWindowDragMove(data) {
        const { window, position, modifiers = 0 } = data;

        if (this._dragCancelled) {
            return;
        }

        const previousMonitor = this._currentMonitor;
        const pointerMonitor = this._monitorManager.getMonitorAtPoint(position.x, position.y);
        if (pointerMonitor !== -1) {
            this._currentMonitor = pointerMonitor;
        }

        const zonesActive = this._areDragZonesActive(modifiers);
        const monitorChanged = pointerMonitor !== -1 && previousMonitor !== pointerMonitor;
        const zonesBecameActive = zonesActive && !this._dragZonesActive;
        this._dragZonesActive = zonesActive;

        if (zonesActive &&
            this._currentMonitor !== null &&
            this._currentMonitor !== -1 &&
            (monitorChanged || zonesBecameActive || !this._dragOverlayOpen)) {
            this._dragOverlayOpen = true;
            this._eventBus.emit('request-open-overlay', {
                monitorIndex: this._currentMonitor,
                triggerZone: null,
                position,
                pinnedOpen: true
            });

            this._eventBus.emit('request-snap-preview', {
                monitorIndex: this._currentMonitor,
                window
            });
        } else if (!zonesActive) {
            this._dragOverlayOpen = false;
        }

        // Update snap preview based on cursor position
        this._eventBus.emit('update-snap-preview', {
            window,
            position,
            monitorIndex: this._currentMonitor,
            zonesActive,
            modifiers
        });
    }

    /**
     * Handle window drag end
     * @private
     * @param {Object} data
     */
    _onWindowDragEnd(data) {
        const { window, position, modifiers = 0 } = data;
        const pointerMonitor = this._monitorManager.getMonitorAtPoint(position.x, position.y);
        const dropMonitor = pointerMonitor !== -1
            ? pointerMonitor
            : (this._currentMonitor !== null && this._currentMonitor !== -1
                ? this._currentMonitor
                : this._monitorManager.getPrimaryMonitorIndex());
        this._currentMonitor = dropMonitor;
        const zonesActive = this._areDragZonesActive(modifiers);
        this._dragZonesActive = zonesActive;

        this._logger.debug('Window drag ended', {
            windowTitle: window.get_title(),
            position,
            zonesActive
        });

        if (this._dragCancelled) {
            this._dragCancelled = false;
            this._dragOverlayOpen = false;
            this._dragZonesActive = true;
            this._eventBus.emit('cancel-snap-preview', {
                reason: 'shake',
                window,
                position,
                monitorIndex: dropMonitor
            });
            return;
        }

        // Request snap to zone (if applicable)
        this._eventBus.emit('request-snap-to-zone', {
            window,
            position,
            monitorIndex: dropMonitor,
            zonesActive,
            modifiers
        });

        this._dragOverlayOpen = false;
        this._dragZonesActive = true;
    }

    /**
     * Handle shake gesture during drag to exit snap mode
     * @private
     * @param {Object} data
     */
    _onWindowDragShake(data) {
        if (this._dragCancelled) {
            return;
        }

        this._dragCancelled = true;
        this._dragOverlayOpen = false;
        this._dragZonesActive = true;

        // Close snap preview and return to normal drag
        this._eventBus.emit('cancel-snap-preview', {
            reason: 'shake',
            position: data.position,
            window: data.window,
            monitorIndex: this._currentMonitor
        });

        if (this._extensionState.current !== State.CLOSED && this._extensionState.canTransitionTo(State.CLOSED)) {
            try {
                this._extensionState.transitionTo(State.CLOSED);
            } catch (error) {
                this._logger.warn('Failed to transition to CLOSED after shake gesture', { error });
            }
        }

        this._logger.info('Shake detected, snap mode cancelled');
    }

    /**
     * Normalize configured modifier key.
     * @private
     * @param {string} modifierKey
     * @returns {string}
     */
    _normalizeDragModifierKey(modifierKey) {
        const normalized = typeof modifierKey === 'string'
            ? modifierKey.trim().toLowerCase()
            : '';
        return ['control', 'shift', 'alt', 'super'].includes(normalized)
            ? normalized
            : 'control';
    }

    /**
     * Check whether any modifier mask matches current state.
     * @private
     * @param {number} modifiers
     * @param {string[]} maskNames
     * @returns {boolean}
     */
    _hasModifierMask(modifiers = 0, maskNames = []) {
        for (const name of maskNames) {
            const mask = Clutter.ModifierType?.[name];
            if (typeof mask === 'number' && (modifiers & mask) !== 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check whether configured drag modifier is pressed.
     * @private
     * @param {number} modifiers
     * @returns {boolean}
     */
    _isDragModifierPressed(modifiers = 0) {
        switch (this._dragZoneModifierConfig.modifierKey) {
            case 'control':
                return this._hasModifierMask(modifiers, ['CONTROL_MASK']);
            case 'shift':
                return this._hasModifierMask(modifiers, ['SHIFT_MASK']);
            case 'alt':
                return this._hasModifierMask(modifiers, ['MOD1_MASK']);
            case 'super':
                return this._hasModifierMask(modifiers, ['SUPER_MASK', 'MOD4_MASK']);
            default:
                return false;
        }
    }

    /**
     * Resolve whether drag zones should be active for current modifier state.
     * @private
     * @param {number} modifiers
     * @returns {boolean}
     */
    _areDragZonesActive(modifiers = 0) {
        if (!this._dragZoneModifierConfig.autoSnapOnDrag) {
            return false;
        }
        const modifierPressed = this._isDragModifierPressed(modifiers);
        return this._dragZoneModifierConfig.modifierDisablesZones
            ? !modifierPressed
            : modifierPressed;
    }


    /**
     * Handle keyboard toggle overlay
     * @private
     */
    _onKeyboardToggleOverlay() {
        const currentState = this._extensionState.current;

        if (currentState === State.CLOSED) {
            // Open overlay on primary monitor
            const primaryMonitor = this._monitorManager.getPrimaryMonitorIndex();
            this._currentMonitor = primaryMonitor;

            this._logger.debug('Opening overlay via keyboard');

            this._eventBus.emit('request-open-overlay', {
                monitorIndex: primaryMonitor,
                triggerZone: null,
                position: null
            });
        } else {
            // Close overlay
            this._logger.debug('Closing overlay via keyboard');
            this._eventBus.emit('request-close-overlay', {});
        }
    }

    /**
     * Handle keyboard cancel
     * @private
     */
    _onKeyboardCancel() {
        this._logger.debug('Cancel via keyboard');
        this._eventBus.emit('request-cancel', {});
    }

    /**
     * Handle keyboard navigation
     * @private
     * @param {Object} data
     */
    _onKeyboardNavigate(data) {
        const { direction } = data;

        this._logger.debug('Navigate via keyboard', { direction });

        // Forward to overlay
        this._eventBus.emit('request-zone-navigation', { direction });
    }

    /**
     * Handle keyboard cancel drag
     * @private
     */
    _onKeyboardCancelDrag() {
        this._logger.debug('Cancel drag via keyboard');
    }

    /**
     * Handle state change
     * @private
     * @param {Object} data
     */
    _onStateChanged(data) {
        const { oldState, newState } = data;

        this._logger.debug('State changed in interaction manager', {
            oldState,
            newState
        });

        // Clear interaction state on state changes
        if (newState === State.CLOSED) {
            this._currentMonitor = null;
            this._triggerZone = null;
            this._dragOverlayOpen = false;
            this._dragZonesActive = true;
        }
    }

    /**
     * Get current monitor
     *
     * @returns {number|null}
     */
    getCurrentMonitor() {
        return this._currentMonitor;
    }

    /**
     * Get current trigger zone
     *
     * @returns {Object|null}
     */
    getCurrentTriggerZone() {
        return this._triggerZone ? { ...this._triggerZone } : null;
    }

    /**
     * Update mouse handler configuration
     *
     * @param {Object} config
     */
    updateMouseConfig(config) {
        this._mouseHandler.updateConfig(config);
    }

    /**
     * Update keyboard handler configuration
     *
     * @param {Object} config
     */
    updateKeyboardConfig(config) {
        this._keyboardHandler.updateConfig(config);
    }

    /**
     * Update drag modifier behavior configuration.
     *
     * @param {Object} config
     */
    updateDragZoneModifierConfig(config) {
        if (!config || typeof config !== 'object') {
            return;
        }

        let updated = false;
        const autoSnapOnDrag = config.autoSnapOnDrag;
        if (typeof autoSnapOnDrag === 'boolean') {
            this._dragZoneModifierConfig.autoSnapOnDrag = autoSnapOnDrag;
            updated = true;
        }

        const modifierDisablesZones = config.modifierDisablesZones ?? config.dragZoneModifierDisablesZones;
        if (typeof modifierDisablesZones === 'boolean') {
            this._dragZoneModifierConfig.modifierDisablesZones = modifierDisablesZones;
            updated = true;
        }

        const modifierKey = config.modifierKey ?? config.dragZoneModifierKey;
        if (modifierKey !== undefined) {
            this._dragZoneModifierConfig.modifierKey = this._normalizeDragModifierKey(modifierKey);
            updated = true;
        }

        if (updated) {
            this._logger.debug('Drag zone modifier configuration updated', this._dragZoneModifierConfig);
        }
    }

    /**
     * Enable interaction manager
     */
    enable() {
        if (this._enabled) {
            return;
        }

        this.initialize();
    }

    /**
     * Disable interaction manager
     */
    disable() {
        if (!this._enabled) {
            return;
        }

        // Disable all components
        this._mouseHandler.disable();
        this._dragDetector.disable();
        this._keyboardHandler.disable();
        this._eventCoordinator.disable();

        this._enabled = false;
        this._logger.info('InteractionStateManager disabled');
    }

    /**
     * Destroy interaction manager
     */
    destroy() {
        this.disable();

        // Unsubscribe from all events
        for (const unsubscribe of this._subscriptions) {
            unsubscribe();
        }
        this._subscriptions = [];

        // Destroy all components
        this._mouseHandler.destroy();
        this._dragDetector.destroy();
        this._keyboardHandler.destroy();
        this._eventCoordinator.destroy();

        this._logger.info('InteractionStateManager destroyed');
    }

    /**
     * Check if enabled
     *
     * @returns {boolean}
     */
    get isEnabled() {
        return this._enabled;
    }

    /**
     * Get mouse handler
     *
     * @returns {MouseHandler}
     */
    getMouseHandler() {
        return this._mouseHandler;
    }

    /**
     * Get drag detector
     *
     * @returns {DragDetector}
     */
    getDragDetector() {
        return this._dragDetector;
    }

    /**
     * Get keyboard handler
     *
     * @returns {KeyboardHandler}
     */
    getKeyboardHandler() {
        return this._keyboardHandler;
    }

    /**
     * Get event coordinator
     *
     * @returns {EventCoordinator}
     */
    getEventCoordinator() {
        return this._eventCoordinator;
    }
}
