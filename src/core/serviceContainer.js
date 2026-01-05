/**
 * ServiceContainer - Dependency Injection Container
 *
 * Manages service registration and retrieval with support for:
 * - Singleton services (created once, reused)
 * - Transient services (created each time)
 * - Factory functions with access to container
 * - Lazy initialization
 *
 * @example
 * const container = new ServiceContainer();
 * container.register('logger', () => new Logger());
 * container.register('manager', (c) => new Manager(c.get('logger')));
 * const manager = container.get('manager');
 */
export class ServiceContainer {
    constructor() {
        this._factories = new Map();
        this._singletons = new Map();
        this._creating = new Set(); // Track circular dependencies
    }

    /**
     * Register a service with the container
     *
     * @param {string} name - Service name
     * @param {Function} factory - Factory function (container) => instance
     * @param {boolean} singleton - If true, create once and reuse (default: true)
     */
    register(name, factory, singleton = true) {
        if (typeof factory !== 'function') {
            throw new Error(`Factory for '${name}' must be a function`);
        }

        this._factories.set(name, { factory, singleton });
    }

    /**
     * Get a service from the container
     *
     * @param {string} name - Service name
     * @returns {*} Service instance
     * @throws {Error} If service not registered or circular dependency detected
     */
    get(name) {
        // Return singleton if already created
        if (this._singletons.has(name)) {
            return this._singletons.get(name);
        }

        // Check if registered
        if (!this._factories.has(name)) {
            throw new Error(`Service '${name}' not registered`);
        }

        // Detect circular dependencies
        if (this._creating.has(name)) {
            throw new Error(`Circular dependency detected: ${name}`);
        }

        const { factory, singleton } = this._factories.get(name);

        // Mark as being created
        this._creating.add(name);

        try {
            // Create instance
            const instance = factory(this);

            // Cache if singleton
            if (singleton) {
                this._singletons.set(name, instance);
            }

            return instance;
        } finally {
            // Unmark
            this._creating.delete(name);
        }
    }

    /**
     * Check if a service is registered
     *
     * @param {string} name - Service name
     * @returns {boolean}
     */
    has(name) {
        return this._factories.has(name);
    }

    /**
     * Register an existing instance as a singleton
     *
     * @param {string} name - Service name
     * @param {*} instance - Service instance
     */
    registerInstance(name, instance) {
        this._singletons.set(name, instance);
        this._factories.set(name, {
            factory: () => instance,
            singleton: true
        });
    }

    /**
     * Clear all services and singletons
     * Used for cleanup/testing
     */
    clear() {
        this._factories.clear();
        this._singletons.clear();
        this._creating.clear();
    }

    /**
     * Get all registered service names
     *
     * @returns {string[]}
     */
    getServiceNames() {
        return Array.from(this._factories.keys());
    }
}
