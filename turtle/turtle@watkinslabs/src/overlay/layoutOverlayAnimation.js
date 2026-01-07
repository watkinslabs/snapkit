/**
 * LayoutOverlayAnimation - Handles overlay animations
 *
 * Provides smooth transitions:
 * - Fade in/out
 * - Zone scaling on hover
 * - Selection pulse
 * - Slide transitions
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { Logger } from '../core/logger.js';

export class LayoutOverlayAnimation {
    constructor() {
        this._logger = new Logger('LayoutOverlayAnimation');
        this._animatingActors = new Set();
    }

    /**
     * Fade in an actor
     *
     * @param {Clutter.Actor} actor
     * @param {number} duration - Duration in ms (default: 200)
     * @param {Function} onComplete - Callback when complete
     */
    fadeIn(actor, duration = 200, onComplete = null) {
        if (!actor) {
            return;
        }

        this._animatingActors.add(actor);
        actor.opacity = 0;

        actor.ease({
            opacity: 255,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._animatingActors.delete(actor);
                if (onComplete) {
                    onComplete();
                }
            }
        });
    }

    /**
     * Fade out an actor
     *
     * @param {Clutter.Actor} actor
     * @param {number} duration - Duration in ms (default: 200)
     * @param {Function} onComplete - Callback when complete
     */
    fadeOut(actor, duration = 200, onComplete = null) {
        if (!actor) {
            return;
        }

        this._animatingActors.add(actor);

        actor.ease({
            opacity: 0,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._animatingActors.delete(actor);
                if (onComplete) {
                    onComplete();
                }
            }
        });
    }

    /**
     * Scale up actor (hover effect)
     *
     * @param {Clutter.Actor} actor
     * @param {number} scale - Scale factor (default: 1.05)
     * @param {number} duration - Duration in ms (default: 150)
     */
    scaleUp(actor, scale = 1.05, duration = 150) {
        if (!actor) {
            return;
        }

        this._animatingActors.add(actor);

        actor.ease({
            scale_x: scale,
            scale_y: scale,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._animatingActors.delete(actor);
            }
        });
    }

    /**
     * Scale down actor (un-hover effect)
     *
     * @param {Clutter.Actor} actor
     * @param {number} duration - Duration in ms (default: 150)
     */
    scaleDown(actor, duration = 150) {
        if (!actor) {
            return;
        }

        this._animatingActors.add(actor);

        actor.ease({
            scale_x: 1.0,
            scale_y: 1.0,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._animatingActors.delete(actor);
            }
        });
    }

    /**
     * Pulse animation (selection feedback)
     *
     * @param {Clutter.Actor} actor
     * @param {number} pulses - Number of pulses (default: 2)
     * @param {number} duration - Duration per pulse in ms (default: 200)
     */
    pulse(actor, pulses = 2, duration = 200) {
        if (!actor) {
            return;
        }

        this._animatingActors.add(actor);

        let currentPulse = 0;

        const doPulse = () => {
            if (currentPulse >= pulses) {
                this._animatingActors.delete(actor);
                return;
            }

            currentPulse++;

            // Scale up
            actor.ease({
                scale_x: 1.1,
                scale_y: 1.1,
                duration: duration / 2,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    // Scale back down
                    actor.ease({
                        scale_x: 1.0,
                        scale_y: 1.0,
                        duration: duration / 2,
                        mode: Clutter.AnimationMode.EASE_IN_QUAD,
                        onComplete: doPulse
                    });
                }
            });
        };

        doPulse();
    }

    /**
     * Slide in from direction
     *
     * @param {Clutter.Actor} actor
     * @param {string} direction - 'left', 'right', 'top', 'bottom'
     * @param {number} distance - Slide distance in pixels (default: 50)
     * @param {number} duration - Duration in ms (default: 250)
     */
    slideIn(actor, direction, distance = 50, duration = 250) {
        if (!actor) {
            return;
        }

        this._animatingActors.add(actor);

        // Get original position
        const originalX = actor.x;
        const originalY = actor.y;

        // Set start position based on direction
        switch (direction) {
            case 'left':
                actor.x = originalX - distance;
                break;
            case 'right':
                actor.x = originalX + distance;
                break;
            case 'top':
                actor.y = originalY - distance;
                break;
            case 'bottom':
                actor.y = originalY + distance;
                break;
        }

        actor.opacity = 0;

        // Animate to original position
        actor.ease({
            x: originalX,
            y: originalY,
            opacity: 255,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onComplete: () => {
                this._animatingActors.delete(actor);
            }
        });
    }

    /**
     * Highlight flash (brief color change)
     *
     * @param {Clutter.Actor} actor
     * @param {string} color - Highlight color (default: 'white')
     * @param {number} duration - Duration in ms (default: 300)
     */
    flash(actor, color = 'white', duration = 300) {
        if (!actor || !actor.get_stage()) {
            return;
        }

        this._animatingActors.add(actor);

        // Get original background color
        const originalStyle = actor.get_style();

        // Set highlight color
        actor.set_style(`${originalStyle}; background-color: ${color};`);

        // Fade back to original after delay
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
            if (actor && actor.get_stage()) {
                actor.set_style(originalStyle);
                this._animatingActors.delete(actor);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Stagger animation for multiple actors
     * Animates each actor with a delay
     *
     * @param {Array<Clutter.Actor>} actors
     * @param {Function} animFunc - Animation function to apply to each actor
     * @param {number} staggerDelay - Delay between each actor in ms (default: 50)
     */
    stagger(actors, animFunc, staggerDelay = 50) {
        actors.forEach((actor, index) => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, index * staggerDelay, () => {
                animFunc(actor);
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    /**
     * Stop all animations on an actor
     *
     * @param {Clutter.Actor} actor
     */
    stopAnimations(actor) {
        if (!actor) {
            return;
        }

        actor.remove_all_transitions();
        this._animatingActors.delete(actor);
    }

    /**
     * Stop all animations on all actors
     */
    stopAll() {
        for (const actor of this._animatingActors) {
            try {
                actor.remove_all_transitions();
            } catch (e) {
                // Actor may be destroyed
            }
        }
        this._animatingActors.clear();
    }

    /**
     * Check if actor is animating
     *
     * @param {Clutter.Actor} actor
     * @returns {boolean}
     */
    isAnimating(actor) {
        return this._animatingActors.has(actor);
    }

    /**
     * Get number of active animations
     *
     * @returns {number}
     */
    get activeAnimationCount() {
        return this._animatingActors.size;
    }
}
