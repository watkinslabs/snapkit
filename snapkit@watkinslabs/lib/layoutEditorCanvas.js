/**
 * Layout Editor Canvas
 *
 * A GTK4 DrawingArea-based widget that renders a layout preview
 * and handles click interactions for selecting zones.
 */

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Graphene from 'gi://Graphene';

import { resolveLayout, resolveSimpleLayout } from './layoutResolver.js';
import { isFullSpecLayout } from './layoutValidator.js';

// Colors for rendering
const COLORS = {
    background: { r: 0.15, g: 0.15, b: 0.15, a: 1.0 },
    zone: { r: 0.25, g: 0.25, b: 0.30, a: 1.0 },
    zoneBorder: { r: 0.4, g: 0.4, b: 0.5, a: 1.0 },
    zoneSelected: { r: 0.3, g: 0.5, b: 0.8, a: 1.0 },
    zoneSelectedBorder: { r: 0.4, g: 0.6, b: 0.9, a: 1.0 },
    zoneHover: { r: 0.35, g: 0.35, b: 0.45, a: 1.0 },
    text: { r: 0.9, g: 0.9, b: 0.9, a: 1.0 },
    gap: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 }
};

export const LayoutEditorCanvas = GObject.registerClass({
    GTypeName: 'LayoutEditorCanvas',
    Signals: {
        'zone-clicked': {
            param_types: [GObject.TYPE_STRING]  // zone ID
        },
        'zone-hover': {
            param_types: [GObject.TYPE_STRING]  // zone ID or empty
        }
    }
}, class LayoutEditorCanvas extends Gtk.DrawingArea {
    _init(params = {}) {
        super._init({
            hexpand: true,
            vexpand: true,
            ...params
        });

        this._layout = null;
        this._resolvedRects = new Map();
        this._selectedPath = [];
        this._hoveredZoneId = null;
        this._canvasWidth = 400;
        this._canvasHeight = 300;
        this._padding = 20;

        // Set up drawing
        this.set_draw_func(this._onDraw.bind(this));

        // Set up click handling
        const clickGesture = new Gtk.GestureClick();
        clickGesture.connect('pressed', this._onClicked.bind(this));
        this.add_controller(clickGesture);

        // Set up hover handling
        const motionController = new Gtk.EventControllerMotion();
        motionController.connect('motion', this._onMotion.bind(this));
        motionController.connect('leave', this._onLeave.bind(this));
        this.add_controller(motionController);

        // Set minimum size
        this.set_size_request(300, 200);
    }

    /**
     * Set the layout to display
     * @param {object} layout
     */
    setLayout(layout) {
        this._layout = layout;
        this._resolveLayout();
        this.queue_draw();
    }

    /**
     * Set the selected node path
     * @param {number[]} path
     */
    setSelectedPath(path) {
        this._selectedPath = path || [];
        this.queue_draw();
    }

    /**
     * Get the selected zone ID (if a leaf is selected)
     * @returns {string|null}
     */
    getSelectedZoneId() {
        if (!this._layout) return null;

        let node = this._layout.root;
        for (const index of this._selectedPath) {
            if (node.type !== 'split' || !node.children[index]) {
                return null;
            }
            node = node.children[index];
        }

        return node.type === 'leaf' ? node.id : null;
    }

    /**
     * Resolve the layout to pixel rectangles
     */
    _resolveLayout() {
        if (!this._layout) {
            this._resolvedRects = new Map();
            return;
        }

        // Create a virtual work area based on canvas size
        const workArea = {
            x: this._padding,
            y: this._padding,
            width: this._canvasWidth - (this._padding * 2),
            height: this._canvasHeight - (this._padding * 2)
        };

        if (isFullSpecLayout(this._layout)) {
            this._resolvedRects = resolveLayout(this._layout, workArea);
        } else if (this._layout.zones) {
            this._resolvedRects = resolveSimpleLayout(this._layout, workArea);
        } else {
            this._resolvedRects = new Map();
        }
    }

    /**
     * Draw callback
     */
    _onDraw(area, cr, width, height) {
        // Update canvas dimensions
        this._canvasWidth = width;
        this._canvasHeight = height;

        // Re-resolve with new dimensions
        this._resolveLayout();

        // Draw background
        cr.setSourceRGBA(
            COLORS.background.r,
            COLORS.background.g,
            COLORS.background.b,
            COLORS.background.a
        );
        cr.paint();

        // Draw work area outline
        cr.setSourceRGBA(0.3, 0.3, 0.3, 1.0);
        cr.setLineWidth(1);
        cr.rectangle(
            this._padding - 1,
            this._padding - 1,
            this._canvasWidth - (this._padding * 2) + 2,
            this._canvasHeight - (this._padding * 2) + 2
        );
        cr.stroke();

        // Get selected zone ID
        const selectedZoneId = this.getSelectedZoneId();

        // Draw each zone
        for (const [zoneId, rects] of this._resolvedRects) {
            const rect = rects.tileRect;
            const isSelected = zoneId === selectedZoneId;
            const isHovered = zoneId === this._hoveredZoneId;

            // Choose colors based on state
            let fillColor, borderColor;
            if (isSelected) {
                fillColor = COLORS.zoneSelected;
                borderColor = COLORS.zoneSelectedBorder;
            } else if (isHovered) {
                fillColor = COLORS.zoneHover;
                borderColor = COLORS.zoneBorder;
            } else {
                fillColor = COLORS.zone;
                borderColor = COLORS.zoneBorder;
            }

            // Draw zone fill
            cr.setSourceRGBA(fillColor.r, fillColor.g, fillColor.b, fillColor.a);
            cr.rectangle(rect.x, rect.y, rect.width, rect.height);
            cr.fill();

            // Draw zone border
            cr.setSourceRGBA(borderColor.r, borderColor.g, borderColor.b, borderColor.a);
            cr.setLineWidth(isSelected ? 2 : 1);
            cr.rectangle(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
            cr.stroke();

            // Draw zone ID label
            this._drawLabel(cr, zoneId, rect);
        }
    }

    /**
     * Draw a label centered in a rectangle
     */
    _drawLabel(cr, text, rect) {
        cr.setSourceRGBA(COLORS.text.r, COLORS.text.g, COLORS.text.b, COLORS.text.a);
        cr.selectFontFace('Sans', 0, 0);  // Normal, normal weight

        // Calculate font size based on zone size
        const maxSize = Math.min(rect.width, rect.height);
        const fontSize = Math.max(10, Math.min(14, maxSize / 6));
        cr.setFontSize(fontSize);

        // Get text extents
        const extents = cr.textExtents(text);

        // Center the text
        const textX = rect.x + (rect.width - extents.width) / 2;
        const textY = rect.y + (rect.height + extents.height) / 2;

        cr.moveTo(textX, textY);
        cr.showText(text);
    }

    /**
     * Handle click events
     */
    _onClicked(gesture, nPress, x, y) {
        const zoneId = this._findZoneAtPoint(x, y);
        if (zoneId) {
            this.emit('zone-clicked', zoneId);
        }
    }

    /**
     * Handle mouse motion for hover effects
     */
    _onMotion(controller, x, y) {
        const zoneId = this._findZoneAtPoint(x, y);
        if (zoneId !== this._hoveredZoneId) {
            this._hoveredZoneId = zoneId;
            this.emit('zone-hover', zoneId || '');
            this.queue_draw();
        }
    }

    /**
     * Handle mouse leaving the widget
     */
    _onLeave(controller) {
        if (this._hoveredZoneId) {
            this._hoveredZoneId = null;
            this.emit('zone-hover', '');
            this.queue_draw();
        }
    }

    /**
     * Find which zone contains the given point
     * @param {number} x
     * @param {number} y
     * @returns {string|null}
     */
    _findZoneAtPoint(x, y) {
        for (const [zoneId, rects] of this._resolvedRects) {
            const rect = rects.tileRect;
            if (x >= rect.x && x < rect.x + rect.width &&
                y >= rect.y && y < rect.y + rect.height) {
                return zoneId;
            }
        }
        return null;
    }

    /**
     * Find the path to a zone by ID
     * @param {string} zoneId
     * @returns {number[]|null}
     */
    findPathToZone(zoneId) {
        if (!this._layout) return null;
        return this._findPathRecursive(this._layout.root, zoneId, []);
    }

    /**
     * Recursively find path to a node
     */
    _findPathRecursive(node, targetId, currentPath) {
        if (node.type === 'leaf') {
            return node.id === targetId ? currentPath : null;
        }

        if (node.type === 'split' && node.children) {
            for (let i = 0; i < node.children.length; i++) {
                const result = this._findPathRecursive(
                    node.children[i],
                    targetId,
                    [...currentPath, i]
                );
                if (result) return result;
            }
        }

        return null;
    }
});
