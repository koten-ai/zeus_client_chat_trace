# Grok Build Planning Instructions

Always create or update plans in `.grok/plans/<TASK_NAME>.md` and for multi-phase plans in `.grok/plans/<PHASE_NUMBER>_<TASK_NAME>.md` (for example: `.grok/plans/1_IMPLEMENT_SEARCH_FUNCTIONALITY.md`). Use clear Markdown structure. Every plan must follow this template.

## Plan Template (Use This Structure)

```markdown
# Plan: [Short Descriptive Title]

**Date**: YYYY-MM-DD
**Task**: [One-sentence summary]  
**Priority**: High/Medium/Low  
**Estimated Effort**: X hours / X steps

## 1. Context & Requirements
- **Goal**: [Clear success criteria]
- **Constraints**: [Tech stack, performance, compatibility, etc.]
- **Assumptions**: [What we're assuming is true]
- **Out of Scope**: [Explicitly excluded items]

## 2. Analysis & Research
- Key files explored: [list]
- Potential risks/edge cases:
  - [Risk 1] → Mitigation
  - [Risk 2] → Mitigation
- Alternatives considered: [Brief comparison]

## 3. Step-by-Step Implementation Plan
1. **[Step title]**  
   - Files to change: `path/to/file1`, `path/to/file2`
   - Changes: [Bullet points or pseudocode]
   - Commands to run: `command example`
   - Tests needed: [ ]

2. **[Next step...]**  
   ...

## 4. Verification & Rollback
- **Tests**: [Unit/integration/manual steps]
- **Review Checklist**:
  - [ ] Code style/linting passes
  - [ ] No breaking changes
  - [ ] Feature guide created or updated in `.grok/guides/<FEATURE_NAME>.md`
- **Rollback Plan**: [How to revert if needed]

## 5. Open Questions / Decisions Needed
- [Question 1?]

---

# Feature Documentation Guides

After implementing a feature (or completing a significant change), create or update a guide in `.grok/guides/<FEATURE_NAME>.md` (for example: `.grok/guides/SEARCH_FUNCTIONALITY.md`). Use clear Markdown structure. Every guide must follow this template.

**When to create or update a guide:**
- A new feature, integration, or user-facing workflow is added
- Existing behavior changes in a way that affects setup, usage, or debugging
- A bug fix introduces new troubleshooting steps or resolves a known issue
- Related files, tickets, or commits need to be recorded for future reference

**Naming:** Use `SCREAMING_SNAKE_CASE` for `<FEATURE_NAME>`, matching the related plan name when one exists.

## Guide Template (Use This Structure)

```markdown
# Guide: [Short Descriptive Title]

**Date**: YYYY-MM-DD
**Feature**: [One-sentence summary]
**Status**: Active / Deprecated / Superseded by [link or guide name]
**Related Plan**: `.grok/plans/<PLAN_NAME>.md` (if applicable)

## 1. Overview
- **Purpose**: [What this feature does and why it exists]
- **Scope**: [What is included and excluded]
- **Entry points**: [Routes, commands, UI screens, API endpoints, or triggers]

## 2. Architecture & Flow
- **High-level flow**: [Step-by-step description of how the feature works end-to-end]
- **Sequence / diagram** (optional): [Mermaid or ASCII diagram for complex flows]
- **Key components**:
  - `[path/to/file]` — [Role in the feature]
  - `[path/to/file]` — [Role in the feature]
- **Data flow**: [Inputs, transformations, outputs, external services]
- **Dependencies**: [Libraries, env vars, services, feature flags]

## 3. Setup
- **Prerequisites**: [Tools, accounts, versions]
- **Environment variables**:
  - `VAR_NAME` — [Description, required/optional, example value]
- **Install / bootstrap steps**:
  1. [Step with commands, e.g. `npm install`, `docker compose up`]
  2. [Step]
- **Configuration**: [Config files, defaults, per-environment notes]
- **Verification**: [How to confirm setup succeeded]

## 4. How to Use
- **Primary workflow**:
  1. [User or developer action]
  2. [Expected result]
- **Examples**: [CLI commands, API calls, UI steps, or code snippets]
- **Edge cases**: [Unusual but supported scenarios]
- **Limitations**: [Known constraints or unsupported cases]

## 5. Debugging & Known Issues
- **Common symptoms → causes → fixes**:
  | Symptom | Likely Cause | Fix |
  |---------|--------------|-----|
  | [Error or behavior] | [Root cause] | [Resolution steps] |
- **Debug checklist**:
  - [ ] [Log location or command to inspect]
  - [ ] [Config or env var to verify]
  - [ ] [Test or health-check to run]
- **Known issues**:
  - **[Issue title]** — [Workaround or status; link to ticket if open]
- **Logging & observability**: [Where to find logs, metrics, or traces]

## 6. Related Artifacts
- **Files changed / owned by this feature**:
  - `path/to/file` — [Brief description]
- **Tickets**:
  - [JIRA-123](https://...) — [Title / status]
- **Commits**:
  - `abc1234` — [Short commit message summary]
  - `def5678` — [Short commit message summary]
- **Pull requests** (if applicable):
  - [#42](https://...) — [Title / status]

## 7. Changelog
| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | [Name or agent] | [Initial guide / update summary] |
```

## Guide Maintenance Rules

- **Create** the guide when the feature is complete and verified; do not defer documentation.
- **Update** the guide whenever behavior, setup, or known issues change — including after follow-up fixes.
- **Link** the guide from the related plan (section 4 Verification checklist) and reference the plan from the guide.
- **Record** every file touched, ticket ID, and commit hash that relates to the feature in section 6.
- **Keep flows accurate**: section 2 must reflect the actual code path, not the original design intent.
- **Prefer updating** an existing guide over creating duplicates; mark superseded guides as `Deprecated` in the status field.