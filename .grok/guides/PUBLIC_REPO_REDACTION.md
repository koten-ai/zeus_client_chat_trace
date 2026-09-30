# Guide: Public repository redaction

**Date**: 2026-09-30
**Feature**: Tracked files no longer name production object storage, a private credentials checkout, the lab hostname, or the issue tracker host.
**Status**: Active
**Related Plan**: `.grok/plans/PUBLIC_REPO_REDACTION.md`

## 1. Overview
- **Purpose**: Make a public clone safe to publish without shipping production infrastructure details or private repository paths.
- **Scope**: Documentation, the CDN upload script, gitignore, and test hostnames. Local `.secrets/` and `.env` stay on disk and stay gitignored. Git history is unchanged.
- **Entry points**: `scripts/upload_dist_cdn.sh`, `.env.example`, `README.md` CDN section.

## 2. Architecture & Flow
- **High-level flow**:
  1. `npm run publish:cdn` reads `.env`. A non-empty shell export overrides the same name.
  2. The script refuses to run until the Spaces key, secret, bucket, and region are set.
  3. The widget build reads only `ZEUS_API_URL`, `ZEUS_AUTH_TOKEN`, and `HUB_BASE_URL` from that file. CDN credentials are not inlined.
  4. Docs use `https://<cdn-host>/…` and `http://hub.example` instead of a real host.
- **Key components**:
  - `scripts/upload_dist_cdn.sh` — upload; no baked-in bucket or region; reads `.env`
  - `.env.example` — widget defaults and empty CDN variables
  - `.gitignore` — ignores `.env`, `.env.*` except `.env.example`, `.secrets/`, and any `spaces-static.env`
- **Data flow**: Credentials never enter git. They are read at publish time from `.env` or the shell. The build does not copy CDN keys into `dist/`.
- **Dependencies**: DigitalOcean Spaces credentials supplied by the operator.

## 3. Setup
- **Prerequisites**: Python 3 and boto3 to publish.
- **Environment variables**:
  - `DO_SPACES_KEY` — Spaces access key, required to publish
  - `DO_SPACES_SECRET` — Spaces secret, required to publish
  - `DO_SPACES_STATIC_BUCKET` — destination Space, required, no default
  - `DO_SPACES_STATIC_REGION` — Space region, required, no default
  - `DO_SPACES_STATIC_ENDPOINT` — optional; default `https://<region>.digitaloceanspaces.com`
  - `DO_SPACES_STATIC_PREFIX` — optional object prefix; default `zeus_client_chat_trace`
  - `DIGITALOCEAN_TOKEN` — optional, used only to ensure a CDN endpoint
  - `ZEUS_API_URL`, `ZEUS_AUTH_TOKEN`, `HUB_BASE_URL` — optional widget build defaults in the same `.env`. The build inlines only these three.
- **Install / bootstrap steps**:
  1. `cp .env.example .env`
  2. Fill `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_STATIC_BUCKET`, and `DO_SPACES_STATIC_REGION` in `.env`.
- **Configuration**: Do not commit `.env`.
- **Verification**: `git check-ignore -v .env` reports a gitignore rule. `git status` does not list `.env`.

## 4. How to Use
- **Primary workflow**:
  1. Keep widget defaults and CDN credentials in `.env`.
  2. `npm run build && npm run publish:cdn`.
- **Examples**: CDN URLs in the README use `https://<cdn-host>/zeus_client_chat_trace/<version>/zeus_client_chat_trace.js`.
- **Edge cases**: An old `spaces-static.env` is still gitignored, but the publish script does not read it.
- **Limitations**: Author names and emails already in `git log` are still in history. The widget still strips internal trace fields by name in `src/normalize.js`; those names stay in source so the strip keeps working.

## 5. Debugging & Known Issues
- **Common symptoms → causes → fixes**:
  | Symptom | Likely Cause | Fix |
  |---------|--------------|-----|
  | `DO_SPACES_STATIC_BUCKET: parameter not set` | `.env` has no bucket | Set `DO_SPACES_STATIC_BUCKET` and `DO_SPACES_STATIC_REGION` in `.env` |
  | Filled env file shows up in `git status` | File is not named `.env` and is outside `.secrets/` | Put secrets in `.env` |
- **Debug checklist**:
  - [ ] `git check-ignore` matches `.env`
  - [ ] `git ls-files` does not list `.secrets` or `.env`
  - [ ] Search the tree for the old production host and tracker host before publishing
- **Known issues**:
  - **History still has author emails** — a public push publishes existing commits as they are.
- **Logging & observability**: The upload script prints the bucket name it was given at runtime. Do not paste that log into a public issue.

## 6. Related Artifacts
- **Files changed / owned by this feature**:
  - `.gitignore` — ignore credential filenames outside `.secrets/`
  - `scripts/upload_dist_cdn.sh` — required bucket and region; reads `.env`
  - `.env.example` — widget defaults and empty CDN variables
  - `README.md` — placeholder CDN URLs; no tracker link
  - `src/config.test.js` — example hub host
  - `src/helpers.js`, `src/panel.js` — comments no longer name another checkout
  - `.grok/guides/` and `.grok/plans/` — same identifiers removed
- **Tickets**: none linked
- **Commits**: not committed in this change
- **Pull requests** (if applicable): none

## 7. Changelog
| Date | Author | Change |
|------|--------|--------|
| 2026-09-30 | Grok | README, embeddable guide, and playground guide document the single `.env`, including optional endpoint, prefix, and token |
| 2026-09-30 | Grok | CDN credentials live in `.env` with the widget variables. `spaces-static.env` is no longer read |
| 2026-09-30 | Grok | Initial redaction for a public repository |
