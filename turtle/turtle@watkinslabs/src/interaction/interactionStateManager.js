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
            this._eventBus.on('keyboard-select-zone', () => {
                this._onKeyboardSelectZone();
            })
        );

        this._subscriptions.push(
            this._eventBus.on('keyboard-direct-select', (data) => {
                this._onKeyboardDirectSelect(data);
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
        const { window, position } = data;

        this._logger.debug('Window drag started', {
            windowTitle: window.get_title(),
            position
        });

        // Determine monitor
        const rect = window.get_frame_rect();
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        const monitorIndex = this._monitorManager.getMonitorAtPoint(centerX, centerY);

        // Debug logging
        console.log(`SnapKit DEBUG: _onWindowDragStart - window rect: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);
        console.log(`SnapKit DEBUG: _onWindowDragStart - center: (${centerX}, ${centerY}) -> monitorIndex=${monitorIndex}`);

        this._currentMonitor = monitorIndex;

        // Request snap preview overlay
        this._eventBus.emit('request-snap-preview', {
            monitorIndex,
            window
        });
    }

    /**
     * Handle window drag move
     * @private
     * @param {Object} data
     */
    _onWindowDragMove(data) {
        const { window, position } = data;

        // Update snap preview based on cursor position
        this._eventBus.emit('update-snap-preview', {
            window,
            position
        });
    }

    /**
     * Handle window drag end
     * @private
     * @param {Object} data
     */
    _onWindowDragEnd(data) {
        const { window, position } = data;

        this._logger.debug('Window drag ended', {
            windowTitle: window.get_title(),
            position
        });

        // Request snap to zone (if applicable)
        this._eventBus.emit('request-snap-to-zone', {
            window,
            position,
            monitorIndex: this._currentMonitor
        });
    }

    /**
     * Handle keyboard toggle overlay
     * @private
     */
    _onKeyboardToggleOverlay() {
        const currentState = this._extensionState.current;

        if (currentState === State.CLOSED) {
            // Open overlay on primary monitor
            const primaryMonitor = this._monitorManager.getPrimaryMonitor();
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
     * Handle keyboard zone selection
     * @private
     */
    _onKeyboardSelectZone() {
        this._logger.debug('Select zone via keyboard');
        this._eventBus.emit('request-zone-select', {});
    }

    /**
     * Handle keyboard direct selection
     * @private
     * @param {Object} data
     */
    _onKeyboardDirectSelect(data) {
        const { zoneIndex } = data;

        this._logger.debug('Direct zone selection via keyboard', { zoneIndex });

        this._eventBus.emit('request-direct-zone-select', { zoneIndex });
    }

    /**
     * Handle keyboard cancel drag
     * @private
     */
    _onKeyboardCancelDrag() {
        this._logger.debug('Cancel drag via keyboard');
        this._eventBus.emit('request-cancel-drag', {});
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
