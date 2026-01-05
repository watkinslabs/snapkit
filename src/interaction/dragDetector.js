/**
 * DragDetector - Detects window drag operations
 *
 * Uses Meta.Display signals to detect when user drags a window.
 * NO POLLING - all signal-driven via grab-op-begin and grab-op-end.
 *
 * Emits events:
 * - window-drag-start: User starts dragging a window
 * - window-drag-end: User releases the window
 * - window-drag-move: Window position changes during drag
 *
 * Integrates with DragState to track active drags.
 */

import { Logger } from '../core/logger.js';
import { State } from '../state/extensionState.js';

export class DragDetector {
    /**
     * @param {ExtensionState} extensionState
     * @param {DragState} dragState
     * @param {EventBus} eventBus
     */
    constructor(extensionState, dragState, eventBus) {
        if (!extensionState || !dragState || !eventBus) {
            throw new Error('All dependencies are required');
        }

        this._extensionState = extensionState;
        this._dragState = dragState;
        this._eventBus = eventBus;
        this._logger = new Logger('DragDetector');

        this._signalIds = [];
        this._enabled = false;

        // Drag tracking
        this._isDragging = false;
        this._draggedWindow = null;
        this._dragStartTime = 0;
    }

    /**
     * Initialize drag detector
     */
    initialize() {
        if (this._enabled) {
            this._logger.warn('Already initialized');
            return;
        }

        if (!global.display) {
            this._logger.error('global.display not available');
            return;
        }

        // Connect to grab-op-begin signal
        const grabBeginId = global.display.connect('grab-op-begin', (display, window, op) => {
            this._onGrabOpBegin(display, window, op);
        });
        this._signalIds.push({ object: global.display, id: grabBeginId });

        // Connect to grab-op-end signal
        const grabEndId = global.display.connect('grab-op-end', (display, window, op) => {
            this._onGrabOpEnd(display, window, op);
        });
        this._signalIds.push({ object: global.display, id: grabEndId });

        this._enabled = true;
        this._logger.info('DragDetector initialized');
    }

    /**
     * Handle grab operation begin
     * @private
     * @param {Meta.Display} display
     * @param {Meta.Window} window
     * @param {Meta.GrabOp} op
     */
    _onGrabOpBegin(display, window, op) {
        if (!this._enabled) {
            return;
        }

        try {
            // Check if this is a move operation
            if (!this._isMovingOp(op)) {
                return;
            }

            // Check if window is valid for snapping
            if (!this._isValidWindow(window)) {
                return;
            }

            // Start drag
            this._isDragging = true;
            this._draggedWindow = window;
            this._dragStartTime = Date.now();

            // Get window position
            const rect = window.get_frame_rect();
            const position = { x: rect.x, y: rect.y };

            // Update drag state
            this._dragState.startDrag(window, position);

            // Transition to DRAG_MODE
            if (this._extensionState.current === State.CLOSED) {
                this._extensionState.transitionTo(State.DRAG_MODE);
            }

            this._logger.debug('Drag started', {
                windowTitle: window.get_title(),
                position
            });

            // Emit event
            this._eventBus.emit('window-drag-start', {
                window,
                position,
                timestamp: this._dragStartTime
            });

            // Track window position changes
            this._connectWindowSignals(window);
        } catch (error) {
            this._logger.error('Error in grab-op-begin handler', { error });
        }
    }

    /**
     * Handle grab operation end
     * @private
     * @param {Meta.Display} display
     * @param {Meta.Window} window
     * @param {Meta.GrabOp} op
     */
    _onGrabOpEnd(display, window, op) {
        if (!this._enabled || !this._isDragging) {
            return;
        }

        try {
            // Check if this is the same window
            if (window !== this._draggedWindow) {
                return;
            }

            // Get final position
            const rect = window.get_frame_rect();
            const position = { x: rect.x, y: rect.y };

            const dragDuration = Date.now() - this._dragStartTime;

            this._logger.debug('Drag ended', {
                windowTitle: window.get_title(),
                position,
                duration: dragDuration
            });

            // Emit event BEFORE cleaning up
            this._eventBus.emit('window-drag-end', {
                window,
                position,
                duration: dragDuration
            });

            // Clean up
            this._disconnectWindowSignals(window);
            this._isDragging = false;
            this._draggedWindow = null;

            // End drag state
            this._dragState.endDrag();

            // Transition back to CLOSED (if still in DRAG_MODE)
            if (this._extensionState.current === State.DRAG_MODE) {
                this._extensionState.transitionTo(State.CLOSED);
            }
        } catch (error) {
            this._logger.error('Error in grab-op-end handler', { error });
        }
    }

