# Desktop HTML Edition

This directory contains the Electron shell for the current approved original
HTML game. It does not own gameplay, UI, assets, or wording. Forge packages
`../publish` as a read-only resource.

Commands:

```bash
npm install --include=dev
npm test
npm run check
npm run make:win
npm run prepare:wormhole
```

Static checks and storage tests run with the repository Node.js toolchain.
Electron installation and Windows packaging require Node.js 22.12 or newer.

The Windows x64 portable ZIP is written under `out/make/zip/win32/x64/`.
Run `npm run prepare:wormhole` after packaging to create
`out/wormhole-upload/`, containing the renamed upload ZIP, matching SHA-256
sidecar, release metadata, and upload instructions.
Desktop saves are stored below Electron's per-user `userData/save/` directory.
