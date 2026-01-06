/**
 * MouseHandler - Handles mouse motion and edge detection
 *
 * Detects cursor at screen edges/corners to trigger overlay.
 * NO POLLING - uses motion events from EventCoordinator.
 *
 * Trigger zones:
 * - Screen edges (top, bottom, left, right)
 * - Screen corners (top-left, top-right, bottom-left, bottom-right)
 *
 * Only triggers when ExtensionState is CLOSED.
 */

import { Logger } from '../core/logger.js';
import { State } from '../state/extensionState.js';

export class MouseHandler {
    /**
     * @param {EventCoordinator} eventCoordinator
     * @param {ExtensionState} extensionState
     * @param {MonitorManager} monitorManager
     * @param {EventBus} eventBus
     */
    constructor(eventCoordinator, extensionState, monitorManager, eventBus) {
        if (!eventCoordinator || !extensionState || !monitorManager || !eventBus) {
            throw new Error('All dependencies are required');
        }

        this._eventCoordinator = eventCoordinator;
        this._extensionState = extensionState;
        this._monitorManager = monitorManager;
        this._eventBus = eventBus;
        this._logger = new Logger('MouseHandler');

        // Trigger zone configuration
        this._config = {
            edgeSize: 2,           // Edge trigger zone size (pixels)
            cornerSize: 10,        // Corner trigger zone size (pixels)
            debounceDelay: 100,    // Debounce delay (ms)
            enableEdges: true,     // Enable edge triggers
            enableCorners: true    // Enable corner triggers
        };

        // State
        this._enabled = false;
        this._lastTriggerTime = 0;
        this._currentZone = null;
        this._lastPosition = { x: 0, y: 0 };
    }

    /**
     * Initialize mouse handler
     */
    initialize() {
        if (this._enabled) {
            this._logger.warn('Already initialized');
            return;
        }

        // Register motion handler with event coordinator
        this._eventCoordinator.registerHandler('motion', (event) => {
            return this._onMotion(event);
        });

        // Subscribe to state changes
        this._extensionState.subscribe((oldState, newState) => {
            this._onStateChange(oldState, newState);
        });

        this._enabled = true;
        this._logger.info('MouseHandler initialized');
    }

    /**
     * Handle mouse motion
     * @private
     * @param {Clutter.Event} event
     * @returns {boolean} Clutter.EVENT_STOP or EVENT_PROPAGATE
     */
    _onMotion(event) {
        if (!this._enabled) {
            return Clutter.EVENT_PROPAGATE;
        }

        // Only detect triggers when extension is CLOSED
        if (this._extensionState.current !== State.CLOSED) {
            this._currentZone = null;
            return Clutter.EVENT_PROPAGATE;
        }

        try {
            // Get cursor position
            const [x, y] = event.get_coords();
            this._lastPosition = { x, y };

            // Detect trigger zone
            const zone = this._detectTriggerZone(x, y);

            // Check if zone changed
            if (zone !== this._currentZone) {
                if (zone) {
                    this._onTriggerZoneEnter(zone, x, y);
                } else {
                    this._onTriggerZoneLeave();
                }
                this._currentZone = zone;
            }

            return Clutter.EVENT_PROPAGATE;
        } catch (error) {
            this._logger.error('Error in motion handler', { error });
            return Clutter.EVENT_PROPAGATE;
        }
    }

    /**
     * Detect trigger zone at position
     * @private
     * @param {number} x
     * @param {number} y
     * @returns {Object|null} Zone info or null
     */
    _detectTriggerZone(x, y) {
        // Get monitor at position
        const monitorIndex = this._monitorManager.getMonitorAtPoint(x, y);
        if (monitorIndex === -1) {
            return null;
        }

        const monitor = this._monitorManager.getMonitor(monitorIndex);
        if (!monitor) {
            return null;
        }

        const { x: mx, y: my, width: mw, height: mh } = monitor;

        // Check corners first (higher priority)
        if (this._config.enableCorners) {
            const corner = this._detectCorner(x, y, mx, my, mw, mh);
            if (corner) {
                return {
                    type: 'corner',
                    edge: corner,
                    monitorIndex,
                    x,
                    y
                };
            }
        }

        // Check edges
        if (this._config.enableEdges) {
            const edge = this._detectEdge(x, y, mx, my, mw, mh);
            if (edge) {
                return {
                    type: 'edge',
                    edge,
                    monitorIndex,
                    x,
                    y
                };
            }
        }

        return null;
    }

