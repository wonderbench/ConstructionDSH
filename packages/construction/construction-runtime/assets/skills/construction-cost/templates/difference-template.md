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
