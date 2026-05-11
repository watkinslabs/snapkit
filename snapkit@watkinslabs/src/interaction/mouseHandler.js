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

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Logger } from '../core/logger.js';
import { State } from '../state/extensionState.js';

export class MouseHandler {
    /**
     * @param {EventCoordinator} eventCoordinator
     * @param {ExtensionState} extensionState
     * @param {MonitorManager} monitorManager
     * @param {LayoutManager} layoutManager
     * @param {EventBus} eventBus
     */
    constructor(eventCoordinator, extensionState, monitorManager, layoutManager, eventBus) {
        if (!eventCoordinator || !extensionState || !monitorManager || !layoutManager || !eventBus) {
            throw new Error('All dependencies are required');
        }

        this._eventCoordinator = eventCoordinator;
        this._extensionState = extensionState;
        this._monitorManager = monitorManager;
        this._layoutManager = layoutManager;
        this._eventBus = eventBus;
        this._logger = new Logger('MouseHandler');

        // Trigger zone configuration
        this._config = {
            triggerEdge: 'top',    // Which edge triggers overlay (top, bottom, left, right)
            edgeSize: 5,           // Edge trigger zone size (pixels)
            debounceDelay: 100     // Debounce delay (ms)
        };

        // Match trigger span to the picker's visible dimensions so the target area
        // corresponds to where the overlay actually appears.
        this._overlayMetrics = {
            thumbnailWidth: 120,
            thumbnailHeight: 80,
            labelHeight: 20,
            spacing: 12,
            barPadding: 16
        };

        // State
        this._enabled = false;
        this._lastTriggerTime = 0;
        this._currentZone = null;
        this._lastPosition = { x: 0, y: 0 };

        // Edge actors for hot edges
        this._edgeActors = [];
    }

    /**
     * Initialize mouse handler
     */
    initialize() {
        if (this._enabled) {
            this._logger.warn('Already initialized');
            return;
        }

        // Create hot edge actors for each monitor
        this._createEdgeActors();

        // Subscribe to state changes
        this._extensionState.subscribe((oldState, newState) => {
            this._onStateChange(oldState, newState);
        });

        // Listen for monitor changes to recreate edges
        this._monitorManager.onMonitorsChanged(() => {
            this._destroyEdgeActors();
            this._createEdgeActors();
        });

        this._enabled = true;
        this._logger.info('MouseHandler initialized');
    }

    /**
     * Create hot edge actor for the configured trigger edge
     * @private
     */
    _createEdgeActors() {
        const monitors = this._monitorManager.getMonitors();
        const edge = this._config.triggerEdge;
        const edgeSize = this._config.edgeSize;

        for (const monitor of monitors) {
            const { geometry } = monitor;
            const targetRect = this._getEdgeTargetRect(edge, geometry, edgeSize);
            this._createEdgeActor(
                edge,
                monitor.index,
                targetRect.x,
                targetRect.y,
                targetRect.width,
                targetRect.height
            );
        }

        this._logger.debug('Created edge actor', { edge, count: this._edgeActors.length });
    }

    /**
     * Estimate picker span on a monitor edge.
     * @private
     * @param {string} edge
     * @param {Object} geometry
     * @returns {number}
     */
    _estimateOverlaySpan(edge, geometry) {
        const count = this._getLayoutCount();
        const { thumbnailWidth, thumbnailHeight, labelHeight, spacing, barPadding } = this._overlayMetrics;

        if (edge === 'top' || edge === 'bottom') {
            const rawWidth = count * thumbnailWidth + Math.max(0, count - 1) * spacing + barPadding * 2;
            return Math.min(geometry.width, rawWidth);
        }

        const itemHeight = thumbnailHeight + labelHeight;
        const rawHeight = count * itemHeight + Math.max(0, count - 1) * spacing + barPadding * 2;
        return Math.min(geometry.height, rawHeight);
    }

