# SnapKit Clean Rewrite - Implementation Tasks

**Approach:** Clean rewrite in new source folder with correct architecture
**Based on:** REFACTORING_PLAN.md v1.0 design principles
**Started:** 2026-01-05
**Status:** Planning
**Target GNOME Versions:** 45-48

---

## Overview

**SnapKit is fundamentally a BTree-styled window manager with UI overlay and interaction.**

Core Architecture Layers:
1. **BTree Layout System** - Binary tree space partitioning (THE CORE)
2. **Window Tiling Engine** - Applies BTree layouts to windows
3. **UI Overlay Layer** - Visualizes the BTree structure
4. **Interaction Layer** - Mouse/keyboard input

Implementation Approach:
1. Create a new `src/` directory with clean architecture
2. Build from the core outward (BTree → Tiling → UI → Interaction)
3. Test each layer thoroughly
4. Switch to new implementation when feature-complete
5. Archive old code for reference

---

## Task Status Legend

- [ ] Not Started
- [→] In Progress
- [✓] Completed
- [!] Blocked
- [~] Deferred

---

## Phase 1: Architecture Foundation (Week 1)

**Goal:** Set up clean architecture with all infrastructure in place

### 1.1 Directory Structure
- [ ] Create new `src/` directory structure reflecting layered architecture:
  ```
  src/
  ├── core/           # Basic infrastructure (DI, events, logging)
  ├── btree/          # BTree layout system (THE CORE)
  │   ├── tree/       # Binary tree data structures
  │   ├── resolver/   # Layout resolution
  │   └── manager/    # Layout management
  ├── tiling/         # Window tiling engine (applies BTree to windows)
  ├── overlay/        # UI overlay layer (visualizes BTree)
  ├── interaction/    # Input layer (mouse/keyboard)
  ├── state/          # State management
  ├── preferences/    # Preferences UI
  └── utils/          # Utilities
  ```
- [ ] Create README.md in src/ explaining layered architecture
- [ ] Document the BTree → Tiling → Overlay → Interaction flow
- [ ] Set up .gitignore for new structure

**Estimated Time:** 30 minutes

### 1.2 Core Infrastructure
- [ ] Create `src/core/serviceContainer.js` - Dependency injection
- [ ] Create `src/core/componentManager.js` - Component lifecycle management
- [ ] Create `src/core/eventBus.js` - Event pub/sub system
- [ ] Create `src/core/logger.js` - Structured logging
- [ ] Write unit tests for core infrastructure
- [ ] Document usage patterns

**Files to Create:**
- `src/core/serviceContainer.js` (~150 lines)
- `src/core/componentManager.js` (~200 lines)
- `src/core/eventBus.js` (~200 lines)
- `src/core/logger.js` (~100 lines)
- `tests/core/*.test.js`

**Estimated Time:** 3-4 days

### 1.3 State Management Foundation
- [ ] Create `src/state/baseState.js` - Base class for all state
- [ ] Create `src/state/extensionState.js` - Main extension state machine
- [ ] Create `src/state/snapState.js` - Snap mode workflow state
- [ ] Create `src/state/dragState.js` - Drag tracking state
- [ ] Create `src/state/layoutState.js` - Layout state per monitor
- [ ] Implement observer pattern for state changes
- [ ] Write state transition tests
- [ ] Document state machines

**Files to Create:**
- `src/state/baseState.js` (~100 lines)
- `src/state/extensionState.js` (~200 lines)
- `src/state/snapState.js` (~250 lines)
- `src/state/dragState.js` (~150 lines)
- `src/state/layoutState.js` (~150 lines)
- `tests/state/*.test.js`

**Estimated Time:** 4-5 days

### 1.4 Phase 1 Validation
- [ ] All infrastructure components work independently
- [ ] Unit tests passing
- [ ] Documentation complete
- [ ] Code review completed

**Phase 1 Deliverables:**
- Complete core infrastructure
- Complete state management layer
- Full test coverage for infrastructure
- Architecture documentation

---

## Phase 2: BTree Layout System (Week 2-3)

**Goal:** Implement the BTree layout system - THE CORE of the application

