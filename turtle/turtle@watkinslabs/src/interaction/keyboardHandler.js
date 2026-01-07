/**
 * KeyboardHandler - Handles keyboard shortcuts and navigation
 *
 * Keyboard shortcuts:
 * - Super+Space: Open overlay (toggle)
 * - Arrow keys: Navigate zones (when overlay is open)
 * - Enter: Select zone
 * - Escape: Cancel/close
 * - Number keys: Direct zone selection
 *
 * Configurable keybindings via updateConfig().
 */

import Clutter from 'gi://Clutter';

import { Logger } from '../core/logger.js';
import { State } from '../state/extensionState.js';

export class KeyboardHandler {
    /**
     * @param {EventCoordinator} eventCoordinator
     * @param {ExtensionState} extensionState
     * @param {EventBus} eventBus
     */
    constructor(eventCoordinator, extensionState, eventBus) {
        if (!eventCoordinator || !extensionState || !eventBus) {
            throw new Error('All dependencies are required');
        }

        this._eventCoordinator = eventCoordinator;
        this._extensionState = extensionState;
        this._eventBus = eventBus;
        this._logger = new Logger('KeyboardHandler');

        // Keybinding configuration
        this._config = {
            toggleOverlay: '<Super>space',
            navigateUp: 'Up',
            navigateDown: 'Down',
            navigateLeft: 'Left',
            navigateRight: 'Right',
            selectZone: 'Return',
            cancel: 'Escape'
        };

        this._enabled = false;
    }

    /**
     * Initialize keyboard handler
     */
    initialize() {
        if (this._enabled) {
            this._logger.warn('Already initialized');
            return;
        }

        // Register key-press handler with event coordinator
        this._eventCoordinator.registerHandler('key-press', (event) => {
            return this._onKeyPress(event);
        });

        this._enabled = true;
        this._logger.info('KeyboardHandler initialized');
    }

    /**
     * Handle key press
     * @private
     * @param {Clutter.Event} event
     * @returns {boolean} Clutter.EVENT_STOP or EVENT_PROPAGATE
     */
    _onKeyPress(event) {
        if (!this._enabled) {
            return Clutter.EVENT_PROPAGATE;
        }

        try {
            const symbol = event.get_key_symbol();
            const modifiers = event.get_state();
            const keyName = this._getKeyName(symbol, modifiers);

            // Get current state
            const currentState = this._extensionState.current;

            // Handle based on state
            switch (currentState) {
                case State.CLOSED:
                    return this._handleClosedState(keyName, symbol, modifiers);

                case State.OPEN:
                case State.SELECT_WINDOW:
                    return this._handleOpenState(keyName, symbol, modifiers);

                case State.DRAG_MODE:
                    return this._handleDragMode(keyName, symbol, modifiers);

                default:
                    return Clutter.EVENT_PROPAGATE;
            }
        } catch (error) {
            this._logger.error('Error in key-press handler', { error });
            return Clutter.EVENT_PROPAGATE;
        }
    }

