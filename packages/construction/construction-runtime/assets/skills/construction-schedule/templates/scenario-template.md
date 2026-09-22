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
