/**
 * ComponentManager - Component Lifecycle Management
 *
 * Manages component creation, tracking, and cleanup.
 * Ensures all components are properly destroyed in reverse order.
 *
 * @example
 * const manager = new ComponentManager();
 * const overlay = manager.register('overlay', () => new Overlay());
 * manager.destroy(); // Cleans up all components
 */
export class ComponentManager {
    constructor() {
        this._components = new Map();
        this._order = []; // Track registration order
        this._destroyed = false;
    }

    /**
     * Register and create a component
     *
     * @param {string} name - Component name
     * @param {Function} factory - Factory function () => component
     * @returns {*} Component instance
     * @throws {Error} If already destroyed or component with name exists
     */
    register(name, factory) {
        if (this._destroyed) {
            throw new Error('Cannot register component: ComponentManager destroyed');
        }

        if (this._components.has(name)) {
            throw new Error(`Component '${name}' already registered`);
        }

        if (typeof factory !== 'function') {
            throw new Error(`Factory for '${name}' must be a function`);
        }

        // Create component
        const component = factory();

        // Store component and track order
        this._components.set(name, component);
        this._order.push(name);

        return component;
    }

    /**
     * Get a registered component
     *
     * @param {string} name - Component name
     * @returns {*} Component instance or undefined
     */
    get(name) {
        return this._components.get(name);
    }

    /**
     * Check if component is registered
     *
     * @param {string} name - Component name
     * @returns {boolean}
     */
    has(name) {
        return this._components.has(name);
    }

    /**
     * Unregister and destroy a specific component
     *
     * @param {string} name - Component name
     * @returns {boolean} True if component was destroyed
     */
    unregister(name) {
        if (!this._components.has(name)) {
            return false;
        }

        const component = this._components.get(name);

        // Destroy component
        this._destroyComponent(name, component);

        // Remove from tracking
        this._components.delete(name);
        const index = this._order.indexOf(name);
        if (index !== -1) {
            this._order.splice(index, 1);
        }

        return true;
    }

    /**
     * Destroy all components in reverse registration order
     */
    destroy() {
        if (this._destroyed) {
            return;
        }

        this._destroyed = true;

        // Destroy in reverse order
        const componentsToDestroy = [...this._order].reverse();

        for (const name of componentsToDestroy) {
            const component = this._components.get(name);
            this._destroyComponent(name, component);
        }

        this._components.clear();
        this._order = [];
    }

    /**
     * Destroy a single component
     *
     * @private
     * @param {string} name - Component name
     * @param {*} component - Component instance
     */
    _destroyComponent(name, component) {
        if (!component) {
            return;
        }

        try {
            if (typeof component.destroy === 'function') {
                component.destroy();
            } else if (typeof component.disconnect === 'function') {
                component.disconnect();
            }
        } catch (error) {
            console.error(`Error destroying component '${name}':`, error);
        }
    }

    /**
     * Get all component names
     *
     * @returns {string[]}
     */
    getComponentNames() {
        return Array.from(this._components.keys());
    }

    /**
     * Get number of registered components
     *
     * @returns {number}
     */
    get size() {
        return this._components.size;
    }

    /**
     * Check if manager has been destroyed
     *
     * @returns {boolean}
     */
    get isDestroyed() {
        return this._destroyed;
    }
}
