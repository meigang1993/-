# Windows Portable Build

Run:

```bash
npm install --prefix desktop --include=dev
npm run --prefix desktop build:win
```

The unpacked Windows x64 application is written to:

```text
desktop/out/SuccubusKill-win32-x64/
```

The desktop wrapper loads a packaged copy of `publish/` directly from disk.
It does not start a local server. Player saves use Electron's local browser
storage for the application profile.
