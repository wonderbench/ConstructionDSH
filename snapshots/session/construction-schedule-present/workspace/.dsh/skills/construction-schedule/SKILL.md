---
name: construction-schedule
description: Build and calculate a CPM schedule from tasks, working-day durations, finish-to-start links, and one project working calendar. Use when a task asks for duration checks, float, the critical path, or a Gantt chart of an engineering schedule (进度计划、关键线路、工期、横道图/甘特图). Not for reading dates off Gantt images or colored spreadsheets as calculated results.
---

# Construction schedule calculation

This skill is a procedure. The calculator, not a chart image, owns the dates.

## Inputs required

- The task list (or the schedule file to extract it from): stable unique
  ids, names, and durations.
- The links between tasks, or a statement that logic is missing.
- The working calendar: weekly rest days and the holiday list — a hard
  blocker: no dates are possible without it.
- Locked dates for completed work, if any.

## Scope and basis

Open every deliverable with a scope-and-basis statement: files reviewed
(name and version) and their coverage states, plus the working basis (the
calendar, with its source). Every file cited later must appear there with
its `SourceRef`.

## Evidence tags

Every conclusion carries exactly one tag: `read` (read from a file, with
`SourceRef`), `stated` (user-supplied, not file-backed), `assumed` (your
assumption), or `proposed` (your recommendation).

## Workflow

1. If tasks or calendars come from supplied files, inspect every file with
   `construction_files_inspect` before reading. Treat `partial`,
   `needs_review`, and `needs_visual_read` coverage as evidence gaps: record
   them as unresolved items, never as fully-read evidence. A PDF above the
   size limit or a drawing set must first be split with
   `construction_pdf_split` (`range`, `per_page`, or `bookmark`); the
   `structure` and `mineru` modes return `unsupported` in this release.
2. Extract or define tasks: stable unique ids, names, whole-working-day
   durations (zero-duration milestones allowed), and locked dates for
   completed work. Record the source and as-of date of every locked
   start/finish.
3. Define links as finish-to-start with an explicit nonnegative working-day
   lag. Start-to-start, finish-to-finish, start-to-finish links and negative
   leads are unsupported: report them, never rewrite them as finish-to-start,
   and state their impact in the conclusion — the critical path is not
   claimed and the dates are for reference only.
4. State the working calendar with its source (user or configuration): weekly
   rest days and the holiday list. Dates are calendar ISO dates; all arithmetic
   is in working days. Working-day durations differ from contract calendar days;
   state the conversion when both appear.
5. Validate before calculating: unique ids, no dangling link references, no
   cycles, no constraint conflicts, no missing fields. Fix or report each
   rejection.
6. Check logic completeness before claiming a critical path: no dangling
   tasks; one open start and one closed end (no open network mouths);
   milestones present; cross-discipline interfaces linked; correspondence to
   contract milestones.
7. Calculate with `construction_schedule_calculate`. A critical path
   (关键线路) is claimed only when the logic is complete; with missing
   logic the result still reports dates and float but leaves the critical
   path empty and says why. The result reports total float only, in whole
   working days; total float 0 marks the critical path. Free float is not
   computed in this release, and negative float cannot occur because
   constraint conflicts are rejected as invalid — never report either.
8. Present the result with `construction_schedule_present` so the Gantt
   chart can render it. A revision creates a new scenario id and states the
   differences from the previous version (start/finish changes, float
   changes, critical-path change); never overwrite a calculated scenario.
   To keep a task-filtered written report, optionally export with
   `construction_report_export` (`kind: 'schedule'`) using the frozen
   `ScheduleResult` as data. When either call takes the frozen result,
   pass back the frozen JSON block from the calculate output verbatim —
   never retype or edit its values; if the block is unavailable (for
   example truncated), recalculate instead of reconstructing it.

Ask the user when the basis is ambiguous, units are unclear, or a key file
is missing pages or is encrypted; otherwise proceed, registering each
assumption as `assumed` — and as an unresolved item when it blocks a
conclusion. Loading another business skill supersedes this task binding and
stale task ids stop working: finish and export the current domain's results
before crossing domains.

## Outputs

Produce: the `ScheduleResult` (tasks with start/finish dates, total float,
critical flags, milestones, and locked states), the link table, the critical
path when claimed, assumptions, and unresolved items. Write the response and
the produced tables in the user's language; keep item codes, units, and
numeric precision verbatim from the source, showing any conversion as a
separate expression (for example `1 t = 1000 kg`), and give each domain
term at first use as a Chinese-English pair, e.g. 关键线路 (critical path).
The format below is authoritative; bundled template files of the same
content exist only for reference — do not try to read template files from
disk.

Every unresolved item uses the five-part format `object | what is missing | which
conclusion it blocks | who must supply it | SourceRef where the gap was found`.

### Output format

```markdown
# Schedule scenario {{scenario_id}}

Calendar: rest days {{weekly_rest_days}}; holidays {{holidays}} (source: {{calendar_source}})

{{n}} tasks, critical path {{claimed / not claimed}}, duration {{days}} working days

## Tasks

| ID | Name | Duration (wd) | Start | Finish | Total float | Critical |
|---|---|---|---|---|---|---|
| {{id}} | {{name}} | {{duration}} | {{start}} | {{finish}} | {{float}} | {{yes/no}} |

## Logic

- Links: {{from -> to, lag}}
- Critical path: {{path or "not claimed — logic incomplete"}}

## Assumptions and unresolved items

- {{assumption or unresolved item in the five-part format}}

Calculated dates use inclusive-start/exclusive-finish working-day boundaries;
the displayed finish is the last working date before the finish boundary.
Calculated dates are not a duration commitment and do not replace contractual
dates.
```

## Before you finish

- Every date and float traces to the frozen `ScheduleResult`; every input
  value traces to a `SourceRef` or a `stated` tag.
- Every blank or missing input is an unresolved item, never folded to zero.
- Every cited file appears in the basis with its `SourceRef`.
- Summary counts agree with the detail tables.
- The critical path is claimed only with complete logic, and only total
  float is reported.
- Re-read Prohibited behavior and confirm none applies.

## Prohibited behavior

- Do not invent a critical path when relationships are missing.
- Do not import dates from a Gantt image or a colored spreadsheet as
  calculated results.
- Do not convert unsupported link types into finish-to-start links silently.
- Do not present dates from incomplete logic as a duration commitment, and
  do not report free float or negative float values.

See `fixtures/` for one normal and one exceptional de-identified example of
inputs and the expected output shape.
