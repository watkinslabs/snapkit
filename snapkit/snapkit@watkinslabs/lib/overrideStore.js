/**
 * Override Store - Persists divider position overrides
 *
 * Implements LAYOUT.md Section 8 - divider overrides persist user adjustments
 * per layout + monitor combination.
 *
 * Storage: ~/.config/snapkit/overrides.json
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * OverrideStore manages persistent divider position overrides
 */
export class OverrideStore {
    constructor() {
        this._overrides = [];
        this._dirty = false;
        this._saveTimeoutId = null;

        // Setup storage path
        this._configDir = GLib.build_filenamev([
            GLib.get_user_config_dir(),
            'snapkit'
        ]);
        this._filePath = GLib.build_filenamev([
            this._configDir,
            'overrides.json'
        ]);

        this._ensureConfigDir();
        this._load();
    }

    /**
     * Ensure the config directory exists
     */
    _ensureConfigDir() {
        try {
            const dir = Gio.File.new_for_path(this._configDir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
            }
        } catch (e) {
            log(`SnapKit OverrideStore: Failed to create config dir: ${e.message}`);
        }
    }

    /**
     * Load overrides from disk
     */
    _load() {
        try {
            const file = Gio.File.new_for_path(this._filePath);
            if (!file.query_exists(null)) {
                this._overrides = [];
                return;
            }

            const [success, contents] = file.load_contents(null);
            if (success) {
                const decoder = new TextDecoder('utf-8');
                const json = decoder.decode(contents);
                const data = JSON.parse(json);

                if (data.schema_version === 1 && Array.isArray(data.overrides)) {
                    this._overrides = data.overrides;
                } else {
                    log('SnapKit OverrideStore: Invalid override file format, starting fresh');
                    this._overrides = [];
                }
            }
        } catch (e) {
            log(`SnapKit OverrideStore: Failed to load overrides: ${e.message}`);
            this._overrides = [];
        }
    }

    /**
     * Save overrides to disk (debounced)
     */
    _scheduleSave() {
        this._dirty = true;

        // Debounce saves
        if (this._saveTimeoutId) {
            GLib.source_remove(this._saveTimeoutId);
        }

        this._saveTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._saveNow();
            this._saveTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Immediately save overrides to disk
     */
    _saveNow() {
        if (!this._dirty) return;

        try {
            const data = {
                schema_version: 1,
                overrides: this._overrides
            };

            const json = JSON.stringify(data, null, 2);
            const file = Gio.File.new_for_path(this._filePath);

            // Write atomically
            const encoder = new TextEncoder();
            const bytes = encoder.encode(json);
            file.replace_contents(
                bytes,
                null,  // etag
                false, // make_backup
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null   // cancellable
            );

            this._dirty = false;
        } catch (e) {
            log(`SnapKit OverrideStore: Failed to save overrides: ${e.message}`);
        }
    }

    /**
     * Generate a stable monitor key
     * @param {object} monitor - Monitor object from Main.layoutManager.monitors
     * @returns {string}
     */
    static getMonitorKey(monitor) {
        // Main.layoutManager.monitors[] contains simple objects with direct properties:
        // { x, y, width, height, index, ... }
        // They are NOT GObjects with getter methods
        try {
            if (!monitor) return 'default';

            // Use direct properties from the monitor object
            const x = monitor.x ?? 0;
            const y = monitor.y ?? 0;
            const width = monitor.width ?? 0;
            const height = monitor.height ?? 0;
            const index = monitor.index ?? 0;

            // Create a key based on geometry and index
            return `mon${index}:${width}x${height}@${x},${y}`;
        } catch (e) {
            return 'default';
        }
    }

    /**
     * Get overrides for a specific layout and monitor
     * @param {string} layoutName
     * @param {string} monitorKey
     * @returns {object[]}
     */
    getOverrides(layoutName, monitorKey) {
        return this._overrides.filter(
            o => o.layout_name === layoutName && o.monitor_key === monitorKey
        );
    }

    /**
     * Get all overrides for a layout (all monitors)
     * @param {string} layoutName
     * @returns {object[]}
     */
    getLayoutOverrides(layoutName) {
        return this._overrides.filter(o => o.layout_name === layoutName);
    }

    /**
     * Update or create a divider override
     * @param {string} layoutName
     * @param {string} monitorKey
     * @param {number[]} splitPath - Path to the split node
     * @param {{child_index: number, size: object}[]} childSizes
     */
    setOverride(layoutName, monitorKey, splitPath, childSizes) {
        // Find existing override for this split
        const existing = this._overrides.findIndex(o =>
            o.layout_name === layoutName &&
            o.monitor_key === monitorKey &&
            this._pathsEqual(o.split_path, splitPath)
        );

        const override = {
            layout_name: layoutName,
            monitor_key: monitorKey,
            workspace_key: 'any',  // Can be extended later for per-workspace overrides
            split_path: splitPath,
            child_sizes: childSizes
        };

        if (existing >= 0) {
            this._overrides[existing] = override;
        } else {
            this._overrides.push(override);
        }

        this._scheduleSave();
    }

    /**
     * Remove all overrides for a layout on a monitor
     * @param {string} layoutName
     * @param {string} monitorKey
     */
    clearOverrides(layoutName, monitorKey) {
        const before = this._overrides.length;
        this._overrides = this._overrides.filter(
            o => !(o.layout_name === layoutName && o.monitor_key === monitorKey)
        );

        if (this._overrides.length !== before) {
            this._scheduleSave();
        }
    }

    /**
     * Remove all overrides for a layout (all monitors)
     * @param {string} layoutName
     */
    clearLayoutOverrides(layoutName) {
        const before = this._overrides.length;
        this._overrides = this._overrides.filter(o => o.layout_name !== layoutName);

        if (this._overrides.length !== before) {
            this._scheduleSave();
        }
    }

    /**
     * Check if two paths are equal
     * @param {number[]} a
     * @param {number[]} b
     * @returns {boolean}
     */
    _pathsEqual(a, b) {
        if (!a && !b) return true;
        if (!a || !b) return false;
        if (a.length !== b.length) return false;
        return a.every((v, i) => v === b[i]);
    }

    /**
     * Flush pending saves and cleanup
     */
    destroy() {
        if (this._saveTimeoutId) {
            GLib.source_remove(this._saveTimeoutId);
            this._saveTimeoutId = null;
        }

        // Save immediately if dirty
        if (this._dirty) {
            this._saveNow();
        }
    }
}