    /**
     * Handle key press in CLOSED state
     * @private
     * @param {string} keyName
     * @param {number} symbol
     * @param {Clutter.ModifierType} modifiers
     * @returns {boolean}
     */
    _handleClosedState(keyName, symbol, modifiers) {
        // Toggle overlay (open)
        if (this._matchesKeybinding(keyName, this._config.toggleOverlay)) {
            this._logger.debug('Toggle overlay pressed (open)');
            this._eventBus.emit('keyboard-toggle-overlay', {});
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Handle key press in OPEN or SELECT_WINDOW state
     * @private
     * @param {string} keyName
     * @param {number} symbol
     * @param {Clutter.ModifierType} modifiers
     * @returns {boolean}
     */
    _handleOpenState(keyName, symbol, modifiers) {
        // Cancel/close
        if (this._matchesKey(symbol, this._config.cancel)) {
            this._logger.debug('Cancel pressed');
            this._eventBus.emit('keyboard-cancel', {});
            return Clutter.EVENT_STOP;
        }

        // Select zone
        if (this._matchesKey(symbol, this._config.selectZone)) {
            this._logger.debug('Select zone pressed');
            this._eventBus.emit('keyboard-select-zone', {});
            return Clutter.EVENT_STOP;
        }

        // Navigate up
        if (this._matchesKey(symbol, this._config.navigateUp)) {
            this._logger.debug('Navigate up pressed');
            this._eventBus.emit('keyboard-navigate', { direction: 'up' });
            return Clutter.EVENT_STOP;
        }

        // Navigate down
        if (this._matchesKey(symbol, this._config.navigateDown)) {
            this._logger.debug('Navigate down pressed');
            this._eventBus.emit('keyboard-navigate', { direction: 'down' });
            return Clutter.EVENT_STOP;
        }

        // Navigate left
        if (this._matchesKey(symbol, this._config.navigateLeft)) {
            this._logger.debug('Navigate left pressed');
            this._eventBus.emit('keyboard-navigate', { direction: 'left' });
            return Clutter.EVENT_STOP;
        }

        // Navigate right
        if (this._matchesKey(symbol, this._config.navigateRight)) {
            this._logger.debug('Navigate right pressed');
            this._eventBus.emit('keyboard-navigate', { direction: 'right' });
            return Clutter.EVENT_STOP;
        }

        // Number keys for direct zone selection (1-9)
        if (symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_9) {
            const zoneIndex = symbol - Clutter.KEY_1; // 0-based
            this._logger.debug('Direct zone selection', { zoneIndex });
            this._eventBus.emit('keyboard-direct-select', { zoneIndex });
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Handle key press in DRAG_MODE state
     * @private
     * @param {string} keyName
     * @param {number} symbol
     * @param {Clutter.ModifierType} modifiers
     * @returns {boolean}
     */
    _handleDragMode(keyName, symbol, modifiers) {
        // Cancel drag
        if (this._matchesKey(symbol, this._config.cancel)) {
            this._logger.debug('Cancel drag pressed');
            this._eventBus.emit('keyboard-cancel-drag', {});
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Get key name with modifiers
     * @private
     * @param {number} symbol
     * @param {Clutter.ModifierType} modifiers
     * @returns {string}
     */
    _getKeyName(symbol, modifiers) {
        let keyName = '';

        // Add modifiers
        if (modifiers & Clutter.ModifierType.CONTROL_MASK) {
            keyName += '<Control>';
        }
        if (modifiers & Clutter.ModifierType.SHIFT_MASK) {
            keyName += '<Shift>';
        }
        if (modifiers & Clutter.ModifierType.MOD1_MASK) {
            keyName += '<Alt>';
        }
        if (modifiers & Clutter.ModifierType.SUPER_MASK) {
            keyName += '<Super>';
        }

        // Add key
        keyName += Clutter.get_key_name(symbol);

        return keyName;
    }

    /**
     * Check if key name matches keybinding
     * @private
     * @param {string} keyName
     * @param {string} keybinding
     * @returns {boolean}
     */
    _matchesKeybinding(keyName, keybinding) {
        return keyName.toLowerCase() === keybinding.toLowerCase();
    }

    /**
     * Check if key symbol matches key name
     * @private
     * @param {number} symbol
     * @param {string} keyName
     * @returns {boolean}
     */
    _matchesKey(symbol, keyName) {
        const actualKeyName = Clutter.get_key_name(symbol);
        return actualKeyName.toLowerCase() === keyName.toLowerCase();
    }

    /**
     * Update configuration
     *
     * @param {Object} config - Keybinding configuration
     */
    updateConfig(config) {
        if (config.toggleOverlay !== undefined) {
            this._config.toggleOverlay = config.toggleOverlay;
        }
        if (config.navigateUp !== undefined) {
            this._config.navigateUp = config.navigateUp;
        }
        if (config.navigateDown !== undefined) {
            this._config.navigateDown = config.navigateDown;
        }
        if (config.navigateLeft !== undefined) {
            this._config.navigateLeft = config.navigateLeft;
        }
        if (config.navigateRight !== undefined) {
            this._config.navigateRight = config.navigateRight;
        }
        if (config.selectZone !== undefined) {
            this._config.selectZone = config.selectZone;
        }
        if (config.cancel !== undefined) {
            this._config.cancel = config.cancel;
        }

        this._logger.debug('Configuration updated', this._config);
    }

    /**
     * Get current configuration
     *
     * @returns {Object}
     */
    getConfig() {
        return { ...this._config };
    }

    /**
     * Enable keyboard handler
     */
    enable() {
        if (this._enabled) {
            return;
        }

        this.initialize();
    }

    /**
     * Disable keyboard handler
     */
    disable() {
        if (!this._enabled) {
            return;
        }

        this._enabled = false;
        this._logger.info('KeyboardHandler disabled');
    }

    /**
     * Destroy keyboard handler
     */
    destroy() {
        this.disable();

        // Unregister handler
        this._eventCoordinator.unregisterHandler('key-press');

        this._logger.info('KeyboardHandler destroyed');
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
