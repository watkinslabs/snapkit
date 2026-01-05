/**
 * BaseOverlay - Base class for all overlay components
 *
 * Provides common functionality:
 * - Show/hide with transitions
 * - Positioning and sizing
 * - Lifecycle management
 * - Actor management
 *
 * All overlay classes extend this.
 */

import { Logger } from '../core/logger.js';

export class BaseOverlay {
    /**
     * @param {string} name - Overlay name for logging
     */
    constructor(name) {
        this._name = name;
        this._logger = new Logger(`BaseOverlay:${name}`);
        this._container = null;
        this._visible = false;
        this._destroyed = false;
    }

    /**
     * Initialize overlay
     * Creates the main container actor
     *
     * @param {object} parent - Parent actor (e.g., Main.uiGroup)
     */
    initialize(parent) {
        if (this._container) {
            this._logger.warn('Already initialized');
            return;
        }

        this._parent = parent;
        this._createContainer();
        this._logger.debug('Overlay initialized');
    }

    /**
     * Create container actor
     * Override in subclasses to customize
     *
     * @protected
     */
    _createContainer() {
        this._container = new St.Widget({
            name: `snapkit-overlay-${this._name}`,
            reactive: false,
            visible: false
        });

        if (this._parent) {
            this._parent.add_actor(this._container);
        }
    }

    /**
     * Show overlay
     * Override to add custom show logic
     */
    show() {
        if (this._destroyed) {
            this._logger.warn('Cannot show destroyed overlay');
            return;
        }

        if (!this._container) {
            this._logger.warn('Overlay not initialized');
            return;
        }

        if (this._visible) {
            return; // Already visible
        }

        this._container.visible = true;
        this._container.opacity = 0;

        // Fade in
        this._container.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });

        this._visible = true;
        this._logger.debug('Overlay shown');
    }

    /**
     * Hide overlay
     * Override to add custom hide logic
     */
    hide() {
        if (!this._container || !this._visible) {
            return;
        }

        // Fade out
        this._container.ease({
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._container) {
                    this._container.visible = false;
                }
            }
        });

        this._visible = false;
        this._logger.debug('Overlay hidden');
    }

    /**
     * Set overlay position and size
     *
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    setGeometry(x, y, width, height) {
        if (!this._container) {
            return;
        }

        this._container.set_position(x, y);
        this._container.set_size(width, height);
    }

    /**
     * Set overlay opacity
     *
     * @param {number} opacity - 0-255
     */
    setOpacity(opacity) {
        if (this._container) {
            this._container.opacity = opacity;
        }
    }

    /**
     * Check if overlay is visible
     *
     * @returns {boolean}
     */
    get isVisible() {
        return this._visible;
    }

    /**
     * Get container actor
     *
     * @returns {St.Widget|null}
     */
    get container() {
        return this._container;
    }

    /**
     * Clear all children from container
     *
     * @protected
     */
    _clearChildren() {
        if (!this._container) {
            return;
        }

        this._container.remove_all_children();
    }

    /**
     * Destroy overlay
     * Cleanup all resources
     */
    destroy() {
        if (this._destroyed) {
            return;
        }

        this._destroyed = true;

        if (this._container) {
            this._container.remove_all_transitions();
            this._container.destroy();
            this._container = null;
        }

        this._visible = false;
        this._logger.debug('Overlay destroyed');
    }

    /**
     * Check if overlay is destroyed
     *
     * @returns {boolean}
     */
    get isDestroyed() {
        return this._destroyed;
    }
}
