# SnapKit Documentation

This directory contains technical documentation for SnapKit development and planning.

## Documents

### [GAP_ANALYSIS_PROFESSIONAL_FEATURES.md](GAP_ANALYSIS_PROFESSIONAL_FEATURES.md)
**Comprehensive professional features gap analysis** comparing SnapKit to enterprise-grade window managers.

- **Lines**: 1,135 lines
- **Size**: 31KB
- **Last Updated**: January 5, 2026
- **Status**: Complete

**Contents**:
- Executive summary with current maturity assessment (60-70%)
- 15 feature categories analyzed with severity ratings
- Competitive positioning vs. Windows PowerToys, Rectangle, i3/sway, DisplayFusion
- Priority matrix with immediate, near-term, and long-term recommendations
- Implementation roadmap (6-10 months to feature parity)
- Top 3 critical gaps: Keyboard shortcuts, Window rules, Testing infrastructure

**Use Cases**:
- Product planning and roadmap prioritization
- Understanding missing features vs. professional tools
- Contributor guidance on high-impact features
- User expectations management

---

### [LAYOUT.md](LAYOUT.md)
**Complete specification for the snap-to-grid layout system** (Schema v1).

- **Lines**: 627 lines
- **Size**: 14KB
- **Status**: Implemented

**Contents**:
- Layout JSON schema definition
- Node types (split, leaf)
- Size specifications (frac, px, auto)
- Resolution algorithm
- Divider dragging and overrides
- Window snapping behavior
- Rulesets and profiles (optional)
- Validation rules
- Implementation examples

**Use Cases**:
- Understanding the layout system architecture
- Creating custom layouts
- Implementing layout features
- Debugging layout issues

---

### [CUSTOM_LAYOUT_EDITOR_PLAN.md](CUSTOM_LAYOUT_EDITOR_PLAN.md)
**Implementation plan for the custom layout editor**.

- **Lines**: 478 lines
- **Size**: 15KB
- **Status**: Implemented

**Contents**:
- Phase-by-phase implementation plan
- Architecture decisions
- Component specifications (Dialog, Canvas, State)
- Data flow and operations
- Layout-driven resize approach (critical architecture)
- File structure and implementation order
- Success criteria

**Use Cases**:
- Understanding the layout editor architecture
- Contributing to editor features
- Understanding override system
- Learning the layout-driven resize approach

---

## Quick Reference

| Feature | LAYOUT.md | Editor Plan | Gap Analysis |
|---------|-----------|-------------|--------------|
| Layout schema | ✅ Complete | - | - |
| Editor implementation | - | ✅ Complete | - |
| Missing features | - | - | ✅ Complete |
| Keyboard shortcuts | - | ⚠️ Mentioned | 🔴 Critical Gap |
| Window rules | ⚠️ Spec only | - | 🔴 Critical Gap |
| Testing | - | - | 🔴 Critical Gap |
| Workspace integration | - | - | 🟡 High Priority |
| Multi-monitor advanced | - | - | 🟡 High Priority |

---

## Document Status

- ✅ **Complete**: Fully documented and implemented
- ⚠️ **Partial**: Specification exists but not fully implemented
- 🔴 **Gap**: Feature missing, critical priority
- 🟡 **Gap**: Feature missing, high/medium priority
- 🟢 **Gap**: Feature missing, low/medium priority

---

## For Contributors

**Start here if you want to**:

1. **Understand what's missing**: Read [GAP_ANALYSIS_PROFESSIONAL_FEATURES.md](GAP_ANALYSIS_PROFESSIONAL_FEATURES.md)
2. **Understand the layout system**: Read [LAYOUT.md](LAYOUT.md)
3. **Work on the editor**: Read [CUSTOM_LAYOUT_EDITOR_PLAN.md](CUSTOM_LAYOUT_EDITOR_PLAN.md)
4. **Implement keyboard shortcuts**: See Gap Analysis Section 1 (Critical)
5. **Add window rules**: See Gap Analysis Section 3 (High Priority) + LAYOUT.md Section 9
6. **Set up testing**: See Gap Analysis Section 12 (Critical)

---

## Roadmap Summary

Based on the gap analysis, the recommended implementation order is:

### Immediate (Current Sprint)
1. Keyboard shortcuts (Critical gap)
2. Testing infrastructure (Critical gap)
3. Error handling improvements (Critical gap)

### Next Quarter (3 months)
4. Window rules and automation (High-value feature)
5. Workspace integration (Better GNOME experience)
6. Documentation sprint (Reduce support burden)

### Long Term (6+ months)
7. DBus/CLI interface (Extensibility)
8. Monitor profiles (Pro multi-monitor)
9. Session management (Convenience)
10. Layout marketplace (Community growth)

---

**Last Updated**: January 5, 2026
