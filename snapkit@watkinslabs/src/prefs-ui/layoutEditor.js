/**
 * Adw layout editor — runs in the prefs window process.
 *
 * Real Adw.Window modal, transient for the prefs window. Reuses the existing
 * pure-JS LayoutTree / LayoutResolver from src/btree so the canvas shows the
 * exact same geometry the shell renders at runtime.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';

import { LayoutTree } from '../btree/tree/layoutTree.js';
import { LayoutResolver } from '../btree/resolver/layoutResolver.js';
import { LayoutManager } from '../btree/manager/layoutManager.js';

const CANVAS_W = 380;
const CANVAS_H = 260;

/**
 * Open the editor.
 *
 * @param {Gtk.Window} parentWindow - Adw.PreferencesWindow / dialog parent.
 * @param {Gio.Settings} settings    - Extension GSettings instance.
 * @param {Object}      options
 * @param {'create'|'edit'|'clone'} options.mode
 * @param {string}      [options.layoutId] - For edit/clone.
 */
export function openLayoutEditor(parentWindow, settings, options = {}) {
    const mode = options.mode || 'create';
    const sourceId = options.layoutId || null;

    const layoutManager = new LayoutManager();
    _hydrateCustomLayouts(layoutManager, settings);

    const sourceDef = sourceId ? layoutManager.getLayout(sourceId) : null;

    let tree;
    try {
        if (sourceDef) {
            tree = LayoutTree.fromDefinition(sourceDef.layout);
        } else {
            tree = LayoutTree.createGrid(2, 2);
        }
    } catch (error) {
        console.error('[SnapKit][LayoutEditor] Failed to load tree', error);
        tree = LayoutTree.createGrid(2, 2);
    }

    const editor = new LayoutEditorWindow({
        parentWindow,
        settings,
        layoutManager,
        mode,
        sourceDef,
        tree,
    });
    editor.present();
}

