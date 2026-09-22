---
name: construction-cost
description: Run the unit-rate, tender, variation, or settlement cost workflow on user-supplied BOQ data with explicit rates and fee rules. Use when a task asks for rate build-ups, tender comparisons, variation valuation, or settlement difference checks (清单组价、综合单价、投标比价、变更签证、结算对账). Not for inventing prices, consumption figures, or fee rates without user-supplied data.
---

# Construction cost calculation

This skill is a procedure. Quota tables and price libraries are not bundled;
every price, consumption, and fee rule must come from the user or the files.

## Inputs required

- The BOQ or price files (.docx/.xlsx/.pdf) and the role of each file.
- The variant: `unit_rate`, `tender`, `variation`, or `settlement`.
- Unit prices, resource consumptions, and fee rates/bases — a hard blocker:
  no priced conclusion is possible without them.
- The currency and, for `tender` or `settlement`, the priced baseline.

## Scope and basis

Open every deliverable with a scope-and-basis statement: files reviewed (name
and version) and their coverage states, plus the working basis (declared
precision, currency, units). Every file cited later must appear there with its `SourceRef`.

## Evidence tags

Every conclusion carries exactly one tag: `read` (read from a file, with `SourceRef`),
`stated` (user-supplied, not file-backed), `assumed` (your assumption), or `proposed` (your recommendation).

## Variant selection

| Variant | Use when |
|---|---|
| `unit_rate` | Building up a rate from resources when no priced baseline exists |
| `tender` | Comparing against a priced baseline |
| `variation` | Valuing a changed quantity or a new rate |
| `settlement` | Comparing settlement amounts against contract and change records |

Fee rates apply only to the resource cost (`base: 'resources'`); convert any
other fee base into an explicit rate on the resource cost before calculating.

## Workflow

1. Inspect every supplied file with `construction_files_inspect` before reading.
   Treat `partial`, `needs_review`, and `needs_visual_read` coverage as evidence
   gaps: record them as unresolved items, never as fully-read evidence.
2. Select the variant (table above) and identify the role of each supplied
   file before reading values.
3. Read BOQ data with the construction file tools. A PDF above the size
   limit or a drawing set must first be split with `construction_pdf_split`
   (`range`, `per_page`, or `bookmark`); the `structure` and `mineru` modes
   return `unsupported` in this release. Keep item codes as text, preserve
   units, and never treat a blank cell as zero.
4. First produce a field-mapping confirmation table (original column/field →
   code, description, unit, quantity, consumption, unit_price, fee) and
   present it; state any ambiguous mapping as an assumption.
5. Calculate with `construction_cost_calculate`. For tender and settlement,
   supply the baseline items so the difference table can be produced.
6. Run the common-error checklist, confirming each item or registering it
   unresolved: unit consistency; wastage/loss rates; fee base correctness;
   provisional prices and owner-supplied materials (暂估价 / 甲供材) priced
   separately; duplicate codes; tax-inclusive vs tax-exclusive basis;
   precision and rounding direction.
7. Compare scenarios with `construction_cost_compare`, then freeze the
   adopted result with `construction_cost_export` (the full trace report
   with expressions). When only selected sections are wanted,
   `construction_report_export` with `kind: 'cost'` renders a task-filtered
   report from the frozen result instead. When any of these calls takes a
   frozen result, pass back the frozen JSON block from the calculate
   output verbatim — never retype, round, or edit its values; if the block
   is unavailable (for example truncated), recalculate instead of
   reconstructing it.
8. For `tender` and `settlement`, decompose each `quantity_diff` and
   `price_diff` row of the frozen difference table that carries the
   `quantity_effect` (ΔQ × baseline unit rate) and `price_effect` fields:
   show both expressions and state that they reconcile exactly with the
   row's `difference`. A differing row without those fields (a side
   missing quantity or unit rate) is an unresolved item, not a guessed
   decomposition.

Ask the user when the basis is ambiguous, units are unclear, or a key file
is missing pages or is encrypted; otherwise proceed, registering each
assumption as `assumed` — and as an unresolved item when it blocks a
conclusion. Loading another business skill supersedes this task binding and
stale task ids stop working: finish and export the current domain's results
before crossing domains.

## Outputs

Produce: the analysis or difference table with expressions and totals, the
fee lines with their bases and rates, the evidence (file `SourceRef`s)
behind each price, and the unresolved items. Write the response and the
produced tables in the user's language; keep item codes, units, and numeric
precision verbatim from the source, showing any conversion as a separate
expression (for example `1 t = 1000 kg`), and give each domain term at
first use as a Chinese-English pair, e.g. 综合单价 (composite unit rate).
The formats below are authoritative; bundled template files of the same content
exist only for reference — do not try to read template files from disk.

Every unresolved item uses the five-part format `object | what is missing | which
conclusion it blocks | who must supply it | SourceRef where the gap was found`.

### Analysis format (calculator result)

```markdown
# Cost analysis — {{variant}} workflow

Currency: {{currency}} (declared precision applies)

Checked {{n}} items: {{x}} fully priced, {{y}} unresolved, total {{amount}}

## Items

| Code | Description | Unit | Quantity | Resource cost | Fees | Unit rate | Amount | Expressions |
|---|---|---|---|---|---|---|---|---|
| {{code}} | {{description}} | {{unit}} | {{quantity}} | {{resource_cost}} | {{fee lines}} | {{unit_rate}} | {{amount}} | {{consumption × price traces}} |

## Totals

- Resources: {{total}}
- Fees: {{total}}
- Amount: {{grand total}}

## Unresolved items

- {{object | what is missing | which conclusion it blocks | who must supply it | SourceRef}}

This analysis is not a quotation, a settlement agreement, or a claim basis.
Amounts are recomputed by the deterministic calculator, never copied from
formula caches.
```

### Difference format (comparison)

```markdown
# Cost difference — {{scenario_a}} vs {{scenario_b}}

Compared {{n}} items: {{x}} matching, {{y}} differing, {{z}} only in one scenario, total difference {{amount}}

| Code | Description | {{a_label}} | {{b_label}} | Difference | Effects | Status |
|---|---|---|---|---|---|---|
| {{code}} | {{description}} | {{amount_a}} | {{amount_b}} | {{delta}} | {{quantity_effect}} + {{price_effect}} | {{matching / price_diff / quantity_diff / only_in_a / only_in_b}} |

## Items requiring confirmation

- {{object | what is missing | which conclusion it blocks | who must supply it | SourceRef}}

Differences are computed from frozen calculator outputs, not from spreadsheet
formula caches; quantity_effect + price_effect reconciles exactly with each
row's difference.
```

## Before you finish

- Every amount traces to an expression; every price to a `SourceRef` with
  its original value.
- Every blank or missing input is an unresolved item, never folded to zero.
- Every cited file appears in the basis with its `SourceRef`.
- Summary counts agree with the detail tables.
- Duplicate codes, unit consistency, and tax basis (inclusive vs exclusive) are confirmed or unresolved.
- Re-read Prohibited behavior and confirm none applies.

## Prohibited behavior

- Do not invent prices, consumption figures, or fee rates; a missing input is
  an unresolved item, not a zero.
- Do not present a tender submission, settlement agreement, or approval; this
  analysis is not a quotation, a settlement, or a claim basis.
- Do not adopt amounts from unevaluated spreadsheet formula caches; the
  calculator recomputes authoritative amounts.
- Do not report an unresolved item as priced at zero.
- Do not hide a single nonconforming value by averaging, rounding, or
  interval selection.

See `fixtures/` for one normal and one exceptional de-identified example of
inputs and the expected output shape.
