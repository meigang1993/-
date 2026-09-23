# Original Game Studio Platform Runtime

This file records platform facts that materially affect implementation safety.
It is not a complete SDK reference; use the current Game Studio SDK guidance
when adding a new platform capability.

## Static Iframe Environment

- The game runs as static files in a sandboxed iframe with an opaque origin.
- `window.dzmm` is injected by the host before the game runtime starts.
- Do not access `parent.document`, `top.location`, `window.opener`, cookies, or
  same-origin host state.
- Production must not rely on `window.open`, form navigation, direct parent DOM
  access, or another Workbench-only sandbox allowance.
- `localStorage`, `sessionStorage`, and IndexedDB may throw `SecurityError`.
  Treat them only as best-effort fallback in a non-sandbox standalone context.
- Use relative asset URLs. The host-provided base URL resolves published static
  files.
- Workbench may execute the generated page from a `blob:` URL after injecting
  an absolute `<base href>`. Resource-base code must use that base element or
  `document.baseURI` and must not resolve relative paths against
  `window.location.href` when its protocol is `blob:`.

## Persistence

- `dzmm.kv` is the normal durable browser-side storage API.
- A failed remote write plus failed local fallback is a real failure; never
  report it as saved.
- A failed read is different from an empty value and must not initialize or
  overwrite progress implicitly.
- Save by milestone, not by frame, input event, timer, or continuous drag.
  Completed battle operations may request a checkpoint, but same-task requests
  must coalesce before snapshot construction and unchanged stable state must not
  write again.
- Main progress, manual slots, settings, lifecycle deletion, validation,
  copy selection, and recovery follow the stricter contracts in
  `game-settings.md`.
- Main saves, manual slots, and settings write directly through browser
  `dzmm.kv`; startup must not depend on `dzmm.fn` or a serverless save bridge.
- When browser KV exists, its completed write/delete is authoritative and local
  storage is only a best-effort recovery copy. A KV read failure must remain
  distinct from an explicit empty value.
- Register `window.dzmm?.save?.onAction` when available and handle `reset` and
  `prepareDeleteRecord` without claiming success after partial deletion.
- Do not gate save lifecycle support through an invented capability flag.
## Capability Gating

- Read `dzmm.capabilities.get()` before exposing optional advanced features.
- `caps.kv` covers basic single-key get/put/delete only.
- Check `caps.kvBatch`, `caps.kvList`, and `caps.workshop` before using or
  displaying those features.
- Do not probe expensive or unsupported features by calling them first and
  catching the error.
- Older hosts may conservatively report newer capabilities as unavailable; the
  game must retain a valid reduced feature path where the product permits it.

## Startup Loading

- Core single-player startup must not depend on SDK availability, KV, an
  online service, or a post-start optional resource request. Required rules and
  canonical game data belong in the published startup artifacts; optional
  static content may load later without disabling New Game or Load.
- Call `dzmm.loading.progress()` early when startup performs visible preloading
  or initialization.
- Report phase changes and resource completion at a moderate frequency.
- Call `dzmm.loading.ready()` only after the first interactive frame exists.
- On startup failure, call `dzmm.loading.error(code, message)` and render an
  in-game error/retry state.
- Loading payloads must remain small and JSON-safe.
- Optional post-start static fetch failures stay inside the game with an
  explicit retry. They must not send the host back into blocking startup or
  emit a startup failure after the first interactive frame.

## Costly SDK Calls

The following calls may consume quota, points, or server capacity:

- `dzmm.completions`
- `dzmm.draw.generate` / `dzmm.draw.edit`
- `dzmm.fn.invoke` / `dzmm.fn.invokeStream`

Never place them in:

- `requestAnimationFrame`;
- `setInterval` or automatic short polling;
- `pointermove`, `scroll`, `oninput`, or resize callbacks;
- reactive effects that can trigger themselves;
- another completion/draw callback without a separate player action.

Every costly action needs:

- an in-flight guard and disabled/busy control;
- a visible waiting state;
- one request per player action;
- a request generation/id guard against stale responses;
- a deterministic fallback or explicit retry control;
- no automatic retry after a charged request fails.

## Completions

- Use `model: "default"` unless the product intentionally requires a fixed
  model.
- Message roles are `user` and `assistant`; do not send `system`.
- Fold system/persona instructions into the user message when needed.
- Streaming callbacks provide cumulative text, not deltas; replace the buffer
  on each callback.
- Parse structured output only when the stream is complete and always provide a
  non-JSON fallback.

## Draw And Edit

- `✨ Nalang Dream` is not exposed by the current runtime and is not the game's
  default draw model. The one-off Bertis trial authorized on 2026-08-08 was
  abandoned, and its Workbench generator was removed the same day.
- A platform catalog default, recommendation, or returned model id does not
  count as approval. Any future Nalang Dream use requires another explicit user
  decision; never integrate, expose, or substitute a model based on the retired
  trial.
- Long image tasks need busy locking, waiting guidance, stale-response guards,
  and explicit retry.
- Validate reference file type, size, and dimensions before edit requests.
- For multi-image edits, prompts should refer to array positions consistently
  using the platform's supported `图1`, `图2` notation.
- Handle quota, rate limit, authentication, safety, unsupported image, and
  timeout errors by stable `error.code`, not message substring matching.

## SDK Errors

- Prefer `error.code`, `error.category`, and `error.retryable`.
- Log `error.code`, `error.message`, and `error.stack`; do not rely on
  serializing the `Error` object.
- `RATE_LIMITED` ends the current action and offers later explicit retry.
- `QUOTA_EXHAUSTED` and `VIP_REQUIRED` need quota/VIP guidance, not retry loops.
- Authentication errors stop requests and tell the player to re-enter.
- Safety errors ask the player to change input.

## Serverless Functions

- Browser code calls `functions/*.ts` through `dzmm.fn.invoke` or
  `dzmm.fn.invokeStream`.
- Functions are appropriate for hidden prompts, authoritative score/economy
  validation, shared global state, and multi-step AI orchestration.
- Player-private progress normally remains in browser SDK KV; player-published
  creations use the workshop capability rather than a homemade global gallery.
- A server function may still be visible to the game owner/platform and is not a
  secret vault.
- Paid or side-effecting function actions require stable action IDs and
  server-side reservation/completion semantics before any retry is allowed.
- Newly added functions require publishing through the Workbench before real
  players can invoke them.