const LayoutEditorWindow = GObject.registerClass(
class LayoutEditorWindow extends Adw.Window {
    _init({ parentWindow, settings, layoutManager, mode, sourceDef, tree }) {
        super._init({
            transient_for: parentWindow,
            modal: true,
            default_width: 660,
            default_height: 450,
            title: _titleFor(mode, sourceDef),
        });

        this._settings = settings;
        this._layoutManager = layoutManager;
        this._mode = mode;
        this._sourceDef = sourceDef;
        this._tree = tree;
        this._resolver = new LayoutResolver();
        this._selectedZone = null;
        this._zoneRects = [];

        const initial = this._initialFields();
        this._margin = initial.margin;
        this._padding = initial.padding;

        const tbv = new Adw.ToolbarView();
        this.set_content(tbv);

        const header = new Adw.HeaderBar({ show_end_title_buttons: false });
        this._cancelBtn = new Gtk.Button({ label: 'Cancel' });
        this._cancelBtn.connect('clicked', () => this.close());
        this._saveBtn = new Gtk.Button({
            label: 'Save',
            css_classes: ['suggested-action'],
        });
        this._saveBtn.connect('clicked', () => this._save());
        header.pack_start(this._cancelBtn);
        header.pack_end(this._saveBtn);
        tbv.add_top_bar(header);

        const root = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12, margin_bottom: 12,
            margin_start: 12, margin_end: 12,
        });
        tbv.set_content(root);

        // --- Identity group ---
        const idGroup = new Adw.PreferencesGroup({ title: 'Layout' });
        root.append(idGroup);

        this._nameEntry = new Adw.EntryRow({ title: 'Name' });
        this._nameEntry.set_text(initial.name);
        idGroup.add(this._nameEntry);

        // ID is auto-derived from the name (slugified) on save. We pin it
        // for edits so we don't lose persistence by accidentally renaming
        // the storage key when the user just tweaks the title.
        this._fixedId = (mode === 'edit' && sourceDef) ? sourceDef.id : null;

        this._descEntry = new Adw.EntryRow({ title: 'Description (optional)' });
        this._descEntry.set_text(initial.description);
        idGroup.add(this._descEntry);

        // --- Editor body: canvas + side panel ---
        const body = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            hexpand: true, vexpand: true,
        });
        root.append(body);

        // Canvas
        const canvasFrame = new Gtk.Frame({ hexpand: true, vexpand: true });
        body.append(canvasFrame);

        this._canvas = new Gtk.DrawingArea({
            content_width: CANVAS_W,
            content_height: CANVAS_H,
            hexpand: true, vexpand: true,
        });
        this._canvas.set_draw_func((_w, cr, w, h) => this._draw(cr, w, h));
        canvasFrame.set_child(this._canvas);

        const click = new Gtk.GestureClick({ button: 0 });
        click.connect('pressed', (_g, _n, x, y) => this._onCanvasClick(x, y));
        this._canvas.add_controller(click);

        // Side panel
        const side = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            width_request: 240,
        });
        body.append(side);

        const quickLabel = _muted('Quick layouts');
        side.append(quickLabel);

        const quickGrid = new Gtk.Grid({
            row_spacing: 6, column_spacing: 6,
            row_homogeneous: true, column_homogeneous: true,
        });
        side.append(quickGrid);

        const quickItems = [
            ['1 × 1', 1, 1], ['2 × 1', 2, 1], ['1 × 2', 1, 2],
            ['2 × 2', 2, 2], ['3 × 3', 3, 3], ['Quarters', 2, 2],
        ];
        quickItems.forEach((item, i) => {
            const [label, rows, cols] = item;
            const btn = new Gtk.Button({ label });
            btn.connect('clicked', () => this._loadGrid(rows, cols));
            quickGrid.attach(btn, i % 3, Math.floor(i / 3), 1, 1);
        });

        side.append(_separator());

        this._selectionLabel = new Gtk.Label({
            label: 'Click a zone to select.',
            xalign: 0, wrap: true,
        });
        side.append(this._selectionLabel);

        const splitRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, homogeneous: true,
        });
        this._splitHBtn = new Gtk.Button({ label: 'Split ─', tooltip_text: 'Split selected zone horizontally' });
        this._splitVBtn = new Gtk.Button({ label: 'Split │', tooltip_text: 'Split selected zone vertically' });
        this._splitHBtn.connect('clicked', () => this._splitSelected('horizontal'));
        this._splitVBtn.connect('clicked', () => this._splitSelected('vertical'));
        splitRow.append(this._splitHBtn);
        splitRow.append(this._splitVBtn);
        side.append(splitRow);

        // Unsplit / merge: collapse the parent split, the selected zone takes
        // the parent's space, the sibling subtree is dropped.
        this._unsplitBtn = new Gtk.Button({
            label: 'Merge into parent',
            tooltip_text: 'Remove the split that contains this zone — selected zone keeps the combined space',
            css_classes: ['destructive-action'],
        });
        this._unsplitBtn.connect('clicked', () => this._unsplitSelected());
        side.append(this._unsplitBtn);

        side.append(_separator());

        // Screen-relative size of the selected zone along its parent split's
        // axis. Slider and spin button share one Gtk.Adjustment so changing
        // either updates the other automatically.
        this._sizeAxisLabel = _muted('Selected zone size');
        side.append(this._sizeAxisLabel);

        this._sizeAdj = new Gtk.Adjustment({
            lower: 5, upper: 95, step_increment: 1, page_increment: 5, value: 50,
        });
        this._sizeSignalId = this._sizeAdj.connect('value-changed', () => this._onSizeChanged());

        const sizeRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL, spacing: 6,
        });
        this._sizeScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: this._sizeAdj,
            draw_value: false,
            hexpand: true,
        });
        this._sizeScale.set_sensitive(false);
        sizeRow.append(this._sizeScale);

        this._sizeSpin = new Gtk.SpinButton({
            adjustment: this._sizeAdj,
            digits: 1,
            climb_rate: 1,
            numeric: true,
            width_chars: 5,
        });
        this._sizeSpin.set_sensitive(false);
        sizeRow.append(this._sizeSpin);

        const pctLabel = new Gtk.Label({ label: '%', xalign: 0 });
        pctLabel.add_css_class('dim-label');
        sizeRow.append(pctLabel);

        side.append(sizeRow);

        side.append(_separator());

        side.append(_muted('Spacing'));
        this._marginSpin = _spin(0, 50, 1, this._margin, (v) => {
            this._margin = v;
            this._canvas.queue_draw();
        });
        const marginRow = _labeledSpin('Margin', this._marginSpin);
        side.append(marginRow);

        this._paddingSpin = _spin(0, 50, 1, this._padding, (v) => {
            this._padding = v;
            this._canvas.queue_draw();
        });
        const paddingRow = _labeledSpin('Padding', this._paddingSpin);
        side.append(paddingRow);

        // Status line at bottom
        this._statusLabel = new Gtk.Label({ label: '', xalign: 0, wrap: true });
        this._statusLabel.add_css_class('dim-label');
        root.append(this._statusLabel);

        this._refreshSelectionState();
    }

    _initialFields() {
        if (this._mode === 'create') {
            const fresh = _nextAutoId(this._layoutManager);
            return { name: fresh.name, id: fresh.id, description: '', margin: 0, padding: 4 };
        }
        if (this._mode === 'clone') {
            const base = this._sourceDef || {};
            return {
                name: base.name ? `${base.name} (Copy)` : 'Copy',
                id: _suggestCloneId(this._layoutManager, base.id || 'layout'),
                description: base.description || '',
                margin: base.margin || 0,
                padding: base.padding || 4,
            };
        }
        // edit
        const base = this._sourceDef || {};
        return {
            name: base.name || base.id || '',
            id: base.id || '',
            description: base.description || '',
            margin: base.margin || 0,
            padding: base.padding || 4,
        };
    }

    _setStatus(msg, isError = false) {
        this._statusLabel.set_text(msg || '');
        this._statusLabel.remove_css_class('error');
        this._statusLabel.remove_css_class('dim-label');
        if (isError) {
            this._statusLabel.add_css_class('error');
        } else {
            this._statusLabel.add_css_class('dim-label');
        }
    }

    // ----- Tree mutations -----

    _loadGrid(rows, cols) {
        this._tree = LayoutTree.createGrid(rows, cols);
        this._selectedZone = 0;
        this._setStatus(`Loaded ${rows} × ${cols} grid.`);
        this._canvas.queue_draw();
        this._refreshSelectionState();
    }

    _unsplitSelected() {
        if (this._selectedZone === null) {
            this._setStatus('Select a zone first.', true);
            return;
        }
        try {
            const survivor = this._tree.unsplitZone(this._selectedZone);
            if (survivor === null) {
                this._setStatus('Nothing to merge — this zone fills the layout.', true);
                return;
            }
            this._selectedZone = survivor;
            this._setStatus('Merged.');
            this._canvas.queue_draw();
            this._refreshSelectionState();
        } catch (error) {
            this._setStatus(`Merge failed: ${error.message || error}`, true);
        }
    }

    _splitSelected(direction) {
        if (this._selectedZone === null) {
            this._setStatus('Select a zone first.', true);
            return;
        }
        try {
            const previousIndex = this._selectedZone;
            const ok = this._tree.splitZone(previousIndex, direction, 0.5);
            if (!ok) {
                this._setStatus(`Could not split zone ${previousIndex + 1}.`, true);
                return;
            }
            // Renumber so indices stay 0..N-1 (the snap pipeline indexes the
            // resolver output by zoneIndex; sparse IDs would silently fail).
            this._tree.normalize();
            // After normalize, the previous slot N is now occupied by a branch
            // whose left leaf occupies in-order position N — keep selection there.
            this._selectedZone = previousIndex;
            this._setStatus('');
            this._canvas.queue_draw();
            this._refreshSelectionState();
        } catch (error) {
            this._setStatus(`Split failed: ${error.message || error}`, true);
        }
    }

    _onSizeChanged() {
        // Translate the requested screen-percent back into a parent-split ratio.
        if (this._selectedZone === null) return;
        const leaf = this._tree.findLeafByZone(this._selectedZone);
        if (!leaf || !leaf.parent) return;

        const ctx = this._currentSelectionContext();
        if (!ctx) return;

        const requestedPct = this._sizeAdj.get_value();          // 5..95
        const parentPct = ctx.parentSpanPct;                     // % of canvas axis
        if (parentPct <= 0) return;

        // Clamp so we don't try to make the leaf bigger than its parent.
        const maxLeaf = Math.max(1, parentPct - 1);
        const target = Math.min(requestedPct, maxLeaf);

        const fraction = target / parentPct;                      // 0..1
        const newRatio = leaf.parent.left === leaf ? fraction : 1 - fraction;
        leaf.parent.ratio = Math.max(0.05, Math.min(0.95, newRatio));

        this._canvas.queue_draw();

        // If the user requested more than the parent allows, snap the
        // visible value to the actual maximum without re-firing.
        if (target !== requestedPct) {
            this._setAdjValueSilently(target);
        }
    }

    _refreshSelectionState() {
        const leaf = this._selectedZone !== null ? this._tree.findLeafByZone(this._selectedZone) : null;
        if (!leaf) {
            this._selectionLabel.set_text('Click a zone in the preview to select it.');
            this._splitHBtn.set_sensitive(false);
            this._splitVBtn.set_sensitive(false);
            this._unsplitBtn.set_sensitive(false);
            this._sizeScale.set_sensitive(false);
            this._sizeSpin.set_sensitive(false);
            this._sizeAxisLabel.set_text('Selected zone size');
            return;
        }
        this._splitHBtn.set_sensitive(true);
        this._splitVBtn.set_sensitive(true);
        this._unsplitBtn.set_sensitive(!!leaf.parent);

        const ctx = this._currentSelectionContext();
        if (!leaf.parent || !ctx) {
            this._selectionLabel.set_text(
                `Zone ${leaf.zoneIndex + 1} fills the whole layout. Split it to subdivide.`
            );
            this._sizeScale.set_sensitive(false);
            this._sizeSpin.set_sensitive(false);
            this._sizeAxisLabel.set_text('Selected zone size');
            return;
        }

        const axisName = ctx.axis === 'width' ? 'Width' : 'Height';
        this._selectionLabel.set_text(
            `Zone ${leaf.zoneIndex + 1} selected. ${axisName} as % of screen ${ctx.axis}:`
        );
        this._sizeAxisLabel.set_text(
            `${axisName}: parent slot is ${ctx.parentSpanPct.toFixed(1)}% of screen ${ctx.axis}`
        );
        this._sizeScale.set_sensitive(true);
        this._sizeSpin.set_sensitive(true);

        // Constrain bounds to the parent's available span.
        const maxLeaf = Math.max(2, ctx.parentSpanPct - 1);
        this._sizeAdj.set_lower(1);
        this._sizeAdj.set_upper(maxLeaf);
        this._setAdjValueSilently(ctx.leafSpanPct);
    }

    _setAdjValueSilently(value) {
        if (this._sizeSignalId) {
            GObject.signal_handler_block(this._sizeAdj, this._sizeSignalId);
        }
        this._sizeAdj.set_value(value);
        if (this._sizeSignalId) {
            GObject.signal_handler_unblock(this._sizeAdj, this._sizeSignalId);
        }
    }

    /**
     * Compute geometry context for the currently-selected leaf:
     *   { axis, leafSpanPct, parentSpanPct }
     * axis is 'width' if the parent split is vertical (side-by-side), else 'height'.
     * Spans are expressed as % of the canvas (== % of screen along that axis).
     */
    _currentSelectionContext() {
        const leaf = this._selectedZone !== null ? this._tree.findLeafByZone(this._selectedZone) : null;
        if (!leaf || !leaf.parent) return null;

        const w = this._canvas.get_content_width() || CANVAS_W;
        const h = this._canvas.get_content_height() || CANVAS_H;
        const rects = _branchRectMap(this._tree.root, { x: 0, y: 0, width: w, height: h });

        const leafRect = rects.get(leaf);
        const parentRect = rects.get(leaf.parent);
        if (!leafRect || !parentRect) return null;

        const axis = leaf.parent.direction === 'vertical' ? 'width' : 'height';
        const screenSpan = axis === 'width' ? w : h;
        const leafSpanPct = (leafRect[axis] / screenSpan) * 100;
        const parentSpanPct = (parentRect[axis] / screenSpan) * 100;
        return { axis, leafSpanPct, parentSpanPct };
    }

    // ----- Canvas drawing & hit-testing -----

    _draw(cr, w, h) {
        // Background
        cr.setSourceRGBA(0.13, 0.13, 0.15, 1.0);
        cr.rectangle(0, 0, w, h);
        cr.fill();

        const def = this._safeDefinition();
        if (!def) return;

        let zones;
        try {
            zones = this._resolver.resolve(def, { x: 0, y: 0, width: w, height: h }, {
                margin: this._margin,
                padding: this._padding,
                useCache: false,
            });
        } catch (error) {
            cr.setSourceRGBA(1, 0.4, 0.4, 1);
            _drawText(cr, `Resolve failed: ${error.message || error}`, 12, h / 2, 13);
            return;
        }

        this._zoneRects = zones;

        for (const z of zones) {
            const isSel = z.zoneIndex === this._selectedZone;
            cr.setSourceRGBA(isSel ? 0.40 : 0.30, isSel ? 0.55 : 0.40, isSel ? 0.85 : 0.60, 0.55);
            cr.rectangle(z.x, z.y, z.width, z.height);
            cr.fill();

            cr.setSourceRGBA(1, 1, 1, isSel ? 0.95 : 0.55);
            cr.setLineWidth(isSel ? 3 : 1.5);
            cr.rectangle(z.x + 1, z.y + 1, z.width - 2, z.height - 2);
            cr.stroke();

            cr.setSourceRGBA(1, 1, 1, 0.95);
            const fontSize = Math.max(12, Math.min(28, Math.floor(Math.min(z.width, z.height) / 4)));
            _drawText(cr, String(z.zoneIndex + 1),
                z.x + z.width / 2, z.y + z.height / 2, fontSize, /*center*/ true);
        }
    }

    _safeDefinition() {
        try {
            return this._tree.toDefinition();
        } catch (error) {
            this._setStatus(`Tree error: ${error.message || error}`, true);
            return null;
        }
    }

    _onCanvasClick(x, y) {
        for (const z of this._zoneRects) {
            if (x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height) {
                this._selectedZone = z.zoneIndex;
                this._canvas.queue_draw();
                this._refreshSelectionState();
                return;
            }
        }
    }

    // ----- Save -----

    _save() {
        const name = this._nameEntry.get_text().trim();
        const description = this._descEntry.get_text().trim();

        if (!name) {
            this._setStatus('Name is required.', true);
            this._nameEntry.grab_focus();
            return;
        }

        // Edits keep the original ID so persistence stays intact. New /
        // cloned layouts derive an ID from the name (collision-suffixed).
        const id = this._fixedId
            ? this._fixedId
            : _slugifyUnique(this._layoutManager, name);

        const isEditingExisting = this._mode === 'edit' && this._sourceDef && this._sourceDef.id === id;
        const customLayouts = _readCustomLayouts(this._settings);

        if (!isEditingExisting && _isBuiltinId(this._layoutManager, id)) {
            this._setStatus(`Name conflicts with a built-in layout. Try a different name.`, true);
            this._nameEntry.grab_focus();
            return;
        }

        let layoutShape;
        try {
            // Persisted layouts MUST have dense zoneIndex (0..N-1). The snap
            // handler indexes the resolver output by zoneIndex, so any gaps
            // make picker clicks silently no-op.
            this._tree.normalize();
            layoutShape = this._tree.toDefinition();
        } catch (error) {
            this._setStatus(`Cannot serialize tree: ${error.message || error}`, true);
            return;
        }

        const newDef = {
            id, name, description,
            layout: layoutShape,
            builtin: false,
            margin: this._margin,
            padding: this._padding,
        };

        const updated = Array.isArray(customLayouts)
            ? _upsertArray(customLayouts, newDef)
            : { ...customLayouts, [id]: newDef };

        try {
            this._settings.set_string('custom-layouts', JSON.stringify(updated));
        } catch (error) {
            this._setStatus(`Failed to save: ${error.message || error}`, true);
            return;
        }

        this.close();
    }
});

