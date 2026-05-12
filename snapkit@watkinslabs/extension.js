/**
 * SnapKit - BTree Window Manager Extension for GNOME Shell
 *
 * Main entry point for GNOME Shell extension.
 * Provides enable() and disable() lifecycle methods.
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
import { Logger } from './src/core/logger.js';

const logger = new Logger('Extension');

export default class SnapKitExtension extends Extension {
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
            logger.warn('Extension in fatal error state, refusing to enable');
            return;
        }

        try {
            logger.info('Enabling extension');

            // Create and initialize controller
            this._controller = new ExtensionController();
            this._controller.enable();

            logger.info('Extension enabled successfully');
        } catch (error) {
            logger.error('Failed to enable extension', error);
            this._handleFatalError();
        }
    }

    /**
     * Disable extension
     * Called when extension is disabled or screen is locked
     */
    disable() {
        try {
            logger.info('Disabling extension');

            if (this._controller) {
                this._controller.destroy();
                this._controller = null;
            }

            // Reset fatal error state on disable (allows retry)
            this._fatalError = false;

            logger.info('Extension disabled successfully');
        } catch (error) {
            logger.error('Error disabling extension', error);
            // Force cleanup even on error
            this._controller = null;
        }
    }

    /**
     * Handle fatal error - safely disable extension
     * @private
     */
    _handleFatalError() {
        logger.error('Handling fatal error, attempting safe cleanup');
        this._fatalError = true;

        // Attempt to clean up controller
        if (this._controller) {
            try {
                this._controller.destroy();
            } catch (e) {
                logger.error('Failed to clean up after fatal error', e);
            }
            this._controller = null;
        }

        logger.error('Extension disabled due to fatal error');
    }
}