### 2.1 BTree Data Structures
- [ ] Create `src/btree/tree/layoutTree.js` - Binary tree data structure
- [ ] Implement tree node representation (horizontal/vertical splits)
- [ ] Add tree traversal methods
- [ ] Add tree manipulation methods (insert, split, merge)
- [ ] Write tree structure tests

**Files to Create:**
- `src/btree/tree/layoutTree.js` (~200 lines)
- `tests/btree/tree/layoutTree.test.js`

**Dependencies:** Phase 1
**Estimated Time:** 2-3 days

### 2.2 Layout Validator
- [ ] Create `src/btree/validator/layoutValidator.js`
- [ ] Validate BTree layout schema (both simple and full-spec)
- [ ] Add comprehensive error messages
- [ ] Validate tree structure integrity
- [ ] Write validation tests

**Files to Create:**
- `src/btree/validator/layoutValidator.js` (~300 lines)
- `tests/btree/validator/layoutValidator.test.js`

**Dependencies:** 2.1
**Estimated Time:** 2 days

### 2.3 Layout Resolver (BTree → Rectangles)
- [ ] Create `src/btree/resolver/layoutResolver.js` - THE CORE ALGORITHM
- [ ] Implement BTree traversal to rectangle conversion
- [ ] Handle full-spec layouts (with tree structure)
- [ ] Handle simple layouts (grid shortcuts)
- [ ] Apply divider overrides during resolution
- [ ] Implement aggressive caching
- [ ] Write comprehensive resolution tests
- [ ] Benchmark performance (<5ms target)

**Files to Create:**
- `src/btree/resolver/layoutResolver.js` (~400 lines)
- `tests/btree/resolver/layoutResolver.test.js`

**Dependencies:** 2.1, 2.2
**Estimated Time:** 4-5 days

### 2.4 Layout Manager
- [ ] Create `src/btree/manager/layoutManager.js`
- [ ] Manage built-in layouts
- [ ] Manage custom layouts
- [ ] Integrate validator and resolver
- [ ] Add layout import/export
- [ ] Per-monitor layout selection
- [ ] Write integration tests

**Files to Create:**
- `src/btree/manager/layoutManager.js` (~400 lines)
- `tests/btree/manager/layoutManager.test.js`

**Dependencies:** 2.1, 2.2, 2.3
**Estimated Time:** 3-4 days

### 2.5 Override Store
- [ ] Create `src/btree/overrideStore.js`
- [ ] Store persistent divider position overrides
- [ ] Serialize/deserialize overrides
- [ ] Integrate with layout resolver
- [ ] Write tests

**Files to Create:**
- `src/btree/overrideStore.js` (~200 lines)
- `tests/btree/overrideStore.test.js`

**Dependencies:** 2.3
**Estimated Time:** 2 days

### 2.6 Phase 2 Validation
- [ ] All BTree tests passing
- [ ] Layout resolution <5ms (with caching)
- [ ] BTree structure validates correctly
- [ ] Simple and full-spec layouts both work
- [ ] Overrides apply correctly
- [ ] Zero code duplication in BTree logic

**Phase 2 Deliverables:**
- Complete BTree layout system (THE CORE)
- Fast, cached BTree → rectangle conversion
- Validation and error handling
- Full test coverage
- Performance benchmarks

---

## Phase 3: Window Tiling Engine (Week 4)

**Goal:** Apply BTree layouts to actual windows

### 3.1 Monitor Manager
- [ ] Create `src/tiling/monitorManager.js`
- [ ] Detect and track monitors
- [ ] Calculate work area per monitor
- [ ] Handle monitor geometry changes
- [ ] Write tests

**Files to Create:**
- `src/tiling/monitorManager.js` (~200 lines)
- `tests/tiling/monitorManager.test.js`

**Dependencies:** Phase 1
**Estimated Time:** 2 days

### 3.2 Window Tracker
- [ ] Create `src/tiling/windowTracker.js`
- [ ] Track positioned windows per zone
- [ ] Handle window lifecycle events
- [ ] Map windows to BTree zones
- [ ] Write tests

