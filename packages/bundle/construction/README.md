---
description: "The construction engineering bundle for dsh: composes dsh-base with the read-only construction runtime tools, the four bundled business Skills, standards RAG over MCP, and the sidebar Gantt, with model-facing arbitrary shell and code execution disabled."
kind: "package-bundle"
---

# @deepseek-ai/dsh-construction

English | [中文](README.zh.md)

## Summary

`dsh-construction` turns a base-backed dsh profile into a construction engineering assistant: it mounts the [`construction-runtime`](../../construction/construction-runtime/README.md) Host plugin (read-only Word/Excel/PDF file tools, deterministic costing, CPM scheduling, report export), exposes the four bundled business Skills (construction-safety, construction-quality, construction-cost, construction-schedule) through the runtime's own read-only provider, attaches a standards RAG server over MCP, and adds the sidebar Gantt client row. Model-facing arbitrary shell and code execution are disabled; `web_search` and `web_fetch` remain available. Run it with `dsh --profile construction`, or layer the patch over another profile with `dsh --patch <overlay>`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The bundle is the second layer of the shipped `construction` profile:

```sh
dsh --profile construction
```

The profile composes [`dsh-base`](../base/README.md) with this patch. No config is required: the runtime resolves its packaged assets (read/split scripts and the four bundled Skills) relative to the plugin itself, and every runtime tunable stays in the plugin's own Config schema with its deployment defaults.

### Standards RAG over MCP

The patch inserts one `dsh-mcp-client` row (`standards-rag`, serverName `standards`, stdio transport). The server command is env-driven:

| Env | Meaning |
|---|---|
| `DSH_STANDARDS_RAG_COMMAND` | Executable used to start the standards RAG server |
| `DSH_STANDARDS_RAG_ARGS` | Space-separated arguments passed to the server |

Both default to a documented placeholder (`standards-rag-mcp-server`, no arguments), so a deployment that has not configured a server still boots. `failOnStartupError` stays `false` and reconnect is off: an unreachable RAG server fails once, stays silent, and never blocks file, cost, or schedule work. `apps/cli/config/examples/construction/cordis.yml` shows the same rows as an opt-in overlay.

### Skill isolation

The four business Skills ship inside the runtime package and register through its own bundled read-only skills provider. The patch restates the `skill-filesystem` row with `includeDefaultRoots: false`, so project and user skill roots are not scanned and the catalog carries only the bundled business Skills. Because a patch replaces a row's whole `config`, the restated config carries every other schema field at its plugin default.

### Disabled rows

Model-facing arbitrary execution stays off; each disabled row and its reason:

| Row | Reason |
|---|---|
| `tool-bash` / `tool-pwsh` | Arbitrary shell is out of scope for the engineering file/cost/schedule surface |
| `tool-workflow` | Arbitrary workflow scripting is out of scope |
| `workflow-ptc` / `ptc-runtime` | Arbitrary code execution is out of scope |

The `web` and `tool-web` rows from base stay enabled: `web_search` and `web_fetch` remain available.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package's substance is [`cordis.patch.yml`](cordis.patch.yml), declared by the `dsh.bundle.patch` manifest field; [`src/index.ts`](src/index.ts) carries no runtime API.

### Patch surface over base

The patch inserts the `construction-runtime` Host row with plugin defaults, the `ui-construction-gantt` client roster row (the package's `dsh.client` manifest marks it; without a Web surface its node half is an empty apply), and the `standards-rag` MCP row. It restates `skill-filesystem` for isolation and disables the five arbitrary-execution rows listed above. Base supplies everything else: model adapters, session persistence, skills registry, permission and sandbox policy, and the web tools.

No runtime invariant companion is published: the bundle carries only a composition patch, and every runtime contract belongs to the composed packages.

</details>

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the [runtime README](../../construction/construction-runtime/README.md) it composes, which owns the tool catalog, the business-task binding rule, and the prompt-section effects.

#### KV Cache effect

The patch adds no request-prefix content of its own; the runtime's system-prompt section is emitted only while a construction tool is registered.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Standards RAG ships unconfigured** — the MCP server command is a placeholder until the deployment sets `DSH_STANDARDS_RAG_COMMAND`; until then no `mcp__standards__*` tools register, by design.
- **Skill catalog is isolated** — with `includeDefaultRoots: false`, project and user skill roots no longer contribute; deployments wanting local Skills must mount another provider explicitly.
- **Client row without a Web surface does nothing** — the Gantt tab appears only in a profile that also composes the Web modules roster.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
