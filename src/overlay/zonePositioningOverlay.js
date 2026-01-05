/**
 * ZonePositioningOverlay - Highlights specific zones
 *
 * Used in interactive select mode to highlight the current zone.
 * Simpler than LayoutOverlay - just shows a highlight around specific zones.
 */

import { BaseOverlay } from './baseOverlay.js';
import { Logger } from '../core/logger.js';

export class ZonePositioningOverlay extends BaseOverlay {
    /**
     * @param {LayoutResolver} layoutResolver
     * @param {MonitorManager} monitorManager
     */
    constructor(layoutResolver, monitorManager) {
        super('ZonePositioningOverlay');

        if (!layoutResolver || !monitorManager) {
            throw new Error('layoutResolver and monitorManager are required');
        }

        this._layoutResolver = layoutResolver;
        this._monitorManager = monitorManager;

        this._zones = null;
        this._highlightActors = new Map(); // zoneIndex -> actor

        this._logger = new Logger('ZonePositioningOverlay');
    }

    /**
     * Initialize overlay for a layout
     *
     * @param {number} monitorIndex
     * @param {Object} layout - Layout definition
     * @param {Object} options - {margin, padding, overrides}
     */
    initializeForLayout(monitorIndex, layout, options = {}) {
        if (this._destroyed) {
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
            this._zones = this._layoutResolver.resolve(layout, workArea, {
                margin: options.margin ?? 0,
                padding: options.padding ?? 0,
                overrides: options.overrides ?? []
            });

            // Initialize if needed
            if (!this._container) {
                this.initialize(Main.uiGroup);
            }

            // Set overlay geometry
            this.setGeometry(workArea.x, workArea.y, workArea.width, workArea.height);

            // Show overlay
            this.show();

            this._logger.debug('Zone positioning overlay initialized', {
                monitorIndex,
                zoneCount: this._zones.length
            });
        } catch (error) {
            this._logger.error('Failed to initialize overlay', { error, monitorIndex });
        }
    }

    /**
     * Highlight specific zones
     *
     * @param {number[]} zoneIndices - Array of zone indices to highlight
     * @param {Object} style - Highlight style
     */
    highlightZones(zoneIndices, style = {}) {
        if (!this._zones) {
            this._logger.warn('Overlay not initialized');
            return;
        }

        // Clear previous highlights
        this.clearHighlights();

        const s = {
            borderColor: style.borderColor || 'rgba(255, 255, 255, 0.9)',
            borderWidth: style.borderWidth || 3,
            bgColor: style.bgColor || 'rgba(150, 200, 255, 0.2)',
            animate: style.animate !== false
        };

        // Create highlight for each zone
        for (const zoneIndex of zoneIndices) {
            const zone = this._zones[zoneIndex];
            if (!zone) {
                continue;
            }

            const highlightActor = new St.Widget({
                style: `
                    background-color: ${s.bgColor};
                    border: ${s.borderWidth}px solid ${s.borderColor};
                    border-radius: 4px;
                `,
                x: zone.x,
                y: zone.y,
                width: zone.width,
                height: zone.height,
                reactive: false,
                opacity: s.animate ? 0 : 255
            });

            this._container.add_actor(highlightActor);
            this._highlightActors.set(zoneIndex, highlightActor);

            // Animate in if requested
            if (s.animate) {
                highlightActor.ease({
                    opacity: 255,
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            }
        }

        this._logger.debug('Zones highlighted', { count: zoneIndices.length });
    }

    /**
     * Highlight single zone
     *
     * @param {number} zoneIndex
     * @param {Object} style
     */
    highlightZone(zoneIndex, style = {}) {
        this.highlightZones([zoneIndex], style);
    }

    /**
     * Clear highlights from specific zones
     *
     * @param {number[]} zoneIndices - Array of zone indices to clear
     */
    clearZoneHighlights(zoneIndices) {
        for (const zoneIndex of zoneIndices) {
            const actor = this._highlightActors.get(zoneIndex);
            if (actor) {
                actor.destroy();
                this._highlightActors.delete(zoneIndex);
            }
        }
    }

    /**
     * Clear all highlights
     */
    clearHighlights() {
        for (const [zoneIndex, actor] of this._highlightActors.entries()) {
            actor.destroy();
        }
        this._highlightActors.clear();
    }

    /**
     * Update highlight for zone (e.g., during navigation)
     *
     * @param {number} oldZoneIndex
     * @param {number} newZoneIndex
     * @param {Object} style
     */
    updateHighlight(oldZoneIndex, newZoneIndex, style = {}) {
        // Clear old
        if (oldZoneIndex !== null) {
            this.clearZoneHighlights([oldZoneIndex]);
        }

        // Highlight new
        if (newZoneIndex !== null) {
            this.highlightZone(newZoneIndex, style);
        }
    }

    /**
     * Pulse animation on highlighted zones
     *
     * @param {number} zoneIndex
     */
    pulseHighlight(zoneIndex) {
        const actor = this._highlightActors.get(zoneIndex);
        if (!actor) {
            return;
        }

        // Pulse animation
        actor.ease({
            scale_x: 1.05,
            scale_y: 1.05,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                actor.ease({
                    scale_x: 1.0,
                    scale_y: 1.0,
                    duration: 150,
                    mode: Clutter.AnimationMode.EASE_IN_QUAD
                });
            }
        });
    }

    /**
     * Flash animation on zone
     *
     * @param {number} zoneIndex
     */
    flashZone(zoneIndex) {
        if (!this._zones) {
            return;
        }

        const zone = this._zones[zoneIndex];
        if (!zone) {
            return;
        }

        // Create temporary flash actor
        const flashActor = new St.Widget({
            style: `
                background-color: rgba(255, 255, 255, 0.8);
                border-radius: 4px;
            `,
            x: zone.x,
            y: zone.y,
            width: zone.width,
            height: zone.height,
            reactive: false
        });

        this._container.add_actor(flashActor);

        // Fade out and destroy
        flashActor.ease({
            opacity: 0,
            duration: 300,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                flashActor.destroy();
            }
        });
    }

    /**
     * Check if zone is highlighted
     *
     * @param {number} zoneIndex
     * @returns {boolean}
     */
    isZoneHighlighted(zoneIndex) {
        return this._highlightActors.has(zoneIndex);
    }

    /**
     * Get highlighted zone indices
     *
     * @returns {number[]}
     */
    getHighlightedZones() {
        return Array.from(this._highlightActors.keys());
    }

    /**
     * Hide overlay
     */
    hide() {
        this.clearHighlights();
        this._zones = null;

        super.hide();
    }

    /**
     * Destroy overlay
     */
    destroy() {
        this.clearHighlights();
        super.destroy();
    }
}