**Files to Create:**
- `src/tiling/windowTracker.js` (~200 lines)
- `tests/tiling/windowTracker.test.js`

**Dependencies:** Phase 2, 3.1
**Estimated Time:** 2 days

### 3.3 Snap Handler
- [ ] Create `src/tiling/snapHandler.js`
- [ ] Snap windows to BTree zones
- [ ] Calculate window geometry from zone rectangles
- [ ] Handle snap mode workflow
- [ ] Handle window constraints (min/max size)
- [ ] Write tests

**Files to Create:**
- `src/tiling/snapHandler.js` (~300 lines)
- `tests/tiling/snapHandler.test.js`

**Dependencies:** Phase 2, 3.1, 3.2
**Estimated Time:** 3-4 days

### 3.4 Tile Manager
- [ ] Create `src/tiling/tileManager.js`
- [ ] Manage tile groups (windows tiled together)
- [ ] Implement resize synchronization
- [ ] Handle divider dragging
- [ ] Update overrides when dividers move
- [ ] Write tests

**Files to Create:**
- `src/tiling/tileManager.js` (~500 lines)
- `tests/tiling/tileManager.test.js`

**Dependencies:** Phase 2, 3.2, 3.3
**Estimated Time:** 4-5 days

### 3.5 Phase 3 Validation
- [ ] Windows snap to BTree zones correctly
- [ ] Resize synchronization works
- [ ] Multi-monitor support works
- [ ] Divider overrides persist
- [ ] All tiling tests passing

**Phase 3 Deliverables:**
- Complete window tiling engine
- BTree layouts applied to real windows
- Resize synchronization
- Full test coverage

---

## Phase 4: UI Overlay Layer (Week 5-6)

**Goal:** Visualize the BTree structure on screen

### 4.1 Base Overlay Components
- [ ] Create `src/overlay/baseOverlay.js` - Base class for overlays
- [ ] Common lifecycle (show/hide/destroy)
- [ ] Common positioning and sizing
- [ ] Write tests

**Files to Create:**
- `src/overlay/baseOverlay.js` (~150 lines)
- `tests/overlay/baseOverlay.test.js`

**Dependencies:** Phase 1
**Estimated Time:** 1-2 days

### 4.2 Layout Overlay Renderer
- [ ] Create `src/overlay/layoutOverlayRenderer.js`
- [ ] Render BTree zones as visual rectangles
- [ ] Render zone labels and numbers
- [ ] Apply styling (colors, borders, opacity)
- [ ] Write tests

**Files to Create:**
- `src/overlay/layoutOverlayRenderer.js` (~300 lines)
- `tests/overlay/layoutOverlayRenderer.test.js`

**Dependencies:** Phase 2, 4.1
**Estimated Time:** 3 days

### 4.3 Layout Overlay Interaction
- [ ] Create `src/overlay/layoutOverlayInteraction.js`
- [ ] Handle zone hover highlighting
- [ ] Handle zone click selection
- [ ] Handle keyboard navigation
- [ ] Emit interaction events
- [ ] Write tests

**Files to Create:**
- `src/overlay/layoutOverlayInteraction.js` (~250 lines)
- `tests/overlay/layoutOverlayInteraction.test.js`

**Dependencies:** 4.2
**Estimated Time:** 2-3 days

### 4.4 Layout Overlay Animation
- [ ] Create `src/overlay/layoutOverlayAnimation.js`
- [ ] Smooth show/hide transitions
- [ ] Zone hover animations
- [ ] Selection animations
- [ ] Write tests

**Files to Create:**
- `src/overlay/layoutOverlayAnimation.js` (~200 lines)
- `tests/overlay/layoutOverlayAnimation.test.js`

**Dependencies:** 4.2
**Estimated Time:** 2 days

### 4.5 Main Layout Overlay
- [ ] Create `src/overlay/layoutOverlay.js`
- [ ] Coordinate renderer, interaction, and animation
- [ ] Integrate with BTree layout system
- [ ] Handle per-monitor overlays
- [ ] Write integration tests

**Files to Create:**
- `src/overlay/layoutOverlay.js` (~250 lines)
- `tests/overlay/layoutOverlay.test.js`

