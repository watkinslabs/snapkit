/**
 * LayoutOverlay - Main coordinator for layout overlay
 *
 * Brings together:
 * - BaseOverlay (lifecycle)
 * - LayoutOverlayRenderer (rendering)
 * - LayoutOverlayInteraction (user input)
 * - LayoutOverlayAnimation (animations)
 *
 * This is the main layout overlay that shows zones when user triggers it.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { BaseOverlay } from './baseOverlay.js';
import { LayoutOverlayRenderer } from './layoutOverlayRenderer.js';
import { LayoutOverlayInteraction } from './layoutOverlayInteraction.js';
import { LayoutOverlayAnimation } from './layoutOverlayAnimation.js';
import { Logger } from '../core/logger.js';

export class LayoutOverlay extends BaseOverlay {
    /**
     * @param {EventBus} eventBus - Event bus
     * @param {LayoutResolver} layoutResolver - Layout resolver
     * @param {MonitorManager} monitorManager - Monitor manager
     */
    constructor(eventBus, layoutResolver, monitorManager) {
        super('LayoutOverlay');

        if (!eventBus || !layoutResolver || !monitorManager) {
            throw new Error('eventBus, layoutResolver, and monitorManager are required');
        }

        this._eventBus = eventBus;
        this._layoutResolver = layoutResolver;
        this._monitorManager = monitorManager;

        // Components
        this._renderer = new LayoutOverlayRenderer();
        this._interaction = new LayoutOverlayInteraction(eventBus);
        this._animation = new LayoutOverlayAnimation();

        // State
        this._currentLayout = null;
        this._currentMonitor = null;
        this._currentZones = null;
        this._currentZoneIndex = null;
        this._options = {};

        this._logger = new Logger('LayoutOverlay');
    }

    /**
     * Show overlay for a layout on a monitor
     *
     * @param {number} monitorIndex
     * @param {Object} layout - Layout definition
     * @param {Object} options - {margin, padding, overrides, style}
     */
    showLayout(monitorIndex, layout, options = {}) {
        if (this._destroyed) {
            this._logger.warn('Cannot show destroyed overlay');
            return;
        }

        // Get monitor work area
        const workArea = this._monitorManager.getWorkArea(monitorIndex);
        if (!workArea) {
            this._logger.warn('Invalid monitor', { monitorIndex });
            return;
        }

        try {
            // Resolve layout to zones
            const zones = this._layoutResolver.resolve(layout, workArea, {
                margin: options.margin ?? 0,
                padding: options.padding ?? 0,
                overrides: options.overrides ?? []
            });

            // Store current state
            this._currentLayout = layout;
            this._currentMonitor = monitorIndex;
            this._currentZones = zones;
            this._currentZoneIndex = 0; // Start at first zone
            this._options = options;

            // Initialize if needed
            if (!this._container) {
                this.initialize(Main.uiGroup);
            }

            // Set overlay geometry to cover monitor
            this.setGeometry(workArea.x, workArea.y, workArea.width, workArea.height);

            // Clear previous content
            this._clearChildren();

            // Render zones
            this._renderer.render(this._container, zones, options.style);

            // Setup interaction
            const zoneActors = this._renderer.getAllZoneActors();
            this._interaction.setupZoneInteraction(zoneActors);

            // Setup keyboard navigation
            if (global.stage) {
                this._interaction.setupKeyboardNavigation(
                    global.stage,
                    this._currentZoneIndex,
                    zones.length
                );
            }

            // Subscribe to events
            this._subscribeToEvents();

            // Show with animation
            this.show();

            // Animate zones in with stagger
            this._animation.stagger(
                zoneActors.map(z => z.actor),
                (actor) => this._animation.fadeIn(actor, 150),
                30
            );

            // Highlight first zone
            this._highlightZone(0);

            this._logger.info('Layout overlay shown', {
                monitorIndex,
                zoneCount: zones.length
            });
        } catch (error) {
            this._logger.error('Failed to show layout', { error, monitorIndex });
        }
    }

    /**
     * Subscribe to interaction events
     * @private
     */
    _subscribeToEvents() {
        // Zone hover
        this._hoverEnterSub = this._eventBus.on('zone-hover-enter', (data) => {
            this._onZoneHoverEnter(data.zoneIndex);
        });

        this._hoverLeaveSub = this._eventBus.on('zone-hover-leave', (data) => {
            this._onZoneHoverLeave(data.zoneIndex);
        });

        // Zone selection
        this._zoneSub = this._eventBus.on('zone-selected', (data) => {
            this._onZoneSelected(data.zoneIndex);
        });

        // Zone navigation
        this._navSub = this._eventBus.on('zone-navigate', (data) => {
            this._onZoneNavigate(data.newZoneIndex);
        });

        // Cancel
        this._cancelSub = this._eventBus.on('overlay-cancel', () => {
            this._onCancel();
        });
    }

    /**
     * Unsubscribe from events
     * @private
     */
    _unsubscribeFromEvents() {
        if (this._hoverEnterSub) this._hoverEnterSub();
        if (this._hoverLeaveSub) this._hoverLeaveSub();
        if (this._zoneSub) this._zoneSub();
        if (this._navSub) this._navSub();
        if (this._cancelSub) this._cancelSub();

        this._hoverEnterSub = null;
        this._hoverLeaveSub = null;
        this._zoneSub = null;
        this._navSub = null;
        this._cancelSub = null;
    }

    /**
     * Handle zone hover enter
     * @private
     * @param {number} zoneIndex
     */
    _onZoneHoverEnter(zoneIndex) {
        this._highlightZone(zoneIndex);

        const actor = this._renderer.getZoneActor(zoneIndex);
        if (actor) {
            this._animation.scaleUp(actor, 1.03, 100);
        }
    }

    /**
     * Handle zone hover leave
     * @private
     * @param {number} zoneIndex
     */
    _onZoneHoverLeave(zoneIndex) {
        // Clear highlight if not current zone
        if (zoneIndex !== this._currentZoneIndex) {
            this._renderer.clearHighlight(zoneIndex, this._options.style);
        }

        const actor = this._renderer.getZoneActor(zoneIndex);
        if (actor) {
            this._animation.scaleDown(actor, 100);
        }
    }

    /**
     * Handle zone selected
     * @private
     * @param {number} zoneIndex
     */
    _onZoneSelected(zoneIndex) {
        this._logger.info('Zone selected via overlay', { zoneIndex });

        // Animate selection
        const actor = this._renderer.getZoneActor(zoneIndex);
        if (actor) {
            this._animation.pulse(actor, 1, 200);
        }

        // Emit external event (for extension to handle)
        this._eventBus.emit('layout-overlay-zone-selected', {
            monitorIndex: this._currentMonitor,
            layout: this._currentLayout,
            zoneIndex,
            zones: this._currentZones
        });
    }

    /**
     * Handle zone navigation
     * @private
     * @param {number} newZoneIndex
     */
    _onZoneNavigate(newZoneIndex) {
        // Clear old highlight
        if (this._currentZoneIndex !== null) {
            this._renderer.clearHighlight(this._currentZoneIndex, this._options.style);
        }

        // Set new zone
        this._currentZoneIndex = newZoneIndex;

        // Highlight new zone
        this._highlightZone(newZoneIndex);

        this._logger.debug('Zone navigated', { newZoneIndex });
    }

    /**
     * Handle cancel (Escape key)
     * @private
     */
    _onCancel() {
        this._logger.info('Overlay cancelled');
        this.hide();

        // Emit cancel event
        this._eventBus.emit('layout-overlay-cancelled', {});
    }

    /**
     * Highlight a zone
     * @private
     * @param {number} zoneIndex
     */
    _highlightZone(zoneIndex) {
        this._renderer.highlightZone(zoneIndex, this._options.highlightStyle);
    }

    /**
     * Hide overlay
     */
    hide() {
        if (!this._visible) {
            return;
        }

        // Stop all animations
        this._animation.stopAll();

        // Unsubscribe from events
        this._unsubscribeFromEvents();

        // Clear interaction
        this._interaction.clear();

        // Hide with animation
        super.hide();

        // Clear state
        this._currentLayout = null;
        this._currentMonitor = null;
        this._currentZones = null;
        this._currentZoneIndex = null;

        this._logger.debug('Layout overlay hidden');
    }

    /**
     * Get current zone index
     * @returns {number|null}
     */
    getCurrentZoneIndex() {
        return this._currentZoneIndex;
    }

    /**
     * Get current zones
     * @returns {Array|null}
     */
    getCurrentZones() {
        return this._currentZones ? [...this._currentZones] : null;
    }

    /**
     * Destroy overlay
     */
    destroy() {
        this._animation.stopAll();
        this._interaction.clear();
        this._renderer.clear();
        this._unsubscribeFromEvents();

        super.destroy();

        this._logger.info('Layout overlay destroyed');
    }
}
