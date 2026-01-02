/**
 * Settings Manager - Utilities for working with GSettings
 */

/**
 * Parse RGBA color string to object
 */
export function parseColor(colorString) {
    // Parse rgba(r, g, b, a) format
    const match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);

    if (match) {
        return {
            red: parseInt(match[1]),
            green: parseInt(match[2]),
            blue: parseInt(match[3]),
            alpha: match[4] ? parseFloat(match[4]) : 1.0
        };
    }

    return null;
}

/**
 * Convert color object to RGBA string
 */
export function colorToString(color) {
    return `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha})`;
}

/**
 * Get color as Clutter.Color
 */
export function getClutterColor(colorString) {
    const color = parseColor(colorString);
    if (!color) {
        return null;
    }

    return new Clutter.Color({
        red: color.red,
        green: color.green,
        blue: color.blue,
        alpha: Math.round(color.alpha * 255)
    });
}

/**
 * Settings helper class
 */
export class SettingsManager {
    constructor(settings) {
        this._settings = settings;
        this._signalHandlers = new Map();
    }

    /**
     * Get a setting value with type checking
     */
    get(key, type = 'auto') {
        switch (type) {
            case 'string':
                return this._settings.get_string(key);
            case 'int':
                return this._settings.get_int(key);
            case 'double':
                return this._settings.get_double(key);
            case 'boolean':
                return this._settings.get_boolean(key);
            case 'strv':
                return this._settings.get_strv(key);
            case 'color':
                return parseColor(this._settings.get_string(key));
            default:
                // Auto-detect based on schema
                return this._settings.get_value(key).deep_unpack();
        }
    }

    /**
     * Set a setting value
     */
    set(key, value, type = 'auto') {
        switch (type) {
            case 'string':
                return this._settings.set_string(key, value);
            case 'int':
                return this._settings.set_int(key, value);
            case 'double':
                return this._settings.set_double(key, value);
            case 'boolean':
                return this._settings.set_boolean(key, value);
            case 'strv':
                return this._settings.set_strv(key, value);
            case 'color':
                return this._settings.set_string(key, colorToString(value));
            default:
                log(`SnapKit: Warning - no setter for type ${type}`);
                return false;
        }
    }

    /**
     * Connect to a setting change
     */
    connect(key, callback) {
        const handlerId = this._settings.connect(`changed::${key}`, () => {
            callback(key, this.get(key));
        });

        this._signalHandlers.set(key, handlerId);
        return handlerId;
    }

    /**
     * Disconnect a setting change handler
     */
    disconnect(key) {
        const handlerId = this._signalHandlers.get(key);
        if (handlerId) {
            this._settings.disconnect(handlerId);
            this._signalHandlers.delete(key);
        }
    }

    /**
     * Reset a setting to default
     */
    reset(key) {
        this._settings.reset(key);
    }

    /**
     * Reset all settings to default
     */
    resetAll() {
        const keys = this._settings.list_keys();
        for (let key of keys) {
            this.reset(key);
        }
    }

    destroy() {
        // Disconnect all signal handlers
        for (let [key, handlerId] of this._signalHandlers) {
            this._settings.disconnect(handlerId);
        }
        this._signalHandlers.clear();
        this._settings = null;
    }
}