**Dependencies:** 4.2, 4.3, 4.4
**Estimated Time:** 2-3 days

### 4.6 Snap Preview Overlay
- [ ] Create `src/overlay/snapPreviewOverlay.js`
- [ ] Show preview during window drag
- [ ] Highlight target zone
- [ ] Show window preview in target zone
- [ ] Write tests

**Files to Create:**
- `src/overlay/snapPreviewOverlay.js` (~300 lines)
- `tests/overlay/snapPreviewOverlay.test.js`

**Dependencies:** Phase 2, 4.1
**Estimated Time:** 3 days

### 4.7 Zone Positioning Overlay
- [ ] Create `src/overlay/zonePositioningOverlay.js`
- [ ] Highlight specific zones
- [ ] Used for snap mode zone navigation
- [ ] Write tests

**Files to Create:**
- `src/overlay/zonePositioningOverlay.js` (~200 lines)
- `tests/overlay/zonePositioningOverlay.test.js`

**Dependencies:** Phase 2, 4.1
**Estimated Time:** 2 days

### 4.8 Phase 4 Validation
- [ ] BTree zones render correctly
- [ ] Overlays responsive to interaction
- [ ] Animations smooth
- [ ] Multi-monitor overlays work
- [ ] All overlay tests passing

**Phase 4 Deliverables:**
- Complete UI overlay system
- BTree structure visualized beautifully
- Smooth animations and interactions
- Full test coverage

---

## Phase 5: Interaction Layer (Week 7)

**Goal:** Handle mouse and keyboard input - the user interaction layer

### 5.1 Event Coordinator
- [ ] Create `src/interaction/eventCoordinator.js`
- [ ] Event-driven architecture (NO POLLING)
- [ ] Coordinate all input events
- [ ] Event delegation and routing
- [ ] Write tests

**Files to Create:**
- `src/interaction/eventCoordinator.js` (~200 lines)
- `tests/interaction/eventCoordinator.test.js`

**Dependencies:** Phase 1
**Estimated Time:** 2 days

### 5.2 Mouse Handler
- [ ] Create `src/interaction/mouseHandler.js`
- [ ] Handle mouse motion (trigger zones)
- [ ] Handle mouse clicks (zone selection)
- [ ] Efficient edge/corner detection
- [ ] Debouncing for performance
- [ ] NO POLLING - event-driven only
- [ ] Write tests

**Files to Create:**
- `src/interaction/mouseHandler.js` (~250 lines)
- `tests/interaction/mouseHandler.test.js`

**Dependencies:** 5.1
**Estimated Time:** 2-3 days

### 5.3 Drag Detector
- [ ] Create `src/interaction/dragDetector.js`
- [ ] Detect window drag start/end
- [ ] Use grab-op signals (NO POLLING)
- [ ] Track dragged window
- [ ] Integrate with DragState
- [ ] Write tests

**Files to Create:**
- `src/interaction/dragDetector.js` (~200 lines)
- `tests/interaction/dragDetector.test.js`

**Dependencies:** Phase 1 (DragState), 5.1
**Estimated Time:** 2-3 days

### 5.4 Keyboard Handler
- [ ] Create `src/interaction/keyboardHandler.js`
- [ ] Handle keyboard shortcuts
- [ ] Snap mode navigation (arrows, enter, esc)
- [ ] Overlay toggle shortcuts
- [ ] Write tests

**Files to Create:**
- `src/interaction/keyboardHandler.js` (~200 lines)
- `tests/interaction/keyboardHandler.test.js`

**Dependencies:** 5.1
**Estimated Time:** 2 days

### 5.5 Interaction State Manager
- [ ] Create `src/interaction/interactionStateManager.js`
- [ ] Track hover state
- [ ] Track active zone
- [ ] Track drag state
- [ ] Emit state change events
- [ ] Write tests

**Files to Create:**
- `src/interaction/interactionStateManager.js` (~150 lines)
- `tests/interaction/interactionStateManager.test.js`

**Dependencies:** Phase 1, 5.1
**Estimated Time:** 1-2 days

