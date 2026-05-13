import Gio from 'gi://Gio';

import { SafeSettings } from './safeSettings.js';

// Extension settings schema IDs
const SCHEMA_ID = 'org.gnome.shell.extensions.snapkit';
const LEGACY_SCHEMA_ID = 'org.gnome.shell.extensions.turtle';
const MIGRATION_FLAG_KEY = 'migrated-from-turtle';

/**
 * Initialize extension settings and run one-time migration.
 *
 * @param {Object} controller - ExtensionController instance
 */
export function initializeSettings(controller) {
    try {
        const schemaDir = Gio.File.new_for_path(
            import.meta.url.replace('file://', '').replace('/src/app/settingsLifecycle.js', '/schemas')
        );

        let schemaSource;
        if (schemaDir.query_exists(null)) {
            schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                schemaDir.get_path(),
                Gio.SettingsSchemaSource.get_default(),
                false
            );
        } else {
            schemaSource = Gio.SettingsSchemaSource.get_default();
        }

        const schema = schemaSource.lookup(SCHEMA_ID, true);
        if (!schema) {
            throw new Error(`Schema ${SCHEMA_ID} not found`);
        }

        const rawSettings = new Gio.Settings({ settings_schema: schema });
        controller._settings = new SafeSettings(rawSettings, controller._logger);
        migrateLegacySettings(controller, schemaSource);
        controller._logger.debug('GSettings initialized');
    } catch (error) {
        controller._logger.error('Failed to initialize GSettings', { error });
        // Continue without settings - keybindings won't work but extension can still function
        controller._settings = null;
    }
}

/**
 * Check whether the loaded settings schema exposes a key.
 *
 * @param {Object} controller - ExtensionController instance
 * @param {string} key
 * @returns {boolean}
 */
export function hasSettingsKey(controller, key) {
    if (!controller._settings) {
        return false;
    }
    return controller._settings.hasKey(key);
}

/**
 * Migrate settings from legacy Turtle schema once.
 *
 * @param {Object} controller - ExtensionController instance
 * @param {Gio.SettingsSchemaSource} schemaSource
 */
function migrateLegacySettings(controller, schemaSource) {
    if (!controller._settings) {
        return;
    }

    if (!hasSettingsKey(controller, MIGRATION_FLAG_KEY)) {
        controller._logger.warn('Skipping legacy settings migration because migration key is missing');
        return;
    }

    if (controller._settings.get_boolean(MIGRATION_FLAG_KEY)) {
        return;
    }

    try {
        const legacySchema = schemaSource.lookup(LEGACY_SCHEMA_ID, true);
        if (!legacySchema) {
            controller._settings.set_boolean(MIGRATION_FLAG_KEY, true);
            return;
        }

        const legacySettings = new Gio.Settings({ settings_schema: legacySchema });
        const keys = controller._settings.list_keys();
        let migratedCount = 0;

        for (const key of keys) {
            if (key === MIGRATION_FLAG_KEY || !legacySchema.has_key(key)) {
                continue;
            }

            controller._settings.set_value(key, legacySettings.get_value(key));
            migratedCount++;
        }

        controller._settings.set_boolean(MIGRATION_FLAG_KEY, true);
        controller._logger.info('Migrated legacy Turtle settings', { migratedCount });
    } catch (error) {
        controller._logger.error('Failed to migrate legacy settings', { error });
    }
}
