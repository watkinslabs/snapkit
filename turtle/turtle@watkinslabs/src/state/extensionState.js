import { BaseState } from './baseState.js';

/**
 * Extension State Machine
 *
 * States (see docs/TERMINOLOGY.md):
 * - CLOSED: Overlay not visible, normal operation
 * - OPEN: Overlay showing, user selecting zone
 * - SELECT_WINDOW: Zone selected, choosing which window to snap
 * - DRAG_MODE: User dragging window, snap preview showing
 */
export const State = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    SELECT_WINDOW: 'SELECT_WINDOW',
    DRAG_MODE: 'DRAG_MODE'
};

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS = {
    [State.CLOSED]: [State.OPEN, State.DRAG_MODE],
    [State.OPEN]: [State.CLOSED, State.SELECT_WINDOW],
    [State.SELECT_WINDOW]: [State.OPEN, State.CLOSED],
    [State.DRAG_MODE]: [State.CLOSED]
};

export class ExtensionState extends BaseState {
    constructor() {
        super();
        this._state = State.CLOSED;
        this._previousState = null;
    }

    /**
     * Get current state
     *
     * @returns {string}
     */
    get current() {
        return this._state;
    }

    /**
     * Get previous state
     *
     * @returns {string|null}
     */
    get previous() {
        return this._previousState;
    }

    /**
     * Check if in specific state
     *
     * @param {string} state
     * @returns {boolean}
     */
    is(state) {
        return this._state === state;
    }

    /**
     * Check if in CLOSED state
     *
     * @returns {boolean}
     */
    get isClosed() {
        return this._state === State.CLOSED;
    }

    /**
     * Check if in OPEN state
     *
     * @returns {boolean}
     */
    get isOpen() {
        return this._state === State.OPEN;
    }

    /**
     * Check if in SELECT_WINDOW state
     *
     * @returns {boolean}
     */
    get isSelectingWindow() {
        return this._state === State.SELECT_WINDOW;
    }

    /**
     * Check if in DRAG_MODE state
     *
     * @returns {boolean}
     */
    get isDragMode() {
        return this._state === State.DRAG_MODE;
    }

    /**
     * Transition to new state
     *
     * @param {string} newState
     * @throws {Error} If transition is invalid
     */
    transitionTo(newState) {
        // Validate state exists
        if (!Object.values(State).includes(newState)) {
            throw new Error(`Invalid state: ${newState}`);
        }

        // Check if transition is valid
        const validNextStates = VALID_TRANSITIONS[this._state];
        if (!validNextStates.includes(newState)) {
            throw new Error(
                `Invalid transition: ${this._state} -> ${newState}. ` +
                `Valid transitions from ${this._state}: ${validNextStates.join(', ')}`
            );
        }

        // Transition
        const oldState = this._state;
        this._previousState = oldState;
        this._state = newState;

        // Notify subscribers
        this._notifySubscribers(oldState, newState);
    }

    /**
     * Reset to CLOSED state (emergency reset)
     */
    reset() {
        const oldState = this._state;
        this._previousState = oldState;
        this._state = State.CLOSED;
        this._notifySubscribers(oldState, State.CLOSED);
    }

    /**
     * Get valid next states from current state
     *
     * @returns {string[]}
     */
    getValidNextStates() {
        return [...VALID_TRANSITIONS[this._state]];
    }

    /**
     * Check if transition is valid
     *
     * @param {string} newState
     * @returns {boolean}
     */
    canTransitionTo(newState) {
        return VALID_TRANSITIONS[this._state]?.includes(newState) || false;
    }
}
