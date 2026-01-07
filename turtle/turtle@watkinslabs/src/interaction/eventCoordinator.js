/**
 * EventCoordinator - Central event coordination for user input
 *
 * Coordinates:
 * - Mouse events (motion, clicks)
 * - Keyboard events (shortcuts, navigation)
 * - Window events (drag start/end)
 *
 * Routes events to appropriate handlers based on current state.
 * NO POLLING - all event-driven.
 */

import Clutter from 'gi://Clutter';

import { Logger } from '../core/logger.js';
import { State } from '../state/extensionState.js';

export class EventCoordinator {
    /**
     * @param {ExtensionState} extensionState
     * @param {EventBus} eventBus
     */
    constructor(extensionState, eventBus) {
        if (!extensionState || !eventBus) {
            throw new Error('extensionState and eventBus are required');
        }

        this._extensionState = extensionState;
        this._eventBus = eventBus;
        this._logger = new Logger('EventCoordinator');

        this._handlers = new Map(); // event type -> handler function
        this._signalIds = [];
        this._enabled = false;
    }

    /**
     * Initialize event coordination
     * Sets up global event listeners
     */
    initialize() {
        if (this._enabled) {
            this._logger.warn('Already initialized');
            return;
        }

        // Connect to stage events
        if (global.stage) {
            this._connectStageEvents();
        }

        // Subscribe to state changes
        this._extensionState.subscribe((oldState, newState) => {
            this._onStateChange(oldState, newState);
        });

        this._enabled = true;
        this._logger.info('EventCoordinator initialized');
    }

    /**
     * Connect to stage events
     * @private
     */
    _connectStageEvents() {
        // Key press events
        const keySignalId = global.stage.connect('key-press-event', (actor, event) => {
            return this._onKeyPress(event);
        });
        this._signalIds.push({ actor: global.stage, id: keySignalId });

        // Key release events
        const keyReleaseSignalId = global.stage.connect('key-release-event', (actor, event) => {
            return this._onKeyRelease(event);
        });
        this._signalIds.push({ actor: global.stage, id: keyReleaseSignalId });

        // Motion events (cursor movement)
        const motionSignalId = global.stage.connect('motion-event', (actor, event) => {
            return this._onMotion(event);
        });
        this._signalIds.push({ actor: global.stage, id: motionSignalId });

        // Button press events (mouse clicks)
        const buttonSignalId = global.stage.connect('button-press-event', (actor, event) => {
            return this._onButtonPress(event);
        });
        this._signalIds.push({ actor: global.stage, id: buttonSignalId });

        this._logger.debug('Stage events connected');
    }

    /**
     * Register an event handler
     *
     * @param {string} eventType - Event type (e.g., 'key-press', 'motion', 'button-press')
     * @param {Function} handler - Handler function (event) => Clutter.EVENT_STOP|PROPAGATE
     */
    registerHandler(eventType, handler) {
        if (typeof handler !== 'function') {
            throw new Error('Handler must be a function');
        }

        this._handlers.set(eventType, handler);
        this._logger.debug('Handler registered', { eventType });
    }

    /**
     * Unregister an event handler
     *
     * @param {string} eventType
     * @returns {boolean} True if handler was removed
     */
    unregisterHandler(eventType) {
        const removed = this._handlers.delete(eventType);
        if (removed) {
            this._logger.debug('Handler unregistered', { eventType });
        }
        return removed;
    }

    /**
     * Handle key press
     * @private
     * @param {Clutter.Event} event
     * @returns {boolean} Clutter.EVENT_STOP or EVENT_PROPAGATE
     */
    _onKeyPress(event) {
        // Route to registered handler
        const handler = this._handlers.get('key-press');
        if (handler) {
            try {
                return handler(event);
            } catch (error) {
                this._logger.error('Error in key-press handler', { error });
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Handle key release
     * @private
     * @param {Clutter.Event} event
     * @returns {boolean}
     */
    _onKeyRelease(event) {
        const handler = this._handlers.get('key-release');
        if (handler) {
            try {
                return handler(event);
            } catch (error) {
                this._logger.error('Error in key-release handler', { error });
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Handle motion (cursor movement)
     * @private
     * @param {Clutter.Event} event
     * @returns {boolean}
     */
    _onMotion(event) {
        const handler = this._handlers.get('motion');
        if (handler) {
            try {
                return handler(event);
            } catch (error) {
                this._logger.error('Error in motion handler', { error });
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Handle button press (mouse click)
     * @private
     * @param {Clutter.Event} event
     * @returns {boolean}
     */
    _onButtonPress(event) {
        const handler = this._handlers.get('button-press');
        if (handler) {
            try {
                return handler(event);
            } catch (error) {
                this._logger.error('Error in button-press handler', { error });
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Handle state change
     * @private
     * @param {string} oldState
     * @param {string} newState
     */
    _onStateChange(oldState, newState) {
        this._logger.debug('State changed', { oldState, newState });

        // Emit state change event for handlers to react
        this._eventBus.emit('extension-state-changed', { oldState, newState });

        // State-specific logic
        switch (newState) {
            case State.CLOSED:
                // Extension idle, enable trigger detection
                this._eventBus.emit('enable-trigger-detection', {});
                break;

            case State.OPEN:
                // Overlay open, disable trigger detection
                this._eventBus.emit('disable-trigger-detection', {});
                break;

            case State.DRAG_MODE:
                // Drag mode, enable drag tracking
                this._eventBus.emit('enable-drag-tracking', {});
                break;

            case State.SELECT_WINDOW:
                // Window selection, may need different input handling
                break;
        }
    }

    /**
     * Enable event coordination
     */
    enable() {
        if (this._enabled) {
            return;
        }

        this.initialize();
    }

    /**
     * Disable event coordination
     */
    disable() {
        if (!this._enabled) {
            return;
        }

        this._enabled = false;

        // Emit disable event
        this._eventBus.emit('event-coordination-disabled', {});

        this._logger.info('EventCoordinator disabled');
    }

    /**
     * Cleanup
     */
    destroy() {
        this.disable();

        // Disconnect all signals
        for (const { actor, id } of this._signalIds) {
            try {
                actor.disconnect(id);
            } catch (e) {
                // Actor may be destroyed
            }
        }
        this._signalIds = [];

        this._handlers.clear();

        this._logger.info('EventCoordinator destroyed');
    }

    /**
     * Get current state
     * @returns {string}
     */
    getCurrentState() {
        return this._extensionState.current;
    }

    /**
     * Check if enabled
     * @returns {boolean}
     */
    get isEnabled() {
        return this._enabled;
    }
}