// ---------- helpers ----------

function _titleFor(mode, sourceDef) {
    if (mode === 'create') return 'New Layout';
    if (mode === 'clone') return `Duplicate Layout${sourceDef?.name ? ': ' + sourceDef.name : ''}`;
    return `Edit Layout${sourceDef?.name ? ': ' + sourceDef.name : ''}`;
}

function _muted(text) {
    const l = new Gtk.Label({ label: text, xalign: 0 });
    l.add_css_class('dim-label');
    return l;
}

function _separator() {
    return new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL });
}

function _spin(min, max, step, value, onChange) {
    const adj = new Gtk.Adjustment({
        lower: min, upper: max, step_increment: step, page_increment: step * 5, value,
    });
    const sp = new Gtk.SpinButton({ adjustment: adj, numeric: true, climb_rate: 1, digits: 0 });
    sp.connect('value-changed', () => onChange(sp.get_value_as_int()));
    return sp;
}

function _labeledSpin(label, spin) {
    const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
    const l = new Gtk.Label({ label, xalign: 0, hexpand: true });
    row.append(l);
    row.append(spin);
    return row;
}

function _drawText(cr, text, x, y, sizePx, center = false) {
    const layout = PangoCairo.create_layout(cr);
    const desc = Pango.FontDescription.from_string(`Sans Bold ${sizePx}px`);
    layout.set_font_description(desc);
    layout.set_text(text, -1);
    const [w, h] = layout.get_pixel_size();
    cr.moveTo(center ? x - w / 2 : x, center ? y - h / 2 : y);
    PangoCairo.show_layout(cr, layout);
}

