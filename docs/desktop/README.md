# Desktop HTML Edition Memory Index

The desktop edition wraps the current approved original HTML runtime. It was
restored to the streamlined repository on August 17, 2026.

| Document | Owns |
| --- | --- |
| `architecture.md` | Electron boundary, local protocol, bridge, storage, packaging, and toolchain |
| `qa-workflow.md` | Focused checks, package verification, and release acceptance |
Original gameplay, UI, and save source remain owned by `src/original/`; static
assets and generated runtime bundles remain under `publish/`; product contracts
remain under `docs/original/`. The desktop shell always packages the current
approved `publish/` tree without maintaining a separate gameplay copy.
