/**
 * SnapKit - BTree Window Manager Extension for GNOME Shell
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

export default class SnapKitExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._controller = null;
    }

    /**
     * Initialize extension
     * Called when extension is loaded
     */
    enable() {
        try {
            log('[SnapKit] Enabling extension');

            // Create and initialize controller
            this._controller = new ExtensionController();
            this._controller.enable();

            log('[SnapKit] Extension enabled successfully');
        } catch (error) {
            logError(error, '[SnapKit] Failed to enable extension');

            // Clean up on error
            if (this._controller) {
                try {
                    this._controller.destroy();
                } catch (e) {
                    logError(e, '[SnapKit] Failed to clean up after error');
                }
                this._controller = null;
            }
        }
    }

    /**
     * Disable extension
     * Called when extension is disabled or screen is locked
     */
    disable() {
        try {
            log('[SnapKit] Disabling extension');

            if (this._controller) {
                this._controller.destroy();
                this._controller = null;
            }

            log('[SnapKit] Extension disabled successfully');
        } catch (error) {
            logError(error, '[SnapKit] Error disabling extension');
        }
    }
}