### 5.6 Phase 5 Validation
- [ ] Zero polling mechanisms (all event-driven)
- [ ] CPU usage minimal during idle
- [ ] Responsive to all input
- [ ] Keyboard shortcuts work
- [ ] Mouse interaction smooth
- [ ] All interaction tests passing

**Phase 5 Deliverables:**
- Complete interaction layer
- Event-driven input handling (no polling)
- Smooth, responsive user experience
- Full test coverage

---

## Phase 6: Additional UI Components (Week 8)

**Goal:** Window selector and layout editor

### 6.1 Window Selector
- [ ] Create `src/ui/windowSelector.js`
- [ ] List windows for snap mode
- [ ] Generate and cache thumbnails
- [ ] Handle window selection
- [ ] Write tests

**Files to Create:**
- `src/ui/windowSelector.js` (~400 lines)
- `tests/ui/windowSelector.test.js`

**Dependencies:** Phase 3 (WindowTracker)
**Estimated Time:** 3-4 days

### 6.2 Layout Editor
- [ ] Create `src/ui/layoutEditor/layoutEditorState.js`
- [ ] Create `src/ui/layoutEditor/layoutEditorCanvas.js`
- [ ] Create `src/ui/layoutEditor/layoutEditorDialog.js`
- [ ] Visual BTree editing
- [ ] Split/merge zones
- [ ] Write tests

**Files to Create:**
- `src/ui/layoutEditor/layoutEditorState.js` (~250 lines)
- `src/ui/layoutEditor/layoutEditorCanvas.js` (~300 lines)
- `src/ui/layoutEditor/layoutEditorDialog.js` (~400 lines)
- `tests/ui/layoutEditor/*.test.js`

**Dependencies:** Phase 2 (BTree system)
**Estimated Time:** 5-6 days

### 6.3 Phase 6 Validation
- [ ] Window selector works in snap mode
- [ ] Layout editor creates valid BTree layouts
- [ ] All UI tests passing

**Phase 6 Deliverables:**
- Window selector for snap mode
- Visual BTree layout editor
- Full test coverage

---

## Phase 7: Preferences UI (Week 9)

**Goal:** Clean, modular preferences interface

### 7.1 Preferences Base Infrastructure
- [ ] Create `src/preferences/preferencesBase.js`
- [ ] Implement common UI helpers
- [ ] Add settings binding utilities
- [ ] Write reusable preference components

**Files to Create:**
- `src/preferences/preferencesBase.js` (~200 lines)

**Dependencies:** Phase 1
**Estimated Time:** 2 days

### 6.2 Appearance Preferences
- [ ] Create `src/preferences/appearancePreferences.js`
- [ ] Implement all appearance settings
- [ ] Add color pickers
- [ ] Write tests

**Files to Create:**
- `src/preferences/appearancePreferences.js` (~350 lines)
- `tests/preferences/appearancePreferences.test.js`

**Dependencies:** 6.1
**Estimated Time:** 2-3 days

### 6.3 Behavior Preferences
- [ ] Create `src/preferences/behaviorPreferences.js`
- [ ] Implement all behavior settings
- [ ] Add keyboard shortcut configuration
- [ ] Write tests

**Files to Create:**
- `src/preferences/behaviorPreferences.js` (~300 lines)
- `tests/preferences/behaviorPreferences.test.js`

**Dependencies:** 6.1
**Estimated Time:** 2-3 days

### 6.4 Layout Preferences
- [ ] Create `src/preferences/layoutPreferences.js`
- [ ] Implement layout management UI
- [ ] Add import/export functionality
- [ ] Integrate with layout editor
- [ ] Write tests

**Files to Create:**
- `src/preferences/layoutPreferences.js` (~400 lines)
- `tests/preferences/layoutPreferences.test.js`

**Dependencies:** 6.1, Phase 2
**Estimated Time:** 3-4 days

### 6.5 Main Preferences Coordinator
- [ ] Create `src/prefs.js` (new clean version)
- [ ] Coordinate all preference pages
- [ ] Add navigation
- [ ] Write integration tests

**Files to Create:**
- `src/prefs.js` (~200 lines)
- `tests/preferences/integration.test.js`

