# SnapKit Source Code Architecture

**SnapKit is a BTree-styled window manager for GNOME Shell (45-48)**

## Core Concept

SnapKit uses **binary tree space partitioning** to divide screen space into zones. The application consists of four primary layers that build upon each other:

```
Layer 0: Infrastructure (core/)
    ↓
Layer 1: BTree System (btree/) ← THE CORE
    ↓
Layer 2: Window Tiling (tiling/)
    ↓
Layer 3: UI Overlay (overlay/)
    ↓
Layer 4: Interaction (interaction/)
```

## Directory Structure

### `core/` - Infrastructure (Layer 0)
Basic infrastructure services used throughout the application:
- **serviceContainer.js** - Dependency injection container
- **componentManager.js** - Component lifecycle management
- **eventBus.js** - Event pub/sub system
- **logger.js** - Structured logging

### `state/` - State Management
Centralized state management:
- **baseState.js** - Base class for all state objects
- **extensionState.js** - Main extension state machine (CLOSED/OPEN/SNAP_MODE)
- **snapState.js** - Snap mode workflow state
- **dragState.js** - Window drag tracking
- **layoutState.js** - Active layouts per monitor

### `btree/` - BTree Layout System (Layer 1) ⭐ THE CORE
The heart of SnapKit - binary tree space partitioning:

#### `btree/tree/`
- **layoutTree.js** - Binary tree data structure (horizontal/vertical splits)

#### `btree/validator/`
- **layoutValidator.js** - Validate BTree layout schema (simple & full-spec)

#### `btree/resolver/`
- **layoutResolver.js** - **THE CORE ALGORITHM**: Traverse BTree → output rectangles
  - Converts tree structure to screen coordinates
  - Applies divider overrides
  - Aggressive caching for performance

#### `btree/manager/`
- **layoutManager.js** - Manage built-in and custom layouts
- **overrideStore.js** - Persistent divider position overrides

### `tiling/` - Window Tiling Engine (Layer 2)
Applies BTree layouts to actual windows:
- **monitorManager.js** - Detect monitors, calculate work areas
- **windowTracker.js** - Track which windows are in which zones
- **snapHandler.js** - Snap windows to BTree zones
- **tileManager.js** - Manage tile groups, resize synchronization

### `overlay/` - UI Overlay Layer (Layer 3)
Visualizes the BTree structure on screen:
- **baseOverlay.js** - Base class for overlays
- **layoutOverlayRenderer.js** - Render BTree zones as visual rectangles
- **layoutOverlayInteraction.js** - Handle clicks, hovers, keyboard navigation
- **layoutOverlayAnimation.js** - Smooth transitions and animations
- **layoutOverlay.js** - Main overlay coordinator
- **snapPreviewOverlay.js** - Show preview during window drag
- **zonePositioningOverlay.js** - Highlight zones in snap mode

### `interaction/` - Input Layer (Layer 4)
Handles mouse and keyboard input (event-driven, NO POLLING):
- **eventCoordinator.js** - Coordinate all input events
- **mouseHandler.js** - Mouse motion, clicks, edge detection
- **dragDetector.js** - Window drag detection (uses grab-op signals)
- **keyboardHandler.js** - Keyboard shortcuts
- **interactionStateManager.js** - Track hover, active zone, drag state

