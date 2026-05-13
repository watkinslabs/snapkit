/**
 * SafeSettings - Crash-proof wrapper around Gio.Settings.
 *
 * Every accessor checks the schema for the key before touching GIO. A missing
 * key (or any GIO failure) is logged once and a typed default is returned, so
 * a stale or out-of-sync schema can never escalate into a fatal `g_warning`
 * inside gnome-shell.
 *
 * The wrapper exposes the same surface used by the rest of the extension
 * (get_string, set_string, connect, disconnect, bind, list_keys, ...) plus a
 * `gsettings` getter for the few call sites such as Main.wm.addKeybinding
 * that need the raw Gio.Settings instance.
 */

import { Logger } from '../core/logger.js';

const STRING_TYPES = new Set(['s']);
const INT_TYPES = new Set(['i', 'u', 'n', 'q', 'x', 't']);
const DOUBLE_TYPES = new Set(['d']);
const BOOLEAN_TYPES = new Set(['b']);
const STRV_TYPES = new Set(['as']);

export class SafeSettings {
    /**
     * @param {Gio.Settings} settings
     * @param {Logger} [logger]
     */
    constructor(settings, logger) {
        if (!settings) {
            throw new Error('SafeSettings requires a Gio.Settings instance');
        }
        this._settings = settings;
        this._schema = settings.settings_schema;
        this._logger = logger || new Logger('SafeSettings');
        this._missingKeys = new Set();
        this._typeMismatchKeys = new Set();
    }

    /** Raw Gio.Settings instance for APIs that require it (e.g. Main.wm.addKeybinding). */
    get gsettings() {
        return this._settings;
    }

    /** Schema object (kept for parity with Gio.Settings.settings_schema). */
    get settings_schema() {
        return this._schema;
    }

    /**
     * Check whether the loaded schema exposes a key. Never throws.
     * @param {string} key
     * @returns {boolean}
     */
    hasKey(key) {
        if (!key) {
            return false;
        }
        try {
            return this._schema ? this._schema.has_key(key) : false;
        } catch (_error) {
            return false;
        }
    }

    list_keys() {
        try {
            return this._settings.list_keys();
        } catch (_error) {
            return [];
        }
    }

    // ---------- Getters ----------

    get_string(key) {
        return this._safeGet(key, STRING_TYPES, 'get_string', '');
    }

    get_int(key) {
        return this._safeGet(key, INT_TYPES, 'get_int', 0);
    }

    get_uint(key) {
        return this._safeGet(key, INT_TYPES, 'get_uint', 0);
    }

    get_double(key) {
        return this._safeGet(key, DOUBLE_TYPES, 'get_double', 0.0);
    }

    get_boolean(key) {
        return this._safeGet(key, BOOLEAN_TYPES, 'get_boolean', false);
    }

    get_strv(key) {
        return this._safeGet(key, STRV_TYPES, 'get_strv', []);
    }

    get_value(key) {
        if (!this._checkKey(key, null)) {
            return null;
        }
        try {
            return this._settings.get_value(key);
        } catch (error) {
            this._logger.warn('get_value failed', { key, error: String(error) });
            return null;
        }
    }

    // ---------- Setters ----------

    set_string(key, value) {
        return this._safeSet(key, STRING_TYPES, 'set_string', value);
    }

    set_int(key, value) {
        return this._safeSet(key, INT_TYPES, 'set_int', value);
    }

    set_uint(key, value) {
        return this._safeSet(key, INT_TYPES, 'set_uint', value);
    }

    set_double(key, value) {
        return this._safeSet(key, DOUBLE_TYPES, 'set_double', value);
    }

    set_boolean(key, value) {
        return this._safeSet(key, BOOLEAN_TYPES, 'set_boolean', value);
    }

    set_strv(key, value) {
        return this._safeSet(key, STRV_TYPES, 'set_strv', value);
    }

    set_value(key, variant) {
        if (!this._checkKey(key, false)) {
            return false;
        }
        if (!variant || typeof variant.get_type_string !== 'function') {
            this._logger.warn('set_value rejected non-variant value', { key });
            return false;
        }
        try {
            const expected = this._schema.get_key(key).get_value_type().dup_string();
            const actual = variant.get_type_string();
            if (expected !== actual) {
                this._noteTypeMismatch(key, expected, actual);
                return false;
            }
            this._settings.set_value(key, variant);
            return true;
        } catch (error) {
            this._logger.warn('set_value failed', { key, error: String(error) });
            return false;
        }
    }

    // ---------- Signals & binding ----------

    /**
     * connect('changed::<key>', cb) is the only form used by the extension. We
     * parse the detail and skip silently if the key is gone, so reload races
     * never blow up.
     */
    connect(signal, callback) {
        if (typeof signal === 'string' && signal.startsWith('changed::')) {
            const key = signal.slice('changed::'.length);
            if (!this.hasKey(key)) {
                this._noteMissing(key, 'connect');
                return 0;
            }
        }
        try {
            return this._settings.connect(signal, callback);
        } catch (error) {
            this._logger.warn('connect failed', { signal, error: String(error) });
            return 0;
        }
    }

    disconnect(signalId) {
        if (!signalId) {
            return;
        }
        try {
            this._settings.disconnect(signalId);
        } catch (_error) {
            // Already disconnected or settings torn down — non-fatal.
        }
    }

    bind(key, target, property, flags) {
        if (!this._checkKey(key, false)) {
            return false;
        }
        try {
            this._settings.bind(key, target, property, flags);
            return true;
        } catch (error) {
            this._logger.warn('bind failed', { key, property, error: String(error) });
            return false;
        }
    }

    // ---------- Internals ----------

    _checkKey(key, _missingDefault) {
        if (!key) {
            return false;
        }
        if (this.hasKey(key)) {
            return true;
        }
        this._noteMissing(key, 'access');
        return false;
    }

    _safeGet(key, allowedTypes, method, fallback) {
        if (!this._checkKey(key, fallback)) {
            return fallback;
        }
        try {
            const expected = this._schema.get_key(key).get_value_type().dup_string();
            if (allowedTypes && !allowedTypes.has(expected)) {
                this._noteTypeMismatch(key, [...allowedTypes].join('|'), expected);
                return fallback;
            }
            return this._settings[method](key);
        } catch (error) {
            this._logger.warn(`${method} failed`, { key, error: String(error) });
            return fallback;
        }
    }

    _safeSet(key, allowedTypes, method, value) {
        if (!this._checkKey(key, false)) {
            return false;
        }
        try {
            const expected = this._schema.get_key(key).get_value_type().dup_string();
            if (allowedTypes && !allowedTypes.has(expected)) {
                this._noteTypeMismatch(key, [...allowedTypes].join('|'), expected);
                return false;
            }
            this._settings[method](key, value);
            return true;
        } catch (error) {
            this._logger.warn(`${method} failed`, { key, error: String(error) });
            return false;
        }
    }

    _noteMissing(key, context) {
        if (this._missingKeys.has(key)) {
            return;
        }
        this._missingKeys.add(key);
        this._logger.warn('Settings key missing from loaded schema', { key, context });
    }

    _noteTypeMismatch(key, expected, actual) {
        if (this._typeMismatchKeys.has(key)) {
            return;
        }
        this._typeMismatchKeys.add(key);
        this._logger.warn('Settings key type mismatch', { key, expected, actual });
    }
}
