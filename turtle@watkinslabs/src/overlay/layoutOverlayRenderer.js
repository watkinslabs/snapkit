/**
 * LayoutOverlayRenderer - Renders BTree zones as visual rectangles
 *
 * Displays:
 * - Zone rectangles with borders
 * - Zone numbers/labels
 * - Hover highlights
 * - Styling from settings
 *
 * Pure rendering - no interaction logic
 */

import St from 'gi://St';

import { Logger } from '../core/logger.js';

export class LayoutOverlayRenderer {
    constructor() {
        this._logger = new Logger('LayoutOverlayRenderer');
        this._zoneActors = [];
        this._labelActors = [];
    }

    /**
     * Render zones
     *
     * @param {St.Widget} container - Container to render into
     * @param {Array} zones - Zone rectangles from resolver
     * @param {Object} style - Style settings {bgColor, borderColor, borderWidth, opacity}
     */
    render(container, zones, style = {}) {
        // Clear existing
        this.clear();

        // Default style
        const s = {
            bgColor: style.bgColor || 'rgba(100, 150, 200, 0.3)',
            borderColor: style.borderColor || 'rgba(200, 220, 255, 0.8)',
            borderWidth: style.borderWidth || 2,
            textColor: style.textColor || 'white',
            fontSize: style.fontSize || 24,
            showLabels: style.showLabels !== false
        };

        // Create zone actors
        for (const zone of zones) {
            this._createZoneActor(container, zone, s);
        }

        this._logger.debug('Zones rendered', { count: zones.length });
    }

    /**
     * Create a zone actor
     * @private
     * @param {St.Widget} container
     * @param {Object} zone - {x, y, width, height, zoneIndex}
     * @param {Object} style
     */
    _createZoneActor(container, zone, style) {
        // Zone background
        const zoneActor = new St.Widget({
            style: `
                background-color: ${style.bgColor};
                border: ${style.borderWidth}px solid ${style.borderColor};
                border-radius: 4px;
            `,
            x: zone.x,
            y: zone.y,
            width: zone.width,
            height: zone.height,
            reactive: true // Enable hover/click
        });

        container.add_child(zoneActor);
        this._zoneActors.push({ actor: zoneActor, zone });

        // Zone label (number)
        if (style.showLabels) {
            const label = new St.Label({
                text: `${zone.zoneIndex + 1}`,
                style: `
                    color: ${style.textColor};
                    font-size: ${style.fontSize}px;
                    font-weight: bold;
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
                `
            });

            // Center label in zone
            const labelWidth = label.get_width();
            const labelHeight = label.get_height();

            label.set_position(
                zone.x + (zone.width - labelWidth) / 2,
                zone.y + (zone.height - labelHeight) / 2
            );

            container.add_child(label);
            this._labelActors.push(label);
        }
    }

    /**
     * Highlight a zone
     *
     * @param {number} zoneIndex
     * @param {Object} highlightStyle - Optional style override
     */
    highlightZone(zoneIndex, highlightStyle = {}) {
        const zoneData = this._zoneActors.find(z => z.zone.zoneIndex === zoneIndex);
        if (!zoneData) {
            return;
        }

        const hs = {
            bgColor: highlightStyle.bgColor || 'rgba(150, 200, 255, 0.5)',
            borderColor: highlightStyle.borderColor || 'rgba(255, 255, 255, 0.9)',
            borderWidth: highlightStyle.borderWidth || 3
        };

        zoneData.actor.set_style(`
            background-color: ${hs.bgColor};
            border: ${hs.borderWidth}px solid ${hs.borderColor};
            border-radius: 4px;
        `);

        this._logger.debug('Zone highlighted', { zoneIndex });
    }

    /**
     * Clear highlight from a zone
     *
     * @param {number} zoneIndex
     * @param {Object} normalStyle - Normal style to restore
     */
    clearHighlight(zoneIndex, normalStyle = {}) {
        const zoneData = this._zoneActors.find(z => z.zone.zoneIndex === zoneIndex);
        if (!zoneData) {
            return;
        }

        const ns = {
            bgColor: normalStyle.bgColor || 'rgba(100, 150, 200, 0.3)',
            borderColor: normalStyle.borderColor || 'rgba(200, 220, 255, 0.8)',
            borderWidth: normalStyle.borderWidth || 2
        };

        zoneData.actor.set_style(`
            background-color: ${ns.bgColor};
            border: ${ns.borderWidth}px solid ${ns.borderColor};
            border-radius: 4px;
        `);
    }

    /**
     * Get zone actor at index
     *
     * @param {number} zoneIndex
     * @returns {St.Widget|null}
     */
    getZoneActor(zoneIndex) {
        const zoneData = this._zoneActors.find(z => z.zone.zoneIndex === zoneIndex);
        return zoneData ? zoneData.actor : null;
    }

    /**
     * Get all zone actors
     *
     * @returns {Array<{actor: St.Widget, zone: Object}>}
     */
    getAllZoneActors() {
        return [...this._zoneActors];
    }

    /**
     * Clear all rendered zones
     */
    clear() {
        // Destroy zone actors
        for (const zoneData of this._zoneActors) {
            zoneData.actor.destroy();
        }
        this._zoneActors = [];

        // Destroy label actors
        for (const label of this._labelActors) {
            label.destroy();
        }
        this._labelActors = [];
    }

    /**
     * Update zone styles (e.g., from settings change)
     *
     * @param {Object} style - New style
     */
    updateStyles(style) {
        // Would need to re-render or update existing actors
        // For simplicity, caller should call render() again
        this._logger.debug('Style update requested - re-render needed');
    }
}
