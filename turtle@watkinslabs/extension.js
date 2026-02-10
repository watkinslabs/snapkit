/**
 * Turtle - BTree Window Manager Extension for GNOME Shell
 *
 * Main entry point for GNOME Shell extension.
 * Provides init(), enable(), and disable() functions as required by GNOME Shell.
 *
 * Architecture:
 * - BTree-based space partitioning for layouts
 * - NO POLLING - all event-driven
 * - Layered design: Core → BTree → Tiling → Overlay → Interaction → UI
 * - Dependency injection via ServiceContainer
 * - Event-driven communication via EventBus
 * - State machine for extension states
 *
 * Supports GNOME Shell 45-48
 */

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ExtensionController } from './src/extensionController.js';

/**
 * Global error handler wrapper to prevent GNOME Shell crashes
 * @param {Function} fn - Function to wrap
 * @param {string} context - Context for error logging
 * @returns {Function} Wrapped function
 */
function safeCall(fn, context) {
    return function(...args) {
        try {
            return fn.apply(this, args);
        } catch (error) {
            logError(error, `[Turtle] Error in ${context}`);
            return undefined;
        }
    };
}

export default class TurtleExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._controller = null;
        this._fatalError = false;
    }

    /**
     * Initialize extension
     * Called when extension is loaded
     */
    enable() {
        if (this._fatalError) {
            log('[Turtle] Extension in fatal error state, refusing to enable');
            return;
        }

        try {
            log('[Turtle] Enabling extension');

            // Create and initialize controller
            this._controller = new ExtensionController();
            this._controller.enable();

            log('[Turtle] Extension enabled successfully');
        } catch (error) {
            logError(error, '[Turtle] Failed to enable extension');
            this._handleFatalError();
        }
    }

    /**
     * Disable extension
     * Called when extension is disabled or screen is locked
     */
    disable() {
        try {
            log('[Turtle] Disabling extension');

            if (this._controller) {
                this._controller.destroy();
                this._controller = null;
            }

            // Reset fatal error state on disable (allows retry)
            this._fatalError = false;

            log('[Turtle] Extension disabled successfully');
        } catch (error) {
            logError(error, '[Turtle] Error disabling extension');
            // Force cleanup even on error
            this._controller = null;
        }
    }

    /**
     * Handle fatal error - safely disable extension
     * @private
     */
    _handleFatalError() {
        log('[Turtle] Handling fatal error, attempting safe cleanup');
        this._fatalError = true;

        // Attempt to clean up controller
        if (this._controller) {
            try {
                this._controller.destroy();
            } catch (e) {
                logError(e, '[Turtle] Failed to clean up after fatal error');
            }
            this._controller = null;
        }

        log('[Turtle] Extension disabled due to fatal error');
    }
}