    /**
     * Detect corner trigger
     * @private
     * @param {number} x
     * @param {number} y
     * @param {number} mx - Monitor X
     * @param {number} my - Monitor Y
     * @param {number} mw - Monitor width
     * @param {number} mh - Monitor height
     * @returns {string|null} Corner name or null
     */
    _detectCorner(x, y, mx, my, mw, mh) {
        const cs = this._config.cornerSize;

        // Top-left
        if (x < mx + cs && y < my + cs) {
            return 'top-left';
        }

        // Top-right
        if (x > mx + mw - cs && y < my + cs) {
            return 'top-right';
        }

        // Bottom-left
        if (x < mx + cs && y > my + mh - cs) {
            return 'bottom-left';
        }

        // Bottom-right
        if (x > mx + mw - cs && y > my + mh - cs) {
            return 'bottom-right';
        }

        return null;
    }

    /**
     * Detect edge trigger
     * @private
     * @param {number} x
     * @param {number} y
     * @param {number} mx - Monitor X
     * @param {number} my - Monitor Y
     * @param {number} mw - Monitor width
     * @param {number} mh - Monitor height
     * @returns {string|null} Edge name or null
     */
    _detectEdge(x, y, mx, my, mw, mh) {
        const es = this._config.edgeSize;

        // Top edge
        if (y < my + es) {
            return 'top';
        }

        // Bottom edge
        if (y > my + mh - es) {
            return 'bottom';
        }

        // Left edge
        if (x < mx + es) {
            return 'left';
        }

        // Right edge
        if (x > mx + mw - es) {
            return 'right';
        }

        return null;
    }

    /**
     * Handle trigger zone enter
     * @private
     * @param {Object} zone
     * @param {number} x
     * @param {number} y
     */
    _onTriggerZoneEnter(zone, x, y) {
        // Debounce
        const now = Date.now();
        if (now - this._lastTriggerTime < this._config.debounceDelay) {
            return;
        }
        this._lastTriggerTime = now;

        this._logger.debug('Trigger zone entered', {
            type: zone.type,
            edge: zone.edge,
            monitor: zone.monitorIndex
        });

        // Emit event
        this._eventBus.emit('trigger-zone-entered', {
            zone,
            x,
            y
        });
    }

    /**
     * Handle trigger zone leave
     * @private
     */
    _onTriggerZoneLeave() {
        // Emit event
        this._eventBus.emit('trigger-zone-left', {});
    }

    /**
     * Handle state change
     * @private
     * @param {string} oldState
     * @param {string} newState
     */
    _onStateChange(oldState, newState) {
        // Reset trigger detection when state changes
        if (newState !== State.CLOSED) {
            this._currentZone = null;
        }
    }

    /**
     * Update configuration
     *
     * @param {Object} config - Configuration options
     */
    updateConfig(config) {
        if (config.edgeSize !== undefined) {
            this._config.edgeSize = Math.max(1, config.edgeSize);
        }
        if (config.cornerSize !== undefined) {
            this._config.cornerSize = Math.max(1, config.cornerSize);
        }
        if (config.debounceDelay !== undefined) {
            this._config.debounceDelay = Math.max(0, config.debounceDelay);
        }
        if (config.enableEdges !== undefined) {
            this._config.enableEdges = !!config.enableEdges;
        }
        if (config.enableCorners !== undefined) {
            this._config.enableCorners = !!config.enableCorners;
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
     * Enable mouse handler
     */
    enable() {
        if (this._enabled) {
            return;
        }

        this.initialize();
    }

    /**
     * Disable mouse handler
     */
    disable() {
        if (!this._enabled) {
            return;
        }

        this._enabled = false;
        this._currentZone = null;

        this._logger.info('MouseHandler disabled');
    }

    /**
     * Destroy mouse handler
     */
    destroy() {
        this.disable();

        // Unregister handler
        this._eventCoordinator.unregisterHandler('motion');

        this._logger.info('MouseHandler destroyed');
    }

    /**
     * Get last cursor position
     *
     * @returns {Object} {x, y}
     */
    getLastPosition() {
        return { ...this._lastPosition };
    }

    /**
     * Get current trigger zone
     *
     * @returns {Object|null}
     */
    getCurrentZone() {
        return this._currentZone ? { ...this._currentZone } : null;
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