### `ui/` - Additional UI Components
Supporting UI components:
- **windowSelector.js** - Window selector for snap mode
- **layoutEditor/** - Visual BTree layout editor
  - **layoutEditorState.js** - Editor state
  - **layoutEditorCanvas.js** - Visual canvas
  - **layoutEditorDialog.js** - Main dialog

### `preferences/` - Preferences UI
Settings interface:
- **preferencesBase.js** - Base class with common UI helpers
- **appearancePreferences.js** - Colors, styling, animations
- **behaviorPreferences.js** - Triggers, shortcuts, behavior
- **layoutPreferences.js** - Layout management UI

### `utils/` - Utilities
- **settings.js** - GSettings utilities

## Data Flow

### Layout Resolution Flow (Core Algorithm)
```
1. User triggers overlay
2. Get layout for current monitor (layoutManager)
3. Get monitor work area (monitorManager)
4. Resolve BTree → rectangles (layoutResolver) ← CORE ALGORITHM
   - Traverse tree structure
   - Apply divider overrides
   - Calculate zone coordinates
   - Cache result
5. Render zones (layoutOverlayRenderer)
6. User selects zone (layoutOverlayInteraction)
7. Snap window (snapHandler)
8. Track window (windowTracker, tileManager)
```

### Window Snap Flow
```
1. User drags window (dragDetector)
2. Show preview overlay (snapPreviewOverlay)
3. User drops on zone (mouseHandler)
4. Calculate window geometry from zone (snapHandler)
5. Move/resize window (snapHandler)
6. Track in tile group (tileManager)
7. Handle resize sync (tileManager)
```

### Snap Mode Flow
```
1. User triggers snap mode (keyboardHandler)
2. Show layout overlay (layoutOverlay)
3. Show zone positioning (zonePositioningOverlay)
4. User navigates zones (keyboardHandler: arrows)
5. User selects zone (keyboardHandler: enter)
6. Show window selector (windowSelector)
7. User selects window
8. Snap window to zone (snapHandler)
9. Continue or exit (keyboardHandler: esc)
```

## Key Principles

### 1. Small, Focused Files
- Most files <400 lines
- Many files <200 lines
- Single responsibility principle
- Easy to understand and test

### 2. Layered Architecture
- Each layer builds on the previous
- Clear dependencies (top layers depend on bottom layers)
- BTree system is independent and pure (no UI dependencies)

### 3. Event-Driven (NO POLLING)
- All input handling uses events
- Zero polling mechanisms (except justified timeouts)
- Minimal CPU usage when idle

### 4. Dependency Injection
- ServiceContainer manages all dependencies
- Easy to test with mocks
- Clear dependency graph

### 5. State Management
- Centralized state objects
- Observer pattern for state changes
- Clear state transitions
- State recovery on errors

### 6. The BTree is King
Everything revolves around the BTree layout system:
- Layouts are BTree definitions
- Resolution converts BTree → rectangles
- Windows map to BTree leaf nodes (zones)
- Overlays visualize the BTree structure
- Dividers are edges in the BTree

## Performance Considerations

### Caching Strategy
- **Layout Resolution**: Aggressive caching with cache key = (layout_id, monitor_id, overrides)
- **Invalidation**: Only when layout changes, monitor changes, or overrides change
- **Thumbnails**: Cache window thumbnails for window selector

### Event Handling
- **Debouncing**: Mouse motion events debounced for performance
- **Throttling**: Overlay updates throttled to prevent excessive redraws
- **Lazy Init**: Components created only when needed

### Memory Management
- **Cleanup**: ComponentManager ensures proper cleanup
- **Signal Disconnect**: All signal connections tracked and disconnected
- **Cache Limits**: Implement cache size limits if needed

## Testing Strategy

### Unit Tests
- Test each component in isolation
- Mock dependencies using ServiceContainer
- Test all state transitions
- Test BTree algorithms thoroughly

### Integration Tests
- Test layer interactions
- Test complete workflows
- Test error handling

### Performance Tests
- Benchmark layout resolution (<5ms target)
- Measure idle CPU usage (<0.5% target)
- Profile memory usage

## Development Guidelines

### Adding a New Feature
1. Determine which layer it belongs to
2. Create small, focused files
3. Use dependency injection
4. Write tests alongside code
5. Document public APIs
6. Update this README if architecture changes

### Modifying the BTree System
⚠️ **BE CAREFUL** - The BTree system is the core. Changes here affect everything:
1. Ensure backward compatibility with existing layouts
2. Update validation schema if needed
3. Test resolution algorithm extensively
4. Update caching if needed
5. Benchmark performance

### Adding UI Components
1. Extend from base classes (baseOverlay, etc.)
2. Separate rendering from interaction
3. Use animations for smooth UX
4. Handle cleanup properly
5. Test on multiple monitors

## Architecture Decisions

### Why BTree?
- Natural representation of split layouts
- Efficient space partitioning
- Easy to manipulate (split, merge)
- Maps naturally to rectangular screens
- Supports both simple and complex layouts

### Why Layered?
- Clear separation of concerns
- Testable in isolation
- Easy to understand
- Predictable dependencies
- Can optimize each layer independently

### Why No Polling?
- Reduces CPU usage dramatically
- Better battery life
- More responsive (no polling delay)
- Cleaner code architecture

### Why Dependency Injection?
- Testability
- Flexibility
- Clear dependencies
- Easy to mock for testing
- Easier to refactor

## Future Considerations

### Potential Enhancements
- TypeScript migration for type safety
- More sophisticated caching strategies
- Animation performance optimizations
- Additional layout algorithms (not BTree-based)
- Plugin system for custom layouts

### Known Limitations
- GNOME Shell extension API constraints
- Cannot use external frameworks (React, etc.)
- Must use GNOME/GTK/Clutter APIs
- Testing infrastructure limited for GNOME extensions

## Getting Started

See `../to-do/CLEAN_REWRITE_TASKS.md` for the implementation roadmap.

### Phase 1: Infrastructure ← **YOU ARE HERE**
- Core services (DI, events, logging)
- State management foundation

### Phase 2: BTree System
- Implement the core BTree algorithms
- Layout resolution and validation

### Phase 3-5: Tiling, Overlay, Interaction
- Build layers on top of BTree core

### Phase 6-9: UI, Preferences, Testing
- Complete the application

---

**Remember: Everything starts with the BTree. Get that right, and everything else follows naturally.**
