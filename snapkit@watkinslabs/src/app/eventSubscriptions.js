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
        controller._eventBus.on('cancel-snap-preview', data => {
            controller._handleCancelSnapPreview(data);
        })
    );

    // Layout switching
    controller._eventSubscriptions.push(
        controller._eventBus.on('layout-switched', data => {
            controller._handleLayoutSwitched(data);
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

    // Divider override events (save when changed)
    controller._eventSubscriptions.push(
        controller._eventBus.on('divider-moved', data => {
            controller._handleDividerMoved(data);
        })
    );

    controller._logger.debug('Event handlers wired');
}
