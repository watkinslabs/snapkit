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

import St from 'gi://St';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
        this._currentWindow = null;
        this._workArea = null;

        this._logger = new Logger('SnapPreviewOverlay');
    }

    /**
     * Show preview for a layout on a monitor
     *
     * @param {number} monitorIndex
     * @param {Object} layout - Layout definition
     * @param {Object} options - {margin, padding, overrides, style, window}
     */
    showPreview(monitorIndex, layout, options = {}) {
        if (this._destroyed) {
            return;
        }

        // Debug logging
        console.log(`SnapKit DEBUG: SnapPreviewOverlay.showPreview - monitorIndex=${monitorIndex}`);
        console.log(`SnapKit DEBUG: SnapPreviewOverlay.showPreview - layout.id=${layout?.id}, layout.name=${layout?.name}`);

        // Store window for size validation
        this._currentWindow = options.window || null;

        // Get monitor work area
        const workArea = this._monitorManager.getWorkArea(monitorIndex);
        if (!workArea) {
            this._logger.warn('Invalid monitor', { monitorIndex });
            return;
        }

        try {
            // Store workArea for relative positioning
            this._workArea = workArea;

            // Resolve layout to zones
            this._zones = this._layoutResolver.resolve(layout, workArea, {
                margin: options.margin ?? 0,
                padding: options.padding ?? 0,
                overrides: options.overrides ?? []
            });

            console.log(`SnapKit DEBUG: SnapPreviewOverlay - resolved ${this._zones.length} zones`);

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
            // Use relative coordinates (zones are in absolute screen coords, container is positioned at workArea)
            const relativeX = zone.x - this._workArea.x;
            const relativeY = zone.y - this._workArea.y;

            const zoneActor = new St.Widget({
                style: `
                    background-color: transparent;
                    border: ${s.borderWidth}px solid ${s.borderColor};
                    border-radius: 2px;
                `,
                x: relativeX,
                y: relativeY,
                width: zone.width,
                height: zone.height,
                reactive: false
            });

            this._container.add_child(zoneActor);
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

        // Check if window can fit (if we have a current window)
        const canFit = !this._currentWindow || this._canWindowFitInZone(this._currentWindow, zoneData.zone);

        // Use red highlight if window can't fit
        zoneData.actor.set_style(`
            background-color: ${canFit ? 'rgba(150, 200, 255, 0.3)' : 'rgba(255, 100, 100, 0.4)'};
            border: 2px solid ${canFit ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 80, 80, 0.9)'};
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
     * Check if window can fit in zone
     * @private
     * @param {Meta.Window} window
     * @param {Object} zone
     * @returns {boolean}
     */
    _canWindowFitInZone(window, zone) {
        if (!window) {
            console.log('SnapKit DEBUG: No window provided for size check');
            return true;
        }

        try {
            const rect = window.get_frame_rect();
            const windowTitle = window.get_title();
            const allowsResize = window.allows_resize();

            // Debug: check window backend and properties
            const windowType = window.get_window_type();
            const wmClass = window.get_wm_class();
            const clientType = window.get_client_type ? window.get_client_type() : 'unknown';
            const bufferRect = window.get_buffer_rect();

            console.log(`SnapKit DEBUG: Checking window fit: "${windowTitle}"`);
            console.log(`  WM Class: ${wmClass}`);
            console.log(`  Window Type: ${windowType}`);
            console.log(`  Client Type: ${clientType} (0=X11, 1=Wayland)`);
            console.log(`  Zone: ${zone.width}x${zone.height}`);
            console.log(`  Window frame rect: ${rect.width}x${rect.height}`);
            console.log(`  Window buffer rect: ${bufferRect.width}x${bufferRect.height}`);
            console.log(`  Allows resize: ${allowsResize}`);
            console.log(`  Allows move: ${window.allows_move ? window.allows_move() : 'unknown'}`);
            console.log(`  Can maximize: ${window.can_maximize ? window.can_maximize() : 'unknown'}`);
            console.log(`  Is override redirect: ${window.is_override_redirect ? window.is_override_redirect() : 'unknown'}`);

            // Try to get minimum size hints (both X11 and Wayland)
            let minWidth = null;
            let minHeight = null;
            let maxWidth = null;
            let maxHeight = null;

            // Check what size hint methods are available
            console.log(`  Available size methods:`);
            console.log(`    - get_minimum_size_hints: ${typeof window.get_minimum_size_hints === 'function' ? 'YES' : 'NO'}`);
            console.log(`    - get_maximum_size_hints: ${typeof window.get_maximum_size_hints === 'function' ? 'YES' : 'NO'}`);
            console.log(`    - get_size_hints: ${typeof window.get_size_hints === 'function' ? 'YES' : 'NO'}`);
            console.log(`    - get_mutter_hints: ${typeof window.get_mutter_hints === 'function' ? 'YES' : 'NO'}`);

            // Try get_minimum_size_hints()
            if (typeof window.get_minimum_size_hints === 'function') {
                try {
                    const minHints = window.get_minimum_size_hints();
                    console.log(`  get_minimum_size_hints() returned:`, minHints);

                    if (minHints && Array.isArray(minHints) && minHints.length === 2) {
                        // Returns [min_width, min_height], may be [-1, -1] if unset
                        if (minHints[0] > 0) minWidth = minHints[0];
                        if (minHints[1] > 0) minHeight = minHints[1];
                        console.log(`  Parsed minimum size: ${minWidth || 'none'}x${minHeight || 'none'}`);
                    } else {
                        console.log(`  Minimum size hints: not available or invalid format`);
                    }
                } catch (e) {
                    console.log(`  Error getting minimum size hints: ${e.message}`);
                }
            }

            // Try get_maximum_size_hints() if it exists
            if (typeof window.get_maximum_size_hints === 'function') {
                try {
                    const maxHints = window.get_maximum_size_hints();
                    console.log(`  get_maximum_size_hints() returned:`, maxHints);

                    if (maxHints && Array.isArray(maxHints) && maxHints.length === 2) {
                        if (maxHints[0] > 0) maxWidth = maxHints[0];
                        if (maxHints[1] > 0) maxHeight = maxHints[1];
                        console.log(`  Parsed maximum size: ${maxWidth || 'none'}x${maxHeight || 'none'}`);
                    }
                } catch (e) {
                    console.log(`  Error getting maximum size hints: ${e.message}`);
                }
            }

            // Try get_size_hints() if it exists (old API?)
            if (typeof window.get_size_hints === 'function') {
                try {
                    const hints = window.get_size_hints();
                    console.log(`  get_size_hints() returned:`, hints);
                } catch (e) {
                    console.log(`  Error getting size hints: ${e.message}`);
                }
            }

            // Try get_mutter_hints() if it exists
            if (typeof window.get_mutter_hints === 'function') {
                try {
                    const mutterHints = window.get_mutter_hints();
                    console.log(`  get_mutter_hints() returned:`, mutterHints);
                } catch (e) {
                    console.log(`  Error getting mutter hints: ${e.message}`);
                }
            }

            // Determine effective minimum size for validation
            let effectiveMinWidth;
            let effectiveMinHeight;

            if (!allowsResize) {
                // Fixed-size windows: current size IS the minimum
                effectiveMinWidth = rect.width;
                effectiveMinHeight = rect.height;
                console.log(`  Fixed-size window - Using current size as minimum: ${effectiveMinWidth}x${effectiveMinHeight}`);
            } else if (minWidth || minHeight) {
                // Resizable with hints: use hints, fallback to current size for missing dimensions
                effectiveMinWidth = minWidth || rect.width;
                effectiveMinHeight = minHeight || rect.height;
                console.log(`  Resizable with hints - Effective minimum: ${effectiveMinWidth}x${effectiveMinHeight}`);
                console.log(`    (min_width=${minWidth || 'unset'}, min_height=${minHeight || 'unset'})`);
            } else {
                // Resizable without hints: use current size as conservative estimate
                effectiveMinWidth = rect.width;
                effectiveMinHeight = rect.height;
                console.log(`  Resizable without hints - Using current size as estimate: ${effectiveMinWidth}x${effectiveMinHeight}`);
            }

            // Check if window can fit
            const canFit = zone.width >= effectiveMinWidth && zone.height >= effectiveMinHeight;
            console.log(`  Final validation: Zone ${zone.width}x${zone.height} vs Effective Min ${effectiveMinWidth}x${effectiveMinHeight} => Can fit: ${canFit}`);

            if (!canFit) {
                this._logger.warn('Window cannot fit in zone', {
                    windowTitle,
                    zoneSize: `${zone.width}x${zone.height}`,
                    effectiveMinSize: `${effectiveMinWidth}x${effectiveMinHeight}`,
                    allowsResize,
                    hasMinWidthHint: !!minWidth,
                    hasMinHeightHint: !!minHeight
                });
            }

            return canFit;

        } catch (error) {
            console.log('SnapKit DEBUG: Error checking window fit', error);
            return true; // Assume it fits if we can't determine
        }
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

        // Store current window
        this._currentWindow = window;

        // Clear previous preview
        this._clearWindowPreview();

        const zone = this._zones[zoneIndex];
        if (!zone) {
            return;
        }

        // Check if window can fit
        const canFit = this._canWindowFitInZone(window, zone);

        // Use relative coordinates
        const relativeX = zone.x - this._workArea.x;
        const relativeY = zone.y - this._workArea.y;

        // Create preview actor with color based on fit status
        this._previewActor = new St.Widget({
            style: `
                background-color: ${canFit ? 'rgba(100, 150, 255, 0.2)' : 'rgba(255, 80, 80, 0.3)'};
                border: 2px dashed ${canFit ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 100, 100, 0.8)'};
                border-radius: 4px;
            `,
            x: relativeX,
            y: relativeY,
            width: zone.width,
            height: zone.height,
            reactive: false
        });

        // Add window title label
        const titleLabel = new St.Label({
            text: canFit ? window.get_title() : `${window.get_title()} (Too Small)`,
            style: `
                color: white;
                font-size: 16px;
                background-color: ${canFit ? 'rgba(0, 0, 0, 0.7)' : 'rgba(180, 50, 50, 0.9)'};
                padding: 8px 12px;
                border-radius: 4px;
            `
        });

        // Center label in preview (using relative coordinates)
        titleLabel.set_position(
            relativeX + (zone.width - titleLabel.get_width()) / 2,
            relativeY + (zone.height - titleLabel.get_height()) / 2
        );

        this._container.add_child(this._previewActor);
        this._container.add_child(titleLabel);

        this._logger.debug('Window preview shown', {
            zoneIndex,
            windowTitle: window.get_title(),
            canFit
        });
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
        this._currentWindow = null;
        this._workArea = null;

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
