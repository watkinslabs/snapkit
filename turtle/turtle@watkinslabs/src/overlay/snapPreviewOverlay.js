/**
 * SnapPreviewOverlay - Shows preview during window drag
 *
 * When user drags a window (DRAG_MODE):
 * - Show snap preview overlay
 * - Highlight target zone under cursor
 * - Show preview of window placement
 *
 * This overlay is shown during drag, not for interactive select.
 */

import { BaseOverlay } from './baseOverlay.js';
import { Logger } from '../core/logger.js';

export class SnapPreviewOverlay extends BaseOverlay {
    /**
     * @param {LayoutResolver} layoutResolver
     * @param {MonitorManager} monitorManager
     */
    constructor(layoutResolver, monitorManager) {
        super('SnapPreviewOverlay');

        if (!layoutResolver || !monitorManager) {
            throw new Error('layoutResolver and monitorManager are required');
        }

        this._layoutResolver = layoutResolver;
        this._monitorManager = monitorManager;

        this._zones = null;
        this._highlightedZone = null;
        this._zoneActors = [];
        this._previewActor = null;

        this._logger = new Logger('SnapPreviewOverlay');
    }

    /**
     * Show preview for a layout on a monitor
     *
     * @param {number} monitorIndex
     * @param {Object} layout - Layout definition
     * @param {Object} options - {margin, padding, overrides, style}
     */
    showPreview(monitorIndex, layout, options = {}) {
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

            // Clear previous
            this._clearZoneActors();

            // Render zone outlines (subtle)
            this._renderZoneOutlines(options.style);

            // Show overlay
            this.show();

            this._logger.debug('Snap preview shown', { monitorIndex, zoneCount: this._zones.length });
        } catch (error) {
            this._logger.error('Failed to show snap preview', { error, monitorIndex });
        }
    }

    /**
     * Render zone outlines
     * @private
     * @param {Object} style
     */
    _renderZoneOutlines(style = {}) {
        const s = {
            borderColor: style.previewBorderColor || 'rgba(200, 220, 255, 0.4)',
            borderWidth: style.previewBorderWidth || 1
        };

        for (const zone of this._zones) {
            const zoneActor = new St.Widget({
                style: `
                    background-color: transparent;
                    border: ${s.borderWidth}px solid ${s.borderColor};
                    border-radius: 2px;
                `,
                x: zone.x,
                y: zone.y,
                width: zone.width,
                height: zone.height,
                reactive: false
            });

            this._container.add_actor(zoneActor);
            this._zoneActors.push({ actor: zoneActor, zone });
        }
    }

    /**
     * Highlight target zone at cursor position
     *
     * @param {number} x - Cursor X
     * @param {number} y - Cursor Y
     * @returns {number|null} Zone index under cursor
     */
    highlightZoneAtCursor(x, y) {
        if (!this._zones) {
            return null;
        }

        // Find zone at cursor
        const zoneIndex = this._findZoneAtPoint(x, y);

        if (zoneIndex === this._highlightedZone) {
            return zoneIndex; // Already highlighted
        }

        // Clear previous highlight
        if (this._highlightedZone !== null) {
            this._clearZoneHighlight(this._highlightedZone);
        }

        // Highlight new zone
        if (zoneIndex !== null) {
            this._highlightZone(zoneIndex);
        }

        this._highlightedZone = zoneIndex;
        return zoneIndex;
    }

    /**
     * Find zone at point
     * @private
     * @param {number} x
     * @param {number} y
     * @returns {number|null} Zone index
     */
    _findZoneAtPoint(x, y) {
        for (const zone of this._zones) {
            if (x >= zone.x && x < zone.x + zone.width &&
                y >= zone.y && y < zone.y + zone.height) {
                return zone.zoneIndex;
            }
        }
        return null;
    }

    /**
     * Highlight a zone
     * @private
     * @param {number} zoneIndex
     */
    _highlightZone(zoneIndex) {
        const zoneData = this._zoneActors.find(z => z.zone.zoneIndex === zoneIndex);
        if (!zoneData) {
            return;
        }

        zoneData.actor.set_style(`
            background-color: rgba(150, 200, 255, 0.3);
            border: 2px solid rgba(255, 255, 255, 0.8);
            border-radius: 2px;
        `);
    }

    /**
     * Clear zone highlight
     * @private
     * @param {number} zoneIndex
     */
    _clearZoneHighlight(zoneIndex) {
        const zoneData = this._zoneActors.find(z => z.zone.zoneIndex === zoneIndex);
        if (!zoneData) {
            return;
        }

        zoneData.actor.set_style(`
            background-color: transparent;
            border: 1px solid rgba(200, 220, 255, 0.4);
            border-radius: 2px;
        `);
    }

    /**
     * Show window preview in target zone
     *
     * @param {number} zoneIndex
     * @param {Meta.Window} window
     */
    showWindowPreview(zoneIndex, window) {
        if (!this._zones || zoneIndex === null) {
            return;
        }

        // Clear previous preview
        this._clearWindowPreview();

        const zone = this._zones[zoneIndex];
        if (!zone) {
            return;
        }

        // Create preview actor
        this._previewActor = new St.Widget({
            style: `
                background-color: rgba(100, 150, 255, 0.2);
                border: 2px dashed rgba(255, 255, 255, 0.6);
                border-radius: 4px;
            `,
            x: zone.x,
            y: zone.y,
            width: zone.width,
            height: zone.height,
            reactive: false
        });

        // Add window title label
        const titleLabel = new St.Label({
            text: window.get_title(),
            style: `
                color: white;
                font-size: 16px;
                background-color: rgba(0, 0, 0, 0.7);
                padding: 8px 12px;
                border-radius: 4px;
            `
        });

        // Center label in preview
        titleLabel.set_position(
            zone.x + (zone.width - titleLabel.get_width()) / 2,
            zone.y + (zone.height - titleLabel.get_height()) / 2
        );

        this._container.add_actor(this._previewActor);
        this._container.add_actor(titleLabel);

        this._logger.debug('Window preview shown', { zoneIndex, windowTitle: window.get_title() });
    }

    /**
     * Clear window preview
     * @private
     */
    _clearWindowPreview() {
        if (this._previewActor) {
            this._previewActor.destroy();
            this._previewActor = null;
        }
    }

    /**
     * Clear zone actors
     * @private
     */
    _clearZoneActors() {
        for (const zoneData of this._zoneActors) {
            zoneData.actor.destroy();
        }
        this._zoneActors = [];
        this._clearWindowPreview();
    }

    /**
     * Hide overlay
     */
    hide() {
        this._clearZoneActors();
        this._zones = null;
        this._highlightedZone = null;

        super.hide();
    }

    /**
     * Destroy overlay
     */
    destroy() {
        this._clearZoneActors();
        super.destroy();
    }
}