**Dependencies:** 6.2, 6.3, 6.4
**Estimated Time:** 1-2 days

### 6.6 Phase 6 Validation
- [ ] All preferences accessible
- [ ] Settings save/load correctly
- [ ] UI is responsive
- [ ] All tests passing

**Phase 6 Deliverables:**
- Complete preferences UI
- All settings functional
- Clean, modular structure
- Full test coverage

---

## Phase 7: Main Extension Controller (Week 10)

**Goal:** Clean extension entry point that coordinates everything

### 7.1 Extension Controller
- [ ] Create `src/extension.js` (new clean version)
- [ ] Implement clean enable/disable lifecycle
- [ ] Use ServiceContainer for all dependencies
- [ ] Use ComponentManager for lifecycle
- [ ] Coordinate all services
- [ ] Keep under 400 lines

**Files to Create:**
- `src/extension.js` (~350 lines)
- `tests/extension.test.js`

**Dependencies:** All previous phases
**Estimated Time:** 3-4 days

### 7.2 Settings Integration
- [ ] Create `src/utils/settings.js`
- [ ] Port settings utilities
- [ ] Add settings migration if needed
- [ ] Write tests

**Files to Create:**
- `src/utils/settings.js` (~150 lines)
- `tests/utils/settings.test.js`

**Dependencies:** None
**Estimated Time:** 1-2 days

### 7.3 Overlay State Manager
- [ ] Create `src/services/overlayStateManager.js`
- [ ] Coordinate overlay show/hide
- [ ] Manage overlay lifecycle
- [ ] Handle state transitions
- [ ] Write tests

**Files to Create:**
- `src/services/overlayStateManager.js` (~250 lines)
- `tests/services/overlayStateManager.test.js`

**Dependencies:** Phase 1, 5
**Estimated Time:** 2-3 days

### 7.4 Phase 7 Validation
- [ ] Extension enables/disables cleanly
- [ ] All features accessible
- [ ] No memory leaks
- [ ] Clean separation of concerns
- [ ] All tests passing

**Phase 7 Deliverables:**
- Complete, clean extension.js
- Full integration of all components
- End-to-end functionality
- Full test coverage

---

## Phase 8: Migration and Testing (Week 11-12)

**Goal:** Ensure feature parity and quality

### 8.1 Feature Parity Checklist
- [ ] Overlay shows on configured triggers
- [ ] Layout selection works
- [ ] Window snapping works
- [ ] Snap mode works
- [ ] Multi-monitor support works
- [ ] Custom layouts work
- [ ] Layout editor works
- [ ] Divider overrides persist
- [ ] All preferences work
- [ ] Keyboard shortcuts work
- [ ] All edge cases handled

**Estimated Time:** 3-4 days of testing

### 8.2 Performance Validation
- [ ] Measure idle CPU usage (<0.5% target)
- [ ] Measure layout resolution time (<5ms target)
- [ ] Measure overlay open time (<100ms target)
- [ ] Measure memory usage
- [ ] Profile for bottlenecks
- [ ] Compare to old implementation

**Estimated Time:** 2 days

### 8.3 Integration Testing
- [ ] Test on different GNOME versions
- [ ] Test with different configurations
- [ ] Test multi-monitor scenarios
- [ ] Test with different window managers
- [ ] Test edge cases and error conditions
- [ ] User acceptance testing

**Estimated Time:** 3-4 days

### 8.4 Code Quality Checks
- [ ] Run linting on all new code
- [ ] Verify no code duplication (<5%)
- [ ] Verify all files <600 lines
- [ ] Check test coverage (>70% target)
- [ ] Code review all components
- [ ] Documentation review

**Estimated Time:** 2 days

### 8.5 Migration Preparation
- [ ] Create migration script/instructions
- [ ] Document breaking changes (if any)
- [ ] Prepare rollback plan
- [ ] Create backup of old implementation
- [ ] Plan switch-over process

**Estimated Time:** 1-2 days

### 8.6 Phase 8 Validation
- [ ] All features working
- [ ] Performance targets met
- [ ] Quality standards met
- [ ] Ready for production use

