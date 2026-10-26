# Agent Workbench

Electron Forge + Vite + React desktop console for workflow-oriented Opsbot runs.

## Development

```bash
npm install
npm run start
```

The first scaffold uses a `MockOpsbotClient`. It supports workspace selection, Markdown editing, saving, and a simulated run event stream. The Python Opsbot integration will be added behind the shared protocol in a later step.

The dependency tree pins `@electron/rebuild` to the published 4.2.0 package. This avoids the GitHub-hosted `@electron/node-gyp` source dependency pulled by older rebuild releases, which can fail in restricted networks.

## Checks

```bash
npm run lint
npm run test
npm run package
npm run make
```
