import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * Initialize extension components in dependency-safe order.
 *
 * @param {Object} controller - ExtensionController instance
 */
export function initializeComponents(controller) {
    const cm = controller._componentManager;

    // Initialize monitors first
    cm.register('monitorManager', () => {
        const mm = controller._serviceContainer.get('monitorManager');
        mm.initialize(Main.layoutManager);
        return mm;
    });

    // Initialize window tracker (for cleanup on window close)
    cm.register('windowTracker', () => {
        const wt = controller._serviceContainer.get('windowTracker');
        wt.initialize();
        return wt;
    });

    cm.register('tileManager', () => {
        const tm = controller._serviceContainer.get('tileManager');
        tm.initialize();
        return tm;
    });

    // Initialize interaction system
    cm.register('interactionStateManager', () => {
        const ism = controller._serviceContainer.get('interactionStateManager');
        ism.initialize();
        return ism;
    });

    // Initialize divider sync manager
    cm.register('dividerSyncManager', () => {
        const dsm = controller._serviceContainer.get('dividerSyncManager');
        dsm.initialize();
        return dsm;
    });

    // Initialize overlays
    cm.register('snapPreviewOverlay', () => {
        const spo = controller._serviceContainer.get('snapPreviewOverlay');
        spo.initialize(Main.uiGroup);
        return spo;
    });

    cm.register('layoutPickerBar', () => {
        const lpb = controller._serviceContainer.get('layoutPickerBar');
        lpb.initialize(Main.uiGroup);
        return lpb;
    });

    controller._logger.debug('Components initialized');
}