**Phase 8 Deliverables:**
- Feature-complete new implementation
- Full test suite passing
- Performance validated
- Migration plan ready

---

## Phase 9: Cutover and Documentation (Week 13)

**Goal:** Switch to new implementation and finalize documentation

### 9.1 Code Cutover
- [ ] Move old code to `legacy/` directory
- [ ] Move new code from `src/` to root
- [ ] Update `metadata.json` if needed
- [ ] Update any build scripts
- [ ] Test installation

**Estimated Time:** 1 day

### 9.2 Architecture Documentation
- [ ] Create `ARCHITECTURE.md` documenting new structure
- [ ] Document state machines
- [ ] Document event flow
- [ ] Create architecture diagrams
- [ ] Document design patterns used

**Files to Create:**
- `ARCHITECTURE.md`
- `docs/architecture/*.md`
- `docs/diagrams/*.png`

**Estimated Time:** 2-3 days

### 9.3 Developer Guide
- [ ] Create `CONTRIBUTING.md`
- [ ] Document development setup
- [ ] Document testing approach
- [ ] Create troubleshooting guide
- [ ] Document coding standards

**Files to Create:**
- `CONTRIBUTING.md`
- `docs/DEVELOPMENT.md`
- `docs/TESTING.md`
- `docs/TROUBLESHOOTING.md`

**Estimated Time:** 2 days

### 9.4 User Documentation
- [ ] Update README.md
- [ ] Create user guide
- [ ] Document new features (if any)
- [ ] Create FAQ
- [ ] Update screenshots

**Files to Update:**
- `README.md`
- User documentation

**Estimated Time:** 2 days

### 9.5 Release Preparation
- [ ] Update version number
- [ ] Create CHANGELOG.md entry
- [ ] Tag release
- [ ] Prepare release notes
- [ ] Test release package

**Estimated Time:** 1 day

### 9.6 Phase 9 Validation
- [ ] All documentation complete
- [ ] Code in production location
- [ ] Release ready

**Phase 9 Deliverables:**
- New implementation in production
- Complete documentation
- Release package ready

---

## Success Metrics

### Code Quality Targets
- [✓/✗] Total LOC: ~9,000-10,000 lines (cleaner than current 11,327)
- [✓/✗] Largest file: <400 lines (extension.js)
- [✓/✗] Average file size: ~200-300 lines
- [✓/✗] Code duplication: <5%
- [✓/✗] Test coverage: >70%
- [✓/✗] All files follow consistent patterns

### Performance Targets
- [✓/✗] Idle CPU usage: <0.5%
- [✓/✗] Layout resolution: <5ms
- [✓/✗] Overlay open time: <100ms
- [✓/✗] Memory usage: Lower than current
- [✓/✗] Zero polling mechanisms (except justified timeouts)

### Architecture Targets
- [✓/✗] Clean separation of concerns
- [✓/✗] Dependency injection used throughout
- [✓/✗] Event-driven architecture
- [✓/✗] State machines clearly defined
- [✓/✗] No god objects
- [✓/✗] Single responsibility principle followed

---

## Directory Structure (Final)

**Layered Architecture: Core → BTree → Tiling → Overlay → Interaction**

