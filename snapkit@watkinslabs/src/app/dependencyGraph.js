import { ExtensionState } from '../state/extensionState.js';
import { DragState } from '../state/dragState.js';
import { InteractiveSelectState } from '../state/interactiveSelectState.js';
import { LayoutState } from '../state/layoutState.js';

import { LayoutValidator } from '../btree/validator/layoutValidator.js';
import { LayoutResolver } from '../btree/resolver/layoutResolver.js';
import { LayoutManager } from '../btree/manager/layoutManager.js';
import { OverrideStore } from '../btree/overrideStore.js';

import { MonitorManager } from '../tiling/monitorManager.js';
import { WindowTracker } from '../tiling/windowTracker.js';
import { SnapHandler } from '../tiling/snapHandler.js';
import { TileManager } from '../tiling/tileManager.js';
import { DividerSyncManager } from '../tiling/dividerSyncManager.js';

import { LayoutOverlay } from '../overlay/layoutOverlay.js';
import { SnapPreviewOverlay } from '../overlay/snapPreviewOverlay.js';
import { ZonePositioningOverlay } from '../overlay/zonePositioningOverlay.js';

import { EventCoordinator } from '../interaction/eventCoordinator.js';
import { MouseHandler } from '../interaction/mouseHandler.js';
import { DragDetector } from '../interaction/dragDetector.js';
import { KeyboardHandler } from '../interaction/keyboardHandler.js';
import { InteractionStateManager } from '../interaction/interactionStateManager.js';

import { WindowSelector } from '../ui/windowSelector.js';
import { LayoutEditor } from '../ui/layoutEditor.js';
import { LayoutSwitcher } from '../ui/layoutSwitcher.js';
import { LayoutPickerBar } from '../ui/layoutPickerBar.js';

import { AppearancePreferences } from '../preferences/appearancePreferences.js';
import { BehaviorPreferences } from '../preferences/behaviorPreferences.js';
import { LayoutPreferences } from '../preferences/layoutPreferences.js';

/**
 * Register all extension services in DI container.
 *
 * @param {Object} controller - ExtensionController instance
 */
export function registerServices(controller) {
    const sc = controller._serviceContainer;

    // Core services
    sc.register('eventBus', () => controller._eventBus, true);
    sc.register('componentManager', () => controller._componentManager, true);

    // State services
    sc.register('extensionState', () => new ExtensionState(sc.get('eventBus')), true);
    sc.register('dragState', () => new DragState(sc.get('eventBus')), true);
    sc.register('interactiveSelectState', () => new InteractiveSelectState(sc.get('eventBus')), true);
    sc.register('layoutState', () => new LayoutState(sc.get('eventBus')), true);

    // BTree services
    sc.register('layoutValidator', () => new LayoutValidator(), true);
    sc.register('layoutResolver', () => new LayoutResolver(sc.get('layoutValidator')), true);
    sc.register('layoutManager', () => new LayoutManager(sc.get('layoutValidator')), true);
    sc.register('overrideStore', () => new OverrideStore(), true);

    // Tiling services
    sc.register('monitorManager', () => new MonitorManager(sc.get('layoutManager'), sc.get('eventBus')), true);
    sc.register('windowTracker', () => new WindowTracker(sc.get('eventBus')), true);
    sc.register('snapHandler', () => new SnapHandler(
        sc.get('layoutResolver'),
        sc.get('windowTracker'),
        sc.get('monitorManager')
    ), true);
    sc.register('tileManager', () => new TileManager(
        sc.get('windowTracker'),
        sc.get('snapHandler'),
        sc.get('overrideStore'),
        sc.get('monitorManager'),
        sc.get('layoutManager')
    ), true);
    sc.register('dividerSyncManager', () => new DividerSyncManager(
        sc.get('windowTracker'),
        sc.get('overrideStore'),
        sc.get('layoutResolver'),
        sc.get('layoutManager'),
        sc.get('monitorManager'),
        sc.get('snapHandler'),
        sc.get('eventBus')
    ), true);

    // Overlay services
    sc.register('layoutOverlay', () => new LayoutOverlay(
        sc.get('eventBus'),
        sc.get('layoutResolver'),
        sc.get('monitorManager')
    ), true);
    sc.register('snapPreviewOverlay', () => new SnapPreviewOverlay(
        sc.get('layoutResolver'),
        sc.get('monitorManager')
    ), true);
    sc.register('zonePositioningOverlay', () => new ZonePositioningOverlay(
        sc.get('layoutResolver'),
        sc.get('monitorManager')
    ), true);

    // Interaction services
    sc.register('eventCoordinator', () => new EventCoordinator(
        sc.get('extensionState'),
        sc.get('eventBus')
    ), true);
    sc.register('mouseHandler', () => new MouseHandler(
        sc.get('eventCoordinator'),
        sc.get('extensionState'),
        sc.get('monitorManager'),
        sc.get('layoutManager'),
        sc.get('eventBus')
    ), true);
    sc.register('dragDetector', () => new DragDetector(
        sc.get('extensionState'),
        sc.get('dragState'),
        sc.get('eventBus')
    ), true);
    sc.register('keyboardHandler', () => new KeyboardHandler(
        sc.get('eventCoordinator'),
        sc.get('extensionState'),
        sc.get('eventBus')
    ), true);
    sc.register('interactionStateManager', () => new InteractionStateManager(
        sc.get('eventCoordinator'),
        sc.get('mouseHandler'),
        sc.get('dragDetector'),
        sc.get('keyboardHandler'),
        sc.get('extensionState'),
        sc.get('eventBus'),
        sc.get('monitorManager')
    ), true);

    // UI services
    sc.register('windowSelector', () => new WindowSelector(sc.get('eventBus')), true);
    sc.register('layoutEditor', () => new LayoutEditor(
        sc.get('layoutResolver'),
        sc.get('layoutManager'),
        sc.get('eventBus')
    ), true);
    sc.register('layoutSwitcher', () => new LayoutSwitcher(
        sc.get('layoutManager'),
        sc.get('layoutResolver'),
        sc.get('eventBus')
    ), true);
    sc.register('layoutPickerBar', () => new LayoutPickerBar(
        sc.get('layoutManager'),
        sc.get('layoutResolver'),
        sc.get('monitorManager'),
        sc.get('snapHandler'),
        sc.get('eventBus')
    ), true);

    // Preferences services
    sc.register('appearancePreferences', () => new AppearancePreferences(sc.get('eventBus')), true);
    sc.register('behaviorPreferences', () => new BehaviorPreferences(sc.get('eventBus')), true);
    sc.register('layoutPreferences', () => new LayoutPreferences(
        sc.get('layoutManager'),
        sc.get('monitorManager'),
        sc.get('eventBus')
    ), true);

    controller._logger.debug('Services registered');
}
