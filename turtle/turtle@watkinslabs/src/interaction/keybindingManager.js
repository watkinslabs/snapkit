/**
 * KeybindingManager - Registers global keyboard shortcuts with GNOME Shell
 *
 * Handles global keybindings that work system-wide:
 * - Super+Space: Toggle overlay
 * - Super+Arrow: Quick snap to halves
 * - Super+Alt+Arrow: Snap to quarters
 * - Super+Control+Space: Cycle layouts
 *
 * Uses Main.wm.addKeybinding() for proper GNOME Shell integration.
 */

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Logger } from '../core/logger.js';

// Keybinding flags and modes
const KEYBINDING_FLAGS = Meta.KeyBindingFlags.NONE;
const KEYBINDING_MODE = Shell.ActionMode.NORMAL |
                        Shell.ActionMode.OVERVIEW;

export class KeybindingManager {
    /**
     * @param {EventBus} eventBus
     * @param {Gio.Settings} settings - GSettings instance for the extension
     */
    constructor(eventBus, settings) {
        if (!eventBus) {
            throw new Error('eventBus is required');
        }

        this._eventBus = eventBus;
        this._settings = settings;
        this._logger = new Logger('KeybindingManager');

        // Track registered keybindings for cleanup
        this._registeredBindings = [];

        this._enabled = false;
    }

    /**
     * Initialize and register all keybindings
     */
    initialize() {
        if (this._enabled) {
            this._logger.warn('Already initialized');
            return;
        }

        if (!this._settings) {
            this._logger.error('No settings provided, cannot register keybindings');
            return;
        }

        try {
            // Register all global keybindings
            this._registerKeybinding('toggle-overlay', () => {
                this._onToggleOverlay();
            });

            this._registerKeybinding('snap-left', () => {
                this._onSnapDirection('left');
            });

            this._registerKeybinding('snap-right', () => {
                this._onSnapDirection('right');
            });

            this._registerKeybinding('snap-up', () => {
                this._onSnapDirection('up');
            });

            this._registerKeybinding('snap-down', () => {
                this._onSnapDirection('down');
            });

            this._registerKeybinding('snap-topleft', () => {
                this._onSnapCorner('top-left');
            });

            this._registerKeybinding('snap-topright', () => {
                this._onSnapCorner('top-right');
            });

            this._registerKeybinding('snap-bottomleft', () => {
                this._onSnapCorner('bottom-left');
            });

            this._registerKeybinding('snap-bottomright', () => {
                this._onSnapCorner('bottom-right');
            });

            this._registerKeybinding('cycle-layout', () => {
                this._onCycleLayout();
            });

            this._enabled = true;
            this._logger.info('KeybindingManager initialized', {
                bindingsCount: this._registeredBindings.length
            });
        } catch (error) {
            this._logger.error('Failed to initialize keybindings', { error });
        }
    }

    /**
     * Register a single keybinding
     * @private
     * @param {string} name - Keybinding name (matches gschema key)
     * @param {Function} callback - Handler function
     */
    _registerKeybinding(name, callback) {
        try {
            Main.wm.addKeybinding(
                name,
                this._settings,
                KEYBINDING_FLAGS,
                KEYBINDING_MODE,
                callback
            );

            this._registeredBindings.push(name);
            this._logger.debug('Keybinding registered', { name });
        } catch (error) {
            this._logger.error('Failed to register keybinding', { name, error });
        }
    }

    /**
     * Handle toggle overlay keybinding
     * @private
     */
    _onToggleOverlay() {
        this._logger.debug('Toggle overlay keybinding triggered');
        this._eventBus.emit('keyboard-toggle-overlay', {});
    }

    /**
     * Handle snap direction keybinding
     * @private
     * @param {string} direction - 'left', 'right', 'up', 'down'
     */
    _onSnapDirection(direction) {
        const window = global.display.focus_window;
        if (!window) {
            this._logger.debug('No focused window for snap');
            return;
        }

        this._logger.debug('Snap direction keybinding triggered', { direction });

        // Map direction to zone in half-split layouts
        const zoneMap = {
            'left': { layoutId: 'half-split', zoneIndex: 0 },
            'right': { layoutId: 'half-split', zoneIndex: 1 },
            'up': { layoutId: 'half-horizontal', zoneIndex: 0 },
            'down': { layoutId: 'half-horizontal', zoneIndex: 1 }
        };

        const snapInfo = zoneMap[direction];
        if (snapInfo) {
            this._eventBus.emit('keyboard-snap-window', {
                window,
                layoutId: snapInfo.layoutId,
                zoneIndex: snapInfo.zoneIndex
            });
        }
    }

    /**
     * Handle snap corner keybinding
     * @private
     * @param {string} corner - 'top-left', 'top-right', 'bottom-left', 'bottom-right'
     */
    _onSnapCorner(corner) {
        const window = global.display.focus_window;
        if (!window) {
            this._logger.debug('No focused window for snap');
            return;
        }

        this._logger.debug('Snap corner keybinding triggered', { corner });

        // Map corner to zone in quarters layout
        const zoneMap = {
            'top-left': 0,
            'top-right': 1,
            'bottom-left': 2,
            'bottom-right': 3
        };

        const zoneIndex = zoneMap[corner];
        if (zoneIndex !== undefined) {
            this._eventBus.emit('keyboard-snap-window', {
                window,
                layoutId: 'quarters',
                zoneIndex
            });
        }
    }

    /**
     * Handle cycle layout keybinding
     * @private
     */
    _onCycleLayout() {
        this._logger.debug('Cycle layout keybinding triggered');
        this._eventBus.emit('keyboard-cycle-layout', {});
    }

    /**
     * Enable keybinding manager
     */
    enable() {
        if (this._enabled) {
            return;
        }
        this.initialize();
    }

    /**
     * Disable keybinding manager
     */
    disable() {
        if (!this._enabled) {
            return;
        }

        this._enabled = false;
        this._logger.info('KeybindingManager disabled');
    }

    /**
     * Destroy and unregister all keybindings
     */
    destroy() {
        this.disable();

        // Unregister all keybindings
        for (const name of this._registeredBindings) {
            try {
                Main.wm.removeKeybinding(name);
                this._logger.debug('Keybinding unregistered', { name });
            } catch (error) {
                this._logger.error('Failed to unregister keybinding', { name, error });
            }
        }

        this._registeredBindings = [];
        this._logger.info('KeybindingManager destroyed');
    }

    /**
     * Check if enabled
     * @returns {boolean}
     */
    get isEnabled() {
        return this._enabled;
    }

    /**
     * Get list of registered keybindings
     * @returns {string[]}
     */
    getRegisteredBindings() {
        return [...this._registeredBindings];
    }
}