    /**
     * Resolve hot-edge actor geometry so trigger target matches picker footprint.
     * @private
     * @param {string} edge
     * @param {Object} geometry
     * @param {number} edgeSize
     * @returns {{x:number,y:number,width:number,height:number}}
     */
    _getEdgeTargetRect(edge, geometry, edgeSize) {
        const span = Math.max(edgeSize, Math.floor(this._estimateOverlaySpan(edge, geometry)));

        switch (edge) {
            case 'top':
                return {
                    x: Math.round(geometry.x + (geometry.width - span) / 2),
                    y: geometry.y,
                    width: span,
                    height: edgeSize
                };
            case 'bottom':
                return {
                    x: Math.round(geometry.x + (geometry.width - span) / 2),
                    y: geometry.y + geometry.height - edgeSize,
                    width: span,
                    height: edgeSize
                };
            case 'left':
                return {
                    x: geometry.x,
                    y: Math.round(geometry.y + (geometry.height - span) / 2),
                    width: edgeSize,
                    height: span
                };
            case 'right':
                return {
                    x: geometry.x + geometry.width - edgeSize,
                    y: Math.round(geometry.y + (geometry.height - span) / 2),
                    width: edgeSize,
                    height: span
                };
            default:
                return {
                    x: Math.round(geometry.x + (geometry.width - span) / 2),
                    y: geometry.y,
                    width: span,
                    height: edgeSize
                };
        }
    }

    /**
     * Count available layouts for trigger span estimation.
     * @private
     * @returns {number}
     */
    _getLayoutCount() {
        try {
            const builtin = this._layoutManager.getBuiltinLayouts() || [];
            const custom = this._layoutManager.getCustomLayouts() || [];
            return Math.max(1, builtin.length + custom.length);
        } catch (error) {
            this._logger.warn('Failed to count layouts for edge target sizing', { error });
            return 1;
        }
    }

    /**
     * Create a single edge actor
     * @private
     */
    _createEdgeActor(edge, monitorIndex, x, y, width, height) {
        const actor = new St.Widget({
            name: `snapkit-edge-${edge}-${monitorIndex}`,
            reactive: true,
            x, y, width, height,
            opacity: 0  // Invisible
        });

        actor.connect('enter-event', () => {
            this._onEdgeEnter(edge, monitorIndex);
            return Clutter.EVENT_STOP;
        });

        actor.connect('leave-event', () => {
            this._onEdgeLeave();
            return Clutter.EVENT_STOP;
        });

        Main.layoutManager.addChrome(actor, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen: true
        });

        this._edgeActors.push(actor);
    }

    /**
     * Destroy all edge actors
     * @private
     */
    _destroyEdgeActors() {
        for (const actor of this._edgeActors) {
            Main.layoutManager.removeChrome(actor);
            actor.destroy();
        }
        this._edgeActors = [];
    }

    /**
     * Handle edge enter
     * @private
     */
    _onEdgeEnter(edge, monitorIndex) {
        if (this._extensionState.current !== State.CLOSED) {
            return;
        }

        // Debounce
        const now = Date.now();
        if (now - this._lastTriggerTime < this._config.debounceDelay) {
            return;
        }
        this._lastTriggerTime = now;

        this._logger.debug('Edge triggered', { edge, monitorIndex });

        // Emit request to open overlay
        this._eventBus.emit('request-open-overlay', {
            monitorIndex,
            trigger: 'edge',
            edge
        });
    }

    /**
     * Handle edge leave
     * @private
     */
    _onEdgeLeave() {
        // Could emit event if needed
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
        let needsEdgeRecreate = false;

        if (config.edgeSize !== undefined) {
            const newSize = Math.max(1, config.edgeSize);
            if (this._config.edgeSize !== newSize) {
                this._config.edgeSize = newSize;
                needsEdgeRecreate = true;
            }
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
        if (config.triggerEdge !== undefined) {
            const validEdges = ['top', 'bottom', 'left', 'right'];
            if (validEdges.includes(config.triggerEdge) && this._config.triggerEdge !== config.triggerEdge) {
                this._config.triggerEdge = config.triggerEdge;
                needsEdgeRecreate = true;
            }
        }

        // Recreate edge actors if edge or size changed
        if (needsEdgeRecreate && this._enabled) {
            this._destroyEdgeActors();
            this._createEdgeActors();
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

        // Destroy edge actors
        this._destroyEdgeActors();

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