```
snapkit/
├── legacy/                    # Old implementation (archived)
│   └── *.js
├── src/                       # New clean implementation
│   ├── core/                  # Layer 0: Infrastructure
│   │   ├── serviceContainer.js
│   │   ├── componentManager.js
│   │   ├── eventBus.js
│   │   └── logger.js
│   │
│   ├── state/                 # State management
│   │   ├── baseState.js
│   │   ├── extensionState.js
│   │   ├── snapState.js
│   │   ├── dragState.js
│   │   └── layoutState.js
│   │
│   ├── btree/                 # Layer 1: BTree System (THE CORE)
│   │   ├── tree/
│   │   │   └── layoutTree.js          # Binary tree data structure
│   │   ├── validator/
│   │   │   └── layoutValidator.js     # Schema validation
│   │   ├── resolver/
│   │   │   └── layoutResolver.js      # BTree → Rectangles
│   │   ├── manager/
│   │   │   └── layoutManager.js       # Layout management
│   │   └── overrideStore.js           # Divider overrides
│   │
│   ├── tiling/                # Layer 2: Window Tiling Engine
│   │   ├── monitorManager.js          # Monitor detection
│   │   ├── windowTracker.js           # Window tracking
│   │   ├── snapHandler.js             # Snap windows to zones
│   │   └── tileManager.js             # Tile groups & resize sync
│   │
│   ├── overlay/               # Layer 3: UI Overlay (visualizes BTree)
│   │   ├── baseOverlay.js             # Base overlay class
│   │   ├── layoutOverlayRenderer.js   # Render BTree zones
│   │   ├── layoutOverlayInteraction.js # Click/hover handling
│   │   ├── layoutOverlayAnimation.js  # Animations
│   │   ├── layoutOverlay.js           # Main coordinator
│   │   ├── snapPreviewOverlay.js      # Drag preview
│   │   └── zonePositioningOverlay.js  # Zone highlighting
│   │
│   ├── interaction/           # Layer 4: Input (mouse/keyboard)
│   │   ├── eventCoordinator.js        # Event coordination
│   │   ├── mouseHandler.js            # Mouse input (NO POLLING)
│   │   ├── dragDetector.js            # Drag detection (NO POLLING)
│   │   ├── keyboardHandler.js         # Keyboard shortcuts
│   │   └── interactionStateManager.js # Interaction state
│   │
│   ├── ui/                    # Additional UI components
│   │   ├── windowSelector.js          # Window selector for snap mode
│   │   └── layoutEditor/
│   │       ├── layoutEditorState.js
│   │       ├── layoutEditorCanvas.js
│   │       └── layoutEditorDialog.js
│   │
│   ├── preferences/           # Preferences UI
│   │   ├── preferencesBase.js
│   │   ├── appearancePreferences.js
│   │   ├── behaviorPreferences.js
│   │   └── layoutPreferences.js
│   │
│   ├── utils/                 # Utilities
│   │   └── settings.js
│   │
│   ├── extension.js           # Main extension entry point
│   └── prefs.js              # Preferences entry point
├── tests/                     # Test suite
│   ├── core/
│   ├── state/
│   ├── services/
│   ├── layouts/
│   ├── ui/
│   └── preferences/
├── docs/                      # Documentation
│   ├── architecture/
│   └── diagrams/
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── CHANGELOG.md
├── README.md
└── metadata.json
```

---

## Benefits of Clean Rewrite Approach

### Pros
1. **Clean Slate:** No legacy baggage or technical debt
2. **Best Practices from Day 1:** Proper architecture from the start
3. **Better Testing:** Write tests alongside code, not after
4. **Clear Dependencies:** Dependency injection everywhere
5. **Maintainable:** Much easier to understand and modify
6. **Performant:** Event-driven, no polling, aggressive caching
7. **Modular:** Small, focused files (<400 lines each)

### Cons
1. **More Upfront Time:** Takes longer initially
2. **Risk:** Must ensure feature parity
3. **Big Switch:** All-or-nothing cutover
4. **Testing Burden:** Must test everything thoroughly

### Mitigations
1. **Incremental Development:** Build phase by phase
2. **Continuous Testing:** Test each phase before moving on
3. **Feature Checklist:** Track feature parity carefully
4. **Parallel Running:** Keep old code until new is proven
5. **Rollback Plan:** Can revert if issues arise

---

## Current Status

**Current Phase:** Planning Complete
**Next Step:** Begin Phase 1.1 - Directory Structure
**Overall Progress:** 0%

---

## Notes

### Key Principles
1. **Small Files:** No file >600 lines, most <400 lines
2. **Single Responsibility:** Each class does one thing
3. **Dependency Injection:** No hard dependencies
4. **Event-Driven:** No polling mechanisms
5. **Test-Driven:** Write tests alongside code
6. **Documentation:** Document as you go

### Questions / Decisions Needed
- [✓] Which GNOME Shell versions to support? **Answer: GNOME 45-48**
- [ ] Testing framework choice (if any available)?
- [ ] Code style / linting tools?
- [ ] CI/CD setup?

---

**Last Updated:** 2026-01-05
