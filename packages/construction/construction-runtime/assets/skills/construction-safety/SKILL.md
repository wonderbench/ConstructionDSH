---
name: construction-safety
description: Compare safety risk evidence, existing controls, and missing inputs for a stated construction activity and location. Use when a task asks about hazards, risk controls, safety inspection findings, or safety compliance gaps (安全隐患、风险管控、安全检查). Not for issuing work permits, safety approvals, or statements that an activity is safe to proceed.
---

# Construction safety review

This skill is a procedure. Standards and regulation text stay in the standards
retrieval source; do not copy clause text here and do not quote a standard
unless it was retrieved in this session.

## Inputs required

- The construction activity to review — a hard blocker with the location: no findings are possible without both.
- The work location or zone.
- The coverage the user wants reviewed.
- Any supplied evidence files (inspection records, registers, photos
  described in text) and each file's role.

## Scope and basis

Open every deliverable with a scope-and-basis statement: files reviewed
(name and version) and their coverage states, plus the criteria source
(regulations, standards, or the user's stated criteria). Every file cited
later must appear there with its `SourceRef`.

## Evidence tags

Every conclusion carries exactly one tag: `read` (read from a file, with
`SourceRef`), `stated` (user-supplied, not file-backed), `assumed` (your
assumption), or `proposed` (your recommendation).

## Severity criteria

high — credible potential for fatality or structural collapse, or no effective
control present; medium — a control exists but has no recorded evidence, or does
not match the stated activity; low — control present and evidenced, residual issue
procedural. Apply these exactly to every finding.

## Workflow

1. Establish the activity, the work location or zone, and the coverage the
   user wants reviewed. Ask only when an answer changes the findings.
2. Identify hazards with a matrix over work steps × 人 (people), 机 (machinery),
   料 (materials), 法 (method), 环 (environment), 管 (management).
3. Inspect every supplied file with `construction_files_inspect` before reading.
   Treat `partial`, `needs_review`, and `needs_visual_read` coverage as evidence
   gaps: record them as unresolved items, never as fully-read evidence.
4. Read the supplied files with `construction_files_read` or
   `construction_files_search`. A PDF above the size limit must first be
   split with `construction_pdf_split` (`range`, `per_page`, or `bookmark`);
   the `structure` and `mineru` modes return `unsupported` in this release.
   Record a `SourceRef` for every piece of evidence you rely on.
5. Retrieve clauses with the standards retrieval tools available in the
   session (an optional integration; tool names vary by deployment) only when
   the user asks for normative backing or the applicability of a control is in
   doubt. Cite each clause as standard number + clause + edition + retrieval
   source + retrieval time. If retrieval is unavailable or disconnected,
   record the clause need as an unresolved item and never quote a standard,
   clause number, or threshold from memory.
6. Assess each hazard: assign severity per the criteria above; order
   controls elimination → substitution → engineering controls →
   administrative controls → PPE, each marked 已有 (existing) or 建议
   (proposed); separate facts, recommendations, and assumptions using the
   four tags. Rate residual risk only when recorded evidence exists for
   every contributing control.
7. Treat 危大工程 (dangerous sub-item project) determination as a
   to-confirm question for the responsible parties: whether the activity
   falls under 危大 or 超规模危大 (oversized) and whether a special scheme
   or expert review is needed — never your conclusion.
8. List unresolved items in the five-part format, then export with
   `construction_report_export` (`kind: 'document'`). Its data is a document
   summary `{schema_version: 1, summary, sections}` using only the safety section
   names `issues`, `evidence`, `controls`, `unresolved` — the template headings
   below are exactly these `sections` keys.

Ask the user when the basis is ambiguous, a key file is missing pages or is encrypted,
or no acceptance basis exists; otherwise proceed, registering each assumption as
`assumed` — and as an unresolved item when it blocks a conclusion. Loading another
business skill supersedes this task binding and stale task ids stop working: finish
and export the current domain's results before crossing domains.

## Outputs

Produce: a list of issues (each with severity, evidence, and `SourceRef`),
the evidence considered, proposed controls that are not yet in place, and
the unresolved items. Write the response and the produced tables in the
user's language; keep item codes, units, and numeric precision verbatim from
the source, showing any conversion as a separate expression (for example
`1 t = 1000 kg`), and give each domain term at first use as a
Chinese-English pair, e.g. 危大工程 (dangerous sub-item project). The format below
is authoritative; bundled template files of the same content exist only for
reference — do not try to read template files from disk.

Every unresolved item uses the five-part format `object | what is missing | which
conclusion it blocks | who must supply it | SourceRef where the gap was found`.

### Output format

```markdown
# Safety issue list — {{activity}} at {{location}}

Coverage: {{coverage_statement}}

Checked {{n}} findings: {{h}} high, {{m}} medium, {{l}} low, {{z}} unverifiable

## Issues

| # | Severity | Issue | Evidence (SourceRef) | Proposed control |
|---|---|---|---|---|
| 1 | {{high/medium/low}} | {{description}} | {{file, page/paragraph}} | {{control}} |

## Evidence

- {{evidence considered, with SourceRef and read/stated tag}}

## Controls

- {{control ordered elimination → substitution → engineering → administrative → PPE, marked 已有 (existing) or 建议 (proposed)}}

## Unresolved items

- {{object | what is missing | which conclusion it blocks | who must supply it | SourceRef}}

Facts, recommendations, and assumptions are stated separately above; this list
does not authorize work and is not a work permit.
```

## Before you finish

- Every finding traces to a `SourceRef` with its original value.
- Every blank or missing input is an unresolved item, never folded to zero.
- Every cited file appears in the basis with its `SourceRef`.
- Summary counts agree with the detail tables.
- Every severity assignment matches the stated criteria.
- Re-read Prohibited behavior and confirm none applies.

## Prohibited behavior

- Do not issue, imply, or draft a work permit, safety approval, or a
  statement that an activity is safe to proceed.
- Do not fabricate measurements, inspection records, or standard clauses.
- Do not rate residual risk as acceptable without recorded evidence for every
  contributing control.
- Do not rate unverifiable evidence as no-risk.
- Do not hide a single nonconforming value by averaging, rounding, or
  interval selection.

See `fixtures/` for one normal and one exceptional de-identified example of
inputs and the expected output shape.
