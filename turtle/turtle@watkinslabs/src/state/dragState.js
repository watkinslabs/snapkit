import { BaseState } from './baseState.js';

/**
 * DragState - Tracks window drag operations
 *
 * Used in DRAG_MODE to track:
 * - Which window is being dragged
 * - Drag start position
 * - Current drag status
 */
export class DragState extends BaseState {
    constructor() {
        super();
        this._isDragging = false;
        this._draggedWindow = null;
        this._dragStartTime = null;
        this._dragStartPosition = null;
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
    get draggedWindow() {
        return this._draggedWindow;
    }

    /**
     * Get drag start time
     *
     * @returns {number|null} Timestamp in ms
     */
    get dragStartTime() {
        return this._dragStartTime;
    }

    /**
     * Get drag duration
     *
     * @returns {number|null} Duration in ms, or null if not dragging
     */
    get dragDuration() {
        if (!this._isDragging || !this._dragStartTime) {
            return null;
        }
        return Date.now() - this._dragStartTime;
    }

    /**
     * Get drag start position
     *
     * @returns {{x: number, y: number}|null}
     */
    get dragStartPosition() {
        return this._dragStartPosition ? { ...this._dragStartPosition } : null;
    }

    /**
     * Start drag operation
     *
     * @param {Meta.Window} window - Window being dragged
     * @param {Object} position - {x, y} start position (optional)
     */
    startDrag(window, position = null) {
        if (this._isDragging) {
            console.warn('startDrag called while already dragging');
            return;
        }

        if (!window) {
            throw new Error('window is required');
        }

        const oldState = this._getStateSnapshot();

        this._isDragging = true;
        this._draggedWindow = window;
        this._dragStartTime = Date.now();
        this._dragStartPosition = position ? { x: position.x, y: position.y } : null;

        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);
    }

    /**
     * End drag operation
     */
    endDrag() {
        if (!this._isDragging) {
            return;
        }

        const oldState = this._getStateSnapshot();

        this._isDragging = false;
        this._draggedWindow = null;
        this._dragStartTime = null;
        this._dragStartPosition = null;

        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);
    }

    /**
     * Reset drag state (emergency cleanup)
     */
    reset() {
        const oldState = this._getStateSnapshot();

        this._isDragging = false;
        this._draggedWindow = null;
        this._dragStartTime = null;
        this._dragStartPosition = null;

        const newState = this._getStateSnapshot();
        this._notifySubscribers(oldState, newState);
    }

    /**
     * Get state snapshot for change notification
     *
     * @private
     * @returns {Object}
     */
    _getStateSnapshot() {
        return {
            isDragging: this._isDragging,
            draggedWindow: this._draggedWindow,
            dragStartTime: this._dragStartTime,
            dragStartPosition: this._dragStartPosition ? { ...this._dragStartPosition } : null
        };
    }
}
