/**
 * Wire extension event bus handlers.
 *
 * @param {Object} controller - ExtensionController instance
 */
export function wireEventHandlers(controller) {
    // Request events from interaction layer
    controller._eventSubscriptions.push(
        controller._eventBus.on('request-open-overlay', data => {
            controller._handleOpenOverlay(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('request-close-overlay', () => {
            controller._handleCloseOverlay();
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('request-snap-preview', data => {
            controller._handleSnapPreview(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('update-snap-preview', data => {
            controller._handleUpdateSnapPreview(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('request-snap-to-zone', data => {
            controller._handleSnapToZone(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('request-cancel', () => {
            controller._handleCancel();
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('request-zone-navigation', data => {
            controller._handleZoneNavigation(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('request-zone-select', () => {
            controller._handleZoneSelect();
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('request-direct-zone-select', data => {
            controller._handleDirectZoneSelect(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('cancel-snap-preview', data => {
            controller._handleCancelSnapPreview(data);
        })
    );

    // Zone selection from overlay
    controller._eventSubscriptions.push(
        controller._eventBus.on('zone-selected', data => {
            controller._handleZoneSelected(data);
        })
    );

    // Window selection
    controller._eventSubscriptions.push(
        controller._eventBus.on('window-selected', data => {
            controller._handleWindowSelected(data);
        })
    );

    // Layout switching
    controller._eventSubscriptions.push(
        controller._eventBus.on('layout-switched', data => {
            controller._handleLayoutSwitched(data);
        })
    );

    // Settings changes
    controller._eventSubscriptions.push(
        controller._eventBus.on('appearance-settings-changed', data => {
            controller._handleAppearanceSettings(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('behavior-settings-changed', data => {
            controller._handleBehaviorSettings(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('layout-settings-changed', data => {
            controller._handleLayoutSettings(data);
        })
    );

    // Layout picker bar events
    controller._eventSubscriptions.push(
        controller._eventBus.on('layout-picker-hidden', () => {
            controller._handleLayoutPickerHidden();
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('zone-snapped', data => {
            controller._handleZoneSnapped(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('request-zone-snap', data => {
            controller._handleRequestZoneSnap(data);
        })
    );

    // Global keybinding events
    controller._eventSubscriptions.push(
        controller._eventBus.on('keyboard-snap-window', data => {
            controller._handleKeyboardSnapWindow(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('keyboard-cycle-layout', () => {
            controller._handleKeyboardCycleLayout();
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('keyboard-move-window-zone', data => {
            controller._handleKeyboardMoveWindowZone(data);
        })
    );

    // Custom layout management events
    controller._eventSubscriptions.push(
        controller._eventBus.on('layout-created', data => {
            controller._handleLayoutCreated(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('layout-updated', data => {
            controller._handleLayoutUpdated(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('layout-deleted', data => {
            controller._handleLayoutDeleted(data);
        })
    );

    // Divider override events (save when changed)
    controller._eventSubscriptions.push(
        controller._eventBus.on('divider-moved', data => {
            controller._handleDividerMoved(data);
        })
    );

    // Import/export events
    controller._eventSubscriptions.push(
        controller._eventBus.on('layouts-export-requested', () => {
            controller._handleExportLayouts();
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('layouts-import-requested', () => {
            controller._handleImportLayouts();
        })
    );

    // Layout editor events
    controller._eventSubscriptions.push(
        controller._eventBus.on('layout-editor-create', data => {
            controller._handleLayoutEditorCreate(data);
        })
    );

    controller._eventSubscriptions.push(
        controller._eventBus.on('layout-editor-update', data => {
            controller._handleLayoutEditorUpdate(data);
        })
    );

    controller._logger.debug('Event handlers wired');
}