function _readCustomLayouts(settings) {
    try {
        const raw = settings.get_string('custom-layouts');
        if (!raw || raw === '{}' || raw === '[]') return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function _upsertArray(arr, def) {
    const idx = arr.findIndex(l => l?.id === def.id);
    if (idx >= 0) {
        const next = arr.slice();
        next[idx] = def;
        return next;
    }
    return [...arr, def];
}

function _hydrateCustomLayouts(layoutManager, settings) {
    const raw = _readCustomLayouts(settings);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    for (const def of list) {
        if (def?.id && def?.layout) {
            try { layoutManager.registerLayout(def.id, def); } catch (_e) {}
        }
    }
}

function _isBuiltinId(layoutManager, id) {
    return layoutManager.getBuiltinLayouts().some(l => l.id === id);
}

function _nextAutoId(layoutManager) {
    const used = new Set([
        ...layoutManager.getCustomLayouts().map(l => l.id),
        ...layoutManager.getBuiltinLayouts().map(l => l.id),
    ]);
    for (let i = 1; i < 1000; i++) {
        const id = `custom-layout-${i}`;
        if (!used.has(id)) return { id, name: `Custom Layout ${i}` };
    }
    return { id: `custom-layout-${Date.now()}`, name: 'Custom Layout' };
}

function _slugifyUnique(layoutManager, name) {
    let base = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!base) base = 'custom-layout';
    const used = new Set([
        ...layoutManager.getCustomLayouts().map(l => l.id),
        ...layoutManager.getBuiltinLayouts().map(l => l.id),
    ]);
    if (!used.has(base)) return base;
    for (let i = 2; i < 1000; i++) {
        if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
}

/**
 * Walk the BSP tree, return a Map<node, {x,y,width,height}> covering both
 * leaves and branches so we can answer "what fraction of the canvas does
 * the parent split occupy?" without re-running the resolver.
 */
function _branchRectMap(root, rect) {
    const map = new Map();
    const walk = (node, r) => {
        map.set(node, r);
        if (node.zoneIndex !== undefined) return;
        const isVertical = node.direction === 'vertical';
        const span = isVertical ? r.width : r.height;
        const leftSpan = Math.max(0, Math.round(span * node.ratio));
        const leftRect = isVertical
            ? { x: r.x, y: r.y, width: leftSpan, height: r.height }
            : { x: r.x, y: r.y, width: r.width, height: leftSpan };
        const rightRect = isVertical
            ? { x: r.x + leftSpan, y: r.y, width: Math.max(0, r.width - leftSpan), height: r.height }
            : { x: r.x, y: r.y + leftSpan, width: r.width, height: Math.max(0, r.height - leftSpan) };
        walk(node.left, leftRect);
        walk(node.right, rightRect);
    };
    walk(root, rect);
    return map;
}

function _suggestCloneId(layoutManager, sourceId) {
    const used = new Set([
        ...layoutManager.getCustomLayouts().map(l => l.id),
        ...layoutManager.getBuiltinLayouts().map(l => l.id),
    ]);
    const base = `${sourceId}-copy`;
    if (!used.has(base)) return base;
    for (let i = 2; i < 1000; i++) {
        if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
}
