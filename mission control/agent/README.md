# Agent Files - Documentation

This folder contains the core operating instructions and personality definitions for the Mission Control Agent.

## Files Overview

### agent.md
The main operating instructions that define:
- What the agent does
- Safety rules and boundaries
- Business workflows
- Tool usage and commands
- Limitations and restrictions
- Emergency procedures

**Purpose**: Acts as the agent's "user manual" - tells it HOW to operate.

### soul.md
The personality and behaviour guide that defines:
- How the agent communicates
- Decision-making principles
- Response patterns
- Ethical boundaries
- Task prioritization

**Purpose**: Acts as the agent's "character sheet" - tells it WHO it is.

### README.md
This file - documentation for maintaining agent files.

## Why These Files Matter

These files form the "brain" of the Mission Control Agent. They ensure:
- Consistent behaviour across sessions
- Safety boundaries are respected
- User expectations are met
- Data integrity is maintained

## How To Update Safely

### Before Editing
1. Create a backup first:
   ```
   /backup/agent/agent-YYYY-MM-DD.md
   /backup/agent/soul-YYYY-MM-DD.md
   ```

2. Review current file completely

3. Plan your changes

### Making Edits
1. Open the file in a text editor
2. Make targeted changes only
3. Save to the original location
4. The system will log changes automatically

### After Editing
1. Changes are logged in activity log
2. New settings take effect immediately
3. Test the agent behavior
4. If issues arise, restore from backup

## Important Rules

### DO:
- Back up before any changes
- Make one change at a time
- Test after changes
- Log edit reasons

### DON'T:
- Overwrite without backing up first
- Make multiple large changes at once
- Edit while agent is running
- Delete any agent files

## Integration

These files are loaded by the Mission Control system:
- Viewable in Settings > Agent Brain page
- Content displayed in the UI
- Logged in activity on any changes

To view the agent's current instructions:
1. Open Mission Control
2. Navigate to Settings
3. Click "Agent Brain"
4. Select agent.md or soul.md

## Future Updates

As the Mission Control system evolves:
- agent.md may gain new capabilities
- soul.md may evolve communication style
- New instructional files may be added

Always backup before updating to allow rollback if needed.

## Support

For questions about agent files:
- Review this README
- Check agent.md for operational details
- Check soul.md for personality questions
- Create backup before experimentation