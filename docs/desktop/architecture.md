# Desktop HTML Edition Architecture

## Product Boundary

- `desktop/` is an Electron shell around the current approved `publish/`
  runtime.
- It does not fork or reinterpret gameplay, presentation, data, or wording.
- Forge copies `publish/` into the packaged application's resources without
  writing back to the repository.
- The shell starts no HTTP server and listens on no port.

## Selective Original Synchronization

- Original `publish/` remains product authority. Desktop packaging always
  copies the complete current approved tree, so platform-only code may be
  physically present but dormant in the standalone package.
- Synchronize and verify desktop behavior when an original change affects
  gameplay, balance, characters, enemies, cards, relics, dungeons, progression,
  standalone UI or wording, visual behavior, shared assets, deterministic bug
  fixes, save schemas or migrations, settings, local persistence, offline
  resource loading, audio, or desktop-compatible input.
- Do not add desktop bridge or acceptance work by default for Game Studio
  publishing or Preview behavior, iframe sandbox/loading telemetry, unused
  `dzmm` host APIs, hosted-KV conflict UI, sharing, workshop, chat, player
  identity, serverless functions, analytics, mobile-host compatibility, or
  original-only QA, evidence, and publishing metadata.
- A platform-only change does not expand the desktop bridge or desktop
  acceptance scope unless it materially changes standalone behavior.
- Desktop-specific implementation changes are recorded in current architecture
  and tests rather than a historical synchronization log.

## Runtime Shape

- `desktop/src/main.js` owns the BrowserWindow, IPC authorization, single
  instance behavior, and the privileged `game://app/` resource protocol.
- `desktop/src/preload.js` exposes only the original runtime's required
  `dzmm.kv`, `dzmm.toast`, `dzmm.loading`, capability, and save-lifecycle
  surfaces through `contextBridge`.
- Node integration is disabled. Context isolation and renderer sandboxing are
  enabled. External windows and navigation are denied.
- `desktop/src/runtime-paths.js` resolves development and packaged runtime
  roots and rejects protocol traversal.

## Original Build Contract

- Unminified original JavaScript is authoritative only under `src/original/`.
  The desktop application neither loads nor packages that directory.
- Desktop development and release packages consume only the approved generated
  runtime under `publish/`, including the startup, hall, battle, and dungeon
  bundles.
- A change to `src/original/` must regenerate the publish bundles. Changed
  generated bundle bytes or published stylesheets must advance
  `meta[name="game-build"]` beyond the previous committed value. The original
  build and save workflows reject stale bundles, changed cache-versioned
  resources with an unchanged or older version, and development copies without
  Git history.
- Tools that inspect original source semantics must read `src/original/`.
  Desktop packaging and runtime checks must continue to inspect the generated
  `publish/` tree because that exact tree is shipped to players.
- No separate desktop source fork or manual bundle copy is allowed. Once the
  approved original build passes, desktop packaging copies that `publish/`
  generation unchanged and verifies the packaged copy byte for byte.
- The shared tracked pre-commit guard runs before direct Game Studio saves, so
  stale original bundles or styles cannot become the desktop package authority.

## Durable Storage

- `desktop/src/kv-store.js` maps browser KV keys to one checksummed JSON
  document under Electron's per-user `userData/save/` directory and serializes
  public operations. `desktop/src/kv-document.js` owns JSON-safe cloning,
  checksums, schema validation, and document creation.
- `desktop/src/kv-files.js` owns candidate reads, atomic replacement, and
  temporary-file cleanup.
- Reads and writes are serialized. Completed `put` and `delete` calls mean the
  local durable write has completed.
- Each write uses a temporary file and replacement. The previous valid primary
  becomes a backup before the new primary is committed.
- Startup validates schema, timestamps, JSON-safe values, and SHA-256 checksum.
  A corrupt primary recovers the previous valid backup and preserves the bad
  primary as a diagnostic copy. If both copies are invalid, startup fails
  closed instead of silently creating an empty save.
- The complete store is limited to 5 MiB, matching the browser KV request
  budget used by the original runtime.

## Packaging

- Electron Forge packages the Windows x64 application directory. The locked
  Node `archiver` dependency creates the portable ZIP without relying on a
  system `zip` executable.
- Packaging compares every current approved source file with
  `resources/publish/`, writes `desktop-release.json`, and emits a sidecar
  SHA-256 file.
- The first acceptance artifact is a portable ZIP. A Windows installer and
  code-signing chain are deferred until the portable artifact passes the
  original gameplay and persistence acceptance flow.
- Generated files stay under ignored `desktop/out/`.

## Development Toolchain

| Recorded | Tool | Version | Executable or root path | Purpose |
| --- | --- | --- | --- | --- |
| 2026-08-17 | Desktop static-check runtime | Node.js `20.20.2` | `/usr/local/bin/node` | Run shell syntax and durable-storage tests |
| 2026-08-17 | Electron dependency set | declared only; Electron `43.2.0`, Forge `7.11.2`, Archiver `8.0.0` | `desktop/package.json`; ignored `desktop/node_modules` | Restore on demand with Node.js 22.12+ and `npm --prefix desktop ci --include=dev` |

Desktop packaging and Electron smoke testing remain unavailable until a
compatible Node.js 22.12+ runtime and ignored `desktop/node_modules`
dependencies are installed. Static checks and local storage tests do not need
those dependencies.
