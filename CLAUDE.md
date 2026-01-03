# Claude Code Instructions for SnapKit

## CRITICAL TESTING RULES

**NEVER kill a GNOME process or stop any program for testing purposes.**

**ALL testing is to be done by the user manually.**

This includes but is not limited to:
- Do NOT run `killall gnome-shell` or similar commands
- Do NOT use `pkill`, `kill`, or any process termination commands on GNOME components
- Do NOT restart GNOME Shell or any related services
- Do NOT stop, restart, or disable any running extensions

When testing is needed, provide instructions to the user and let them perform the testing manually.


## Core Development Principles

### 1. NEVER Remove Features Due to Difficulty

**Features are NEVER to be removed, simplified, or dropped because they are considered difficult, complex, or time-consuming to implement.**

If a feature is specified or requested:
- It MUST be implemented as specified
- If implementation is blocked, Claude MUST clearly state the specific technical blockers
- If Claude lacks knowledge to implement something, this MUST be explicitly stated
- The user will then decide how to proceed

Unacceptable responses:
- "This is too complex, let's simplify..."
- "For now, we can skip..."
- "This can be added later..."
- "A simpler approach would be..."
- Silently omitting requested functionality

Acceptable responses:
- "I cannot implement X because Y. Specifically, the blocker is Z."
- "I don't have sufficient knowledge about X to implement this correctly."
- "This requires information I don't have: [specific info needed]"

### 2. Production Quality Standards

All work MUST adhere to **highest quality production standards**:

- Code must be production-ready, not prototype quality
- No "TODO" comments for core functionality (only for genuine future enhancements)
- No placeholder implementations that "will be filled in later"
- Error handling must be complete, not stubbed
- Edge cases must be considered and handled
- Security implications must be addressed
- Performance must be considered from the start

### 3. Explicit Communication of Limitations

When Claude encounters limitations:

1. **State it immediately** - Don't proceed with a partial implementation silently
2. **Be specific** - Name the exact limitation (knowledge gap, technical blocker, etc.)
3. **Provide options** - Suggest what information or resources would unblock progress
4. **Ask for guidance** - Let the user decide how to proceed




## When In Doubt

If uncertain about any of the above:
1. Ask the user for clarification
2. Do NOT make assumptions that reduce scope
3. Do NOT silently simplify requirements
4. State what you know and what you don't know

**The user's requirements are the source of truth, not Claude's assessment of feasibility.**
