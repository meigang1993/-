# Desktop HTML Edition QA Workflow

## Focused Checks

Run from the repository root:

```bash
npm run check:desktop
npm run test:desktop
npm run test:contracts
```

- `check:desktop` verifies required shell files, JavaScript syntax, security
  flags, read-only `publish/` packaging, and absence of a runtime server.
- `test:desktop` covers protocol path confinement, durable KV persistence,
  deletion, write ordering, invalid-value rejection, checksum validation, and
  backup recovery.
- `test:contracts` verifies the original runtime identity and version-domain
  boundary. Historical full-file digests are enforced only while the freeze is
  active.

## Packaging Check

`npm run build:desktop:win` creates the Windows x64 portable ZIP and SHA-256
sidecar under `desktop/out/make/zip/win32/x64/`. The build itself compares
every packaged original file with the current approved `publish/`. Before
release:

1. Confirm the archive contains the Electron executable and
   `resources/publish/index.html`.
2. On a clean Windows x64 system, extract and inspect the portable ZIP.
3. Verify title boot, New Game, Continue, settings, save slots, hall, dungeon,
   battle, settlement, and restart persistence.
4. Corrupt a copied primary save and confirm backup recovery.
5. Confirm no local server, firewall prompt, or network dependency is required.

The installer and signing stage begins only after this portable acceptance
passes. Desktop QA does not replace the original gameplay regression catalog;
the current approved original remains the behavioral authority.
