# Agent Note: The shipped agent-preset roster serves the construction product

Status: implemented

English | [中文](2026-09-22-shipped-preset-roster-construction-product.zh.md)

## Problem

The shipped preset roster still described the generic coding-agent product: `standard` plus the `ptc` and `minimal` variants, with the `drawing-split` workflow preset carrying the whole construction runtime — file tools, `construction_pdf_split`, costing, scheduling, and the four business Skills — because that was the first preset to need them. For the construction-first release this spread the industry capability across the wrong surface: a person meeting the product on the homepage saw a PTC mode and a minimal mode that say nothing about engineering work, and the business Skills were a side effect of a drawing workflow rather than a first-class mode of their own.

## Decision

**The shipped roster is `standard`, `drawing-split`, and `engineering`, with `cordis` kept but hidden from the homepage picker; the `engineering` preset alone mounts the construction runtime's business surface, and `drawing-split` mounts the runtime drawing-only. The `ptc` and `minimal` presets are removed entirely.**

### The roster

Homepage picker order is `standard` (order 1), `drawing-split` (order 2), `engineering` (order 3). `cordis` stays fully usable — settings roster cards, the read-only composition viewer, copy, and the creator-draft flow all still reach it — but its `preset.yml` carries `picker: false`, an optional boolean metadata field that hides a preset from the new-session menu only. The hero chip filters `picker: false` rows out of its menu at render time and nowhere else: a session already running one still gets its label, and the settings section never filters. The field defaults to visible when absent, so user presets authored under `$DSH_HOME/.agent-presets` are unaffected, and a `picker` value that is present but not a boolean fails loud in metadata parsing instead of silently picking a side. The creator-draft entry stages `cordis` directly through the seat controller, so it never depended on the filtered menu roster.

### Who owns the construction runtime

The `engineering` preset is the `standard` composition — every model-facing row, including local skill discovery and the skill loader — plus one `construction-runtime` row and a construction-industry persona. It is the only shipped preset that mounts the runtime's business surface, so the four business Skills (cost, quality, safety, schedule), the four composer-menu commands, and the task tools are active only there and in the opt-in CLI `construction` bundle, which is unchanged. The `drawing-split` preset mounts the same runtime with `business: false`: only the drawing surface — the read-only file tools and `construction_pdf_split` — registers there, with no skill provider, no command rows, and no task-binding prompt section, so it carries no skill-catalog rows either. The PTC tool-presentation machinery (`mode: 'ptc'`, `dsh-ptc-runtime`, `dsh-workflow-ptc`) is untouched: what went away is only the shipped *preset* that pinned it.

### What replaced the removed presets in tests

Web and CLI lanes that used the shipped `ptc` or `minimal` preset as a composition to mount now seed lane-owned presets with the same content from `apps/web/tests/fixtures/presets/` (or an embedded composition constant), keeping the recorded-session fixtures' `agentPreset` headers valid without resurrecting the presets as shipped surface. The `ptc-round` and `minimal-preset` recorded Web scenarios are deleted with their snapshot directories; the PTC escalation and presentation scenarios survive on the lane-owned preset.

## Alternatives considered

**Keeping `ptc` and `minimal` for non-construction users: rejected.** Every shipped preset is a product promise — locale copy, settings-page real estate, and homepage picker space — and this deployment's product is the construction assistant. A user who wants a narrow or PTC-presented agent authors one by copying `standard`, which is the supported path for every custom composition.

**Hiding `cordis` client-side by id: rejected.** A hardcoded id list in the client would fork roster knowledge between host and browser and would break the moment a deployment ships its own authoring preset under another id. The `picker` field keeps the decision in the preset's own metadata, where the deployment that authors a preset can read and copy it.

**Letting the settings page filter `picker: false` too: rejected.** The opt-out exists so a new session is never staged into editing the runtime by accident; managing, viewing, and copying the preset is exactly what the settings page is for, and hiding it there would leave no surface that reaches it at all.

**Splitting the construction runtime so `drawing-split` keeps the split tools without the Skills: deferred then adopted in the same release.** The runtime now exposes two validated config gates, `drawing` and `business` (both default on), registered per surface: with `business: false` no skill provider, no composer commands, no task tools, and no task-binding section register, so the shipped `drawing-split` preset mounts the runtime drawing-only and its persona (`construction_files_inspect`, `construction_pdf_split`) is executable again. The four composer-menu command rows live in the engineering preset's standing command layer, so they list only for sessions composed on that preset — the command registry's scope-chain merge, not a client-side filter.

## Consequences

`drawing-split` mounts the drawing-only runtime, so its persona can execute the workflow it names; the business surface — Skills, commands, task tools — stays exclusive to `engineering`, and the shipped-roster spec pins both compositions (drawing-split's row carries `business: false`; engineering's row carries no config) so the split cannot drift quietly. V2 sessions recorded under the legacy `code` preset id still migrate to `ptc` in the session-format layer, but no shipped preset answers to `ptc` anymore, so such a session fails at mount with the roster's not-found reason — the migration machinery is unchanged and still covered by its unit tests.

## Verification

The `dsh-agent-presets` suite (200 tests) pins discovery, metadata parsing including the loud `picker` failure, the roster API surfacing the field, the shipped compositions, and the preset-scoped command listing (a command registered inside one preset's standing composition lists only for agents joined to it); the `ui-agent-preset` client suites (165 tests) pin the locale keys, the menu-only filter, and the chip label for a running picker-hidden preset. The Web lanes `agent-preset-selection`, `agent-preset-authoring`, and `settings-chrome` regenerate their goldens through the repository's refresh mode, and the recorded-session snapshot cases that referenced the removed presets were deleted with their fixtures.