    /**
     * Connect window signals for position tracking
     * @private
     * @param {Meta.Window} window
     */
    _connectWindowSignals(window) {
        if (!window) {
            return;
        }

        // Connect position-changed signal
        const posChangedId = window.connect('position-changed', () => {
            this._onWindowPositionChanged(window);
        });
        this._signalIds.push({ object: window, id: posChangedId });
    }

    /**
     * Disconnect window signals
     * @private
     * @param {Meta.Window} window
     */
    _disconnectWindowSignals(window) {
        if (!window) {
            return;
        }

        // Find and disconnect window signals
        this._signalIds = this._signalIds.filter(({ object, id }) => {
            if (object === window) {
                try {
                    object.disconnect(id);
                } catch (e) {
                    // Window may be destroyed
                }
                return false;
            }
            return true;
        });
    }

    /**
     * Handle window position change during drag
     * @private
     * @param {Meta.Window} window
     */
    _onWindowPositionChanged(window) {
        if (!this._isDragging || window !== this._draggedWindow) {
            return;
        }

        try {
            // Get current position
            const rect = window.get_frame_rect();
            const position = { x: rect.x, y: rect.y };

            // Update drag state
            this._dragState.updatePosition(position);

            // Emit event
            this._eventBus.emit('window-drag-move', {
                window,
                position
            });
        } catch (error) {
            this._logger.error('Error in position-changed handler', { error });
        }
    }

    /**
     * Check if grab operation is a move
     * @private
     * @param {Meta.GrabOp} op
     * @returns {boolean}
     */
    _isMovingOp(op) {
        // Meta.GrabOp values for move operations
        // MOVING = 1, KEYBOARD_MOVING = 9
        return op === Meta.GrabOp.MOVING || op === Meta.GrabOp.KEYBOARD_MOVING;
    }

    /**
     * Check if window is valid for snapping
     * @private
     * @param {Meta.Window} window
     * @returns {boolean}
     */
    _isValidWindow(window) {
        if (!window) {
            return false;
        }

        // Skip windows that shouldn't be snapped
        const windowType = window.get_window_type();
        if (windowType !== Meta.WindowType.NORMAL) {
            return false;
        }

        // Skip special windows
        if (window.is_skip_taskbar() || window.is_override_redirect()) {
            return false;
        }

        return true;
    }

    /**
     * Enable drag detector
     */
    enable() {
        if (this._enabled) {
            return;
        }

        this.initialize();
    }

    /**
     * Disable drag detector
     */
    disable() {
        if (!this._enabled) {
            return;
        }

        this._enabled = false;

        // Clean up active drag
        if (this._isDragging) {
            this._disconnectWindowSignals(this._draggedWindow);
            this._isDragging = false;
            this._draggedWindow = null;
            this._dragState.endDrag();
        }

        this._logger.info('DragDetector disabled');
    }

    /**
     * Destroy drag detector
     */
    destroy() {
        this.disable();

        // Disconnect all signals
        for (const { object, id } of this._signalIds) {
            try {
                object.disconnect(id);
            } catch (e) {
                // Object may be destroyed
            }
        }
        this._signalIds = [];

        this._logger.info('DragDetector destroyed');
    }

    /**
     * Check if currently dragging
     *
     * @returns {boolean}
     */
    get isDragging() {
        return this._isDragging;
    }

    /**
     * Get dragged window
     *
     * @returns {Meta.Window|null}
     */
    getDraggedWindow() {
        return this._draggedWindow;
    }

    /**
     * Get drag start time
     *
     * @returns {number} Timestamp or 0
     */
    getDragStartTime() {
        return this._dragStartTime;
    }

    /**
     * Check if enabled
     *
     * @returns {boolean}
     */
    get isEnabled() {
        return this._enabled;
    }
}
