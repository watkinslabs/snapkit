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

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';

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

        // Shake detection (to exit snap mode)
        this._shakeDetected = false;
        this._shakeConfig = {
            enabled: true,
            windowMs: 500,
            minDelta: 35,
            directionChanges: 4
        };
        this._shakeState = this._createEmptyShakeState();
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
            this._resetShakeDetection();

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

            // Get pointer position (where user released) for zone detection
            const [pointerX, pointerY] = global.get_pointer();
            const position = { x: pointerX, y: pointerY };

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
            this._resetShakeDetection();

            // Transition back to CLOSED (if still in DRAG_MODE)
            if (this._extensionState.current === State.DRAG_MODE) {
                this._extensionState.transitionTo(State.CLOSED);
            }
        } catch (error) {
            this._logger.error('Error in grab-op-end handler', { error });
        }
    }

    /**
     * Start tracking pointer position during drag
     * @private
     * @param {Meta.Window} window
     */
    _connectWindowSignals(window) {
        if (!window || this._pointerTrackerId) {
            return;
        }

        // Use pointer polling since position-changed doesn't exist on Meta.Window
        this._lastPointerPos = null;
        this._pointerTrackerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            if (!this._isDragging) {
                this._pointerTrackerId = null;
                return GLib.SOURCE_REMOVE;
            }

            try {
                const [x, y] = global.get_pointer();
                const pos = { x, y };

                // Only emit if position changed
                if (!this._lastPointerPos ||
                    this._lastPointerPos.x !== x ||
                    this._lastPointerPos.y !== y) {
                    this._lastPointerPos = pos;
                    this._onWindowPositionChanged(window, pos);
                }
            } catch (e) {
                // Ignore errors during tracking
            }

            return GLib.SOURCE_CONTINUE;
        });
    }

    /**
     * Stop tracking pointer position
     * @private
     * @param {Meta.Window} window
     */
    _disconnectWindowSignals(window) {
        if (this._pointerTrackerId) {
            GLib.source_remove(this._pointerTrackerId);
            this._pointerTrackerId = null;
        }
        this._lastPointerPos = null;
    }

    /**
     * Handle window position change during drag
     * @private
     * @param {Meta.Window} window
     * @param {Object} position - Pointer position {x, y}
     */
    _onWindowPositionChanged(window, position) {
        if (!this._isDragging || window !== this._draggedWindow) {
            return;
        }

        try {
            // Update drag state with pointer position
            this._dragState.updatePosition(position);

            // Detect shake gesture to cancel snap mode
            if (!this._shakeDetected && this._shakeConfig.enabled && this._detectShake(position.x)) {
                this._shakeDetected = true;
                this._logger.info('Shake gesture detected, cancelling snap mode', { position });
                this._eventBus.emit('window-drag-shake', {
                    window,
                    position,
                    timestamp: Date.now()
                });
            }

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
     * Create empty shake detection state
     * @private
     * @returns {Object}
     */
    _createEmptyShakeState() {
        return {
            startTime: 0,
            lastX: null,
            lastDirection: null,
            directionChanges: 0
        };
    }

    /**
     * Reset shake detection state
     * @private
     */
    _resetShakeDetection() {
        this._shakeDetected = false;
        this._shakeState = this._createEmptyShakeState();
    }

    /**
     * Detect rapid left-right shake movements within a time window
     * @private
     * @param {number} x
     * @returns {boolean}
     */
    _detectShake(x) {
        const now = Date.now();

        if (this._shakeState.startTime === 0) {
            this._shakeState.startTime = now;
            this._shakeState.lastX = x;
            return false;
        }

        // Reset window if too much time has elapsed
        if (now - this._shakeState.startTime > this._shakeConfig.windowMs) {
            this._shakeState = {
                startTime: now,
                lastX: x,
                lastDirection: null,
                directionChanges: 0
            };
            return false;
        }

        const dx = x - this._shakeState.lastX;
        if (Math.abs(dx) < this._shakeConfig.minDelta) {
            return false;
        }

        const direction = dx > 0 ? 1 : -1;
        if (this._shakeState.lastDirection !== null && direction !== this._shakeState.lastDirection) {
            this._shakeState.directionChanges += 1;
        }

        this._shakeState.lastDirection = direction;
        this._shakeState.lastX = x;

        return this._shakeState.directionChanges >= this._shakeConfig.directionChanges;
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
        this._resetShakeDetection();

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
     * Update configuration (currently shake detection)
     * @param {Object} config
     */
    updateConfig(config) {
        if (!config) return;

        if (config.shakeEnabled !== undefined) {
            this._shakeConfig.enabled = !!config.shakeEnabled;
        }
        if (config.shakeWindowMs !== undefined) {
            this._shakeConfig.windowMs = Math.max(50, config.shakeWindowMs);
        }
        if (config.shakeMinDelta !== undefined) {
            this._shakeConfig.minDelta = Math.max(5, config.shakeMinDelta);
        }
        if (config.shakeDirectionChanges !== undefined) {
            this._shakeConfig.directionChanges = Math.max(1, config.shakeDirectionChanges);
        }

        this._logger.debug('DragDetector config updated', { ...this._shakeConfig });
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
