# VS Code Workbench adaptation

This project follows the main workbench boundaries from VS Code without copying
its implementation or extension host:

| VS Code part | Agent Workbench |
| --- | --- |
| Activity Bar | NavigationRail |
| Primary Side Bar | WorkspaceExplorer |
| Editor Part | MarkdownEditor and editor-groups |
| Panel | RunPanel |
| Status/evidence area | EvidencePanel |
| Layout, services and commands | src/renderer/workbench/ |

The editor layout is modeled as an orientation plus a recursive editor-group
tree. The first increment supports one group or two groups split horizontally or
vertically; the node shape already carries group IDs and optional sizes for
nested layouts.
The model is deliberately independent from React so nested groups, persisted
layout state, and command routing can be added without moving layout decisions
into visual components.

The source-level concepts used here are the VS Code Workbench parts, the
Activity Bar and Side Bar relationship, and editor group layout commands. The
adaptation keeps the same ownership boundaries while using the existing
Electron IPC and Opsbot protocol.

Workbench layout, active editor, and open tabs are persisted through the
renderer storage adapter in src/renderer/workbench/storage.ts, mirroring the
role of VS Code's memento and storage services without coupling the UI to an
Electron-specific persistence API.

The renderer also has a small service collection and command registry. It is
intentionally smaller than VS Code's decorator-based instantiation service,
but preserves the same direction: register platform capabilities once and let
Workbench actions execute through service contracts.
