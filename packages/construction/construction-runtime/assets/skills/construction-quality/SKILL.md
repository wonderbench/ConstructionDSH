---
name: construction-quality
description: Check measured quality data against material and test records for stated inspection objects, samples, and acceptance requirements. Use when a task asks about inspection lots, test results, nonconformities, or quality evidence gaps (质量验收、检验批、试块/试验记录、不合格项). Not for certifying conformity or reporting a passing result the evidence does not support.
---

# Construction quality review

This skill is a procedure. Acceptance criteria and standard clauses stay in
the standards retrieval source; retrieve them only when the user asks for
normative backing.

## Inputs required

- The inspection object (element, lot, or sample set).
- The supplied measurement, material, and test files and each file's role.
- The acceptance requirement and unit of measurement for each checked
  property — a hard blocker: without it every property is `unverifiable`.
- Whether the user wants normative backing from standards retrieval.

## Scope and basis

Open every deliverable with a scope-and-basis statement: files reviewed
(name and version) and their coverage states, plus the criteria source
(design documents, standards, contract, or supervision rules — with
version). Every file cited later must appear there with its `SourceRef`.

## Evidence tags

Every conclusion carries exactly one tag: `read` (read from a file, with
`SourceRef`), `stated` (user-supplied, not file-backed), `assumed` (your
assumption), or `proposed` (your recommendation).

## Workflow

1. Inspect every supplied file with `construction_files_inspect` before
   reading. Treat `partial`, `needs_review`, and `needs_visual_read` coverage
   as evidence gaps: record them as unresolved items, never as fully-read evidence.
2. Identify the inspection object, the units of measurement, and the
   acceptance requirement for each checked property. Record the requirement's
   provenance (design document, standard, contract, or supervision rule, with
   version). When no basis is found, the property is `unverifiable`; never
   set your own threshold.
3. Read the supplied files with `construction_files_read` or
   `construction_files_search`. A PDF above the size limit must first be
   split with `construction_pdf_split` (`range`, `per_page`, or `bookmark`);
   the `structure` and `mineru` modes return `unsupported` in this release.
   Record a `SourceRef` for every measurement and test record.
4. Retrieve clauses with the standards retrieval tools available in the
   session (an optional integration; tool names vary by deployment) only when
   the user asks for normative backing or the applicability of a requirement
   is in doubt. If retrieval is unavailable or disconnected, record the
   clause need as an unresolved item and never quote a standard, clause
   number, or threshold from memory.
5. Run the metadata checklist for the inspection lot (检验批): lot division,
   sample counts, witnessed sampling, curing age, specimen group counts, and
   batch/heat numbers traceable.
6. Compare measured data against material and test records property by
   property, stating the judgement rule and its source (statistical vs
   non-statistical, one-sided vs two-sided limits, rounding rule). Keep
   BOQ-style codes as text and never treat a blank cell as a zero.
7. Report each property as `conforms`, `nonconforms`, `unverifiable`, or
   `not_applicable`; report missing evidence, contradictions between sources,
   and nonconformities against the stated requirement.
8. Propose review actions — retest, rework, repair, concession (让步), scrap —
   without converting them into accept/reject decisions; concession decisions
   belong to the owner or supervision.
9. List unresolved items in the five-part format, then export with
   `construction_report_export` (`kind: 'document'`). Its data is a document
   summary `{schema_version: 1, summary, sections}` using only the quality
   section names `checks`, `evidence`, `nonconformities`, `unresolved` —
   the template headings below are exactly these `sections` keys.

Ask the user when the basis is ambiguous, units are unclear, a key file is
missing pages or is encrypted, or no acceptance basis exists; otherwise
proceed, registering each assumption as `assumed` — and as an unresolved
item when it blocks a conclusion. Loading another business skill supersedes
this task binding and stale task ids stop working: finish and export the
current domain's results before crossing domains.

## Outputs

Produce: checked properties with their requirement, measured value, and
`SourceRef`; missing evidence; contradictions; nonconformities; and review
actions. Write the response and the produced tables in the user's language;
keep item codes, units, and numeric precision verbatim from the source,
showing any conversion as a separate expression (for example `1 t = 1000
kg`), and give each domain term at first use as a Chinese-English pair, e.g.
检验批 (inspection lot). The format below is authoritative; bundled template
files of the same content exist only for reference — do not try to read
template files from disk.

Every unresolved item uses the five-part format `object | what is missing |
which conclusion it blocks | who must supply it | SourceRef where the gap
was found`.

### Output format

```markdown
# Quality review — {{inspection_object}}

Requirement source: {{requirement, with SourceRef}}

Checked {{n}} properties: {{x}} conform, {{y}} nonconform, {{z}} unverifiable, {{w}} not applicable

## Checks

| Property | Requirement | Measured / recorded | SourceRef | Result |
|---|---|---|---|---|
| {{property}} | {{requirement}} | {{value}} | {{file, sheet/cell or page}} | {{conforms / nonconforms / unverifiable / not_applicable}} |

## Evidence

- {{property with no readable record}}
- Metadata: {{lot division, sample counts, witnessed sampling, curing age, specimen groups, batch/heat numbers}}

## Nonconformities

- {{nonconformity}} → {{retest / rework / repair / concession / scrap — advice only}}

## Unresolved items

- {{object | what is missing | which conclusion it blocks | who must supply it | SourceRef}}

This review records evidence and gaps; it is not a certificate of conformity.
```

## Before you finish

- Every finding traces to a `SourceRef` with its original value.
- Every blank or missing input is an unresolved item, never folded to zero.
- Every cited file appears in the basis with its `SourceRef`.
- Summary counts agree with the detail tables.
- Every `conforms` result has a readable measurement behind it.
- Re-read Prohibited behavior and confirm none applies.

## Prohibited behavior

- Do not report a passing result where measurements are missing or unreadable.
- Do not fabricate test values, sample counts, or acceptance criteria.
- Do not average away, merge batches across lots, or substitute
  representative specimens for missing records; report each nonconforming
  reading with its SourceRef.
- Do not adopt amounts or values from unevaluated spreadsheet formula caches
  (`formula_cache` state); record the cell as unread evidence instead.
- Do not report `unverifiable` as conforms.

See `fixtures/` for one normal and one exceptional de-identified example of
inputs and the expected output shape.
