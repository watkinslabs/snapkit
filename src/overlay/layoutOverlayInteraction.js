/**
 * LayoutOverlayInteraction - Handles user interaction with zones
 *
 * Handles:
 * - Zone hover (highlight on mouse over)
 * - Zone click (select zone)
 * - Keyboard navigation (arrows, enter, esc)
 * - Emit interaction events
 *
 * Does NOT handle rendering - that's LayoutOverlayRenderer's job
 */

import { Logger } from '../core/logger.js';

export class LayoutOverlayInteraction {
    /**
     * @param {EventBus} eventBus - Event bus for emitting events
     */
    constructor(eventBus) {
        if (!eventBus) {
            throw new Error('eventBus is required');
        }

        this._eventBus = eventBus;
        this._logger = new Logger('LayoutOverlayInteraction');
        this._hoveredZone = null;
        this._zoneActors = [];
        this._signalIds = [];
    }

    /**
     * Setup interaction for zone actors
     *
     * @param {Array<{actor: St.Widget, zone: Object}>} zoneActors - Zone actors from renderer
     */
    setupZoneInteraction(zoneActors) {
        // Clear previous
        this.clear();

        this._zoneActors = zoneActors;

        // Connect hover and click events
        for (const zoneData of zoneActors) {
            this._connectZoneEvents(zoneData);
        }

        this._logger.debug('Zone interaction setup', { count: zoneActors.length });
    }

    /**
     * Connect events for a zone actor
     * @private
     * @param {Object} zoneData - {actor, zone}
     */
    _connectZoneEvents(zoneData) {
        const { actor, zone } = zoneData;

        // Hover enter
        const enterSignalId = actor.connect('enter-event', () => {
            this._onZoneEnter(zone.zoneIndex);
            return Clutter.EVENT_PROPAGATE;
        });
        this._signalIds.push({ actor, id: enterSignalId });

        // Hover leave
        const leaveSignalId = actor.connect('leave-event', () => {
            this._onZoneLeave(zone.zoneIndex);
            return Clutter.EVENT_PROPAGATE;
        });
        this._signalIds.push({ actor, id: leaveSignalId });

        // Click
        const clickSignalId = actor.connect('button-press-event', () => {
            this._onZoneClick(zone.zoneIndex);
            return Clutter.EVENT_STOP;
        });
        this._signalIds.push({ actor, id: clickSignalId });
    }

    /**
     * Handle zone enter (hover start)
     * @private
     * @param {number} zoneIndex
     */
    _onZoneEnter(zoneIndex) {
        if (this._hoveredZone === zoneIndex) {
            return; // Already hovering
        }

        this._hoveredZone = zoneIndex;

        // Emit event
        this._eventBus.emit('zone-hover-enter', { zoneIndex });

        this._logger.debug('Zone hover enter', { zoneIndex });
    }

    /**
     * Handle zone leave (hover end)
     * @private
     * @param {number} zoneIndex
     */
    _onZoneLeave(zoneIndex) {
        if (this._hoveredZone !== zoneIndex) {
            return;
        }

        this._hoveredZone = null;

        // Emit event
        this._eventBus.emit('zone-hover-leave', { zoneIndex });

        this._logger.debug('Zone hover leave', { zoneIndex });
    }

    /**
     * Handle zone click
     * @private
     * @param {number} zoneIndex
     */
    _onZoneClick(zoneIndex) {
        // Emit event
        this._eventBus.emit('zone-selected', { zoneIndex });

        this._logger.info('Zone selected', { zoneIndex });
    }

    /**
     * Setup keyboard navigation
     *
     * @param {Clutter.Actor} stage - Stage to capture key events
     * @param {number} currentZoneIndex - Currently selected zone
     * @param {number} zoneCount - Total number of zones
     */
    setupKeyboardNavigation(stage, currentZoneIndex, zoneCount) {
        if (!stage) {
            return;
        }

        // Capture key events
        const keySignalId = stage.connect('key-press-event', (actor, event) => {
            return this._onKeyPress(event, currentZoneIndex, zoneCount);
        });

        this._signalIds.push({ actor: stage, id: keySignalId });
        this._logger.debug('Keyboard navigation setup');
    }

    /**
     * Handle key press
     * @private
     * @param {Clutter.Event} event
     * @param {number} currentZoneIndex
     * @param {number} zoneCount
     * @returns {boolean} Clutter.EVENT_STOP or EVENT_PROPAGATE
     */
    _onKeyPress(event, currentZoneIndex, zoneCount) {
        const symbol = event.get_key_symbol();

        switch (symbol) {
            case Clutter.KEY_Right:
            case Clutter.KEY_Down:
                // Next zone
                this._navigateZone('next', currentZoneIndex, zoneCount);
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Left:
            case Clutter.KEY_Up:
                // Previous zone
                this._navigateZone('previous', currentZoneIndex, zoneCount);
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                // Select current zone
                this._eventBus.emit('zone-selected', { zoneIndex: currentZoneIndex });
                return Clutter.EVENT_STOP;

            case Clutter.KEY_Escape:
                // Cancel
                this._eventBus.emit('overlay-cancel', {});
                return Clutter.EVENT_STOP;

            default:
                return Clutter.EVENT_PROPAGATE;
        }
    }

    /**
     * Navigate to next/previous zone
     * @private
     * @param {string} direction - 'next' or 'previous'
     * @param {number} currentZoneIndex
     * @param {number} zoneCount
     */
    _navigateZone(direction, currentZoneIndex, zoneCount) {
        let newZoneIndex;

        if (direction === 'next') {
            newZoneIndex = (currentZoneIndex + 1) % zoneCount;
        } else {
            newZoneIndex = (currentZoneIndex - 1 + zoneCount) % zoneCount;
        }

        this._eventBus.emit('zone-navigate', {
            oldZoneIndex: currentZoneIndex,
            newZoneIndex
        });

        this._logger.debug('Zone navigation', { direction, newZoneIndex });
    }

    /**
     * Get currently hovered zone
     * @returns {number|null}
     */
    getHoveredZone() {
        return this._hoveredZone;
    }

    /**
     * Programmatically trigger zone hover
     * @param {number} zoneIndex
     */
    setHoveredZone(zoneIndex) {
        if (this._hoveredZone === zoneIndex) {
            return;
        }

        // Clear previous hover
        if (this._hoveredZone !== null) {
            this._eventBus.emit('zone-hover-leave', { zoneIndex: this._hoveredZone });
        }

        // Set new hover
        this._hoveredZone = zoneIndex;
        if (zoneIndex !== null) {
            this._eventBus.emit('zone-hover-enter', { zoneIndex });
        }
    }

    /**
     * Clear hover state
     */
    clearHover() {
        if (this._hoveredZone !== null) {
            this._eventBus.emit('zone-hover-leave', { zoneIndex: this._hoveredZone });
            this._hoveredZone = null;
        }
    }

    /**
     * Clear all interaction handlers
     */
    clear() {
        // Disconnect all signals
        for (const { actor, id } of this._signalIds) {
            try {
                actor.disconnect(id);
            } catch (e) {
                // Actor may be destroyed
            }
        }

        this._signalIds = [];
        this._zoneActors = [];
        this._hoveredZone = null;

        this._logger.debug('Interaction cleared');
    }
}
