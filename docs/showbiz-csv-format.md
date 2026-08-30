# ShowBiz "SAG Cards Export" CSV format

Notes from `ShowBiz_SAG_Cards_Anonymized_042826.csv` (414 cards), used by
the weekly-contract test bench. The bundled copy is anonymized: performer
names, studios and role lines are blank and production titles read "Real
Life Example NN" — the figures are untouched. Examples below use fictional
values in those columns.

- **Encoding**: UTF-16 (LE, with BOM). Convert before parsing.
- **Rows**: one SAG card per line, `\n` separated, **280 columns, no header row**.
- **Multi-day fields**: several columns pack one value per worked day into a
  single field, separated by **ASCII Group Separator `\x1d` (0x1D)**, often
  with leading/trailing empty entries. Example: `\x1d\x1d\x1d11.00\x1d8.50\x1d\x1d`
  means two worked days at 11.00 and 8.50 hours.

## Columns that carry data

| Idx | Meaning | Example |
| --- | --- | --- |
| 9 | Card sequence number | `1` |
| 12 | Card id | `S770` |
| 54 / 57 | Performer first / last name | `Sam` / `Sample` |
| 100–103 | Payroll co., production co., project | `Media Services`, `Surfer's Paradise` |
| 142 | Contract category | `A: Daily Performer`, `B: TV` |
| 157 | Week-ending / card date | `February 26, 2021` |
| 158 | Studio | `Example Studios New York` |
| 159 | Production title | `Real Life Example 03` |
| 182 | **Employment type** | `Day Player`, `3 Day Player`, `Weekly Player` |
| 183 | Weekly-overtime hours (1.5x) | `6.00` |
| 184 | Contract type | `TV`, `Theatrical` |
| 185 | Guaranteed hours | `8.00` (daily), `44.00` / `48.00` (weekly) |
| 188 | Contract rate | `$1,912.00` |
| 189 | Derived day/hour rate | `$239.00` |
| 190 | Adjustment amount, added **after** the subtotal | `$260.00` |
| 191 / 192 | 6th / 7th day flags | `6th Day`, `7th Day` |
| 194 | Extra items | `Covid Test`, `Fitting`, `Loc Allowance` |
| 196 | Role description | `Stunt Double: Lead` |
| 200 | SAG category | `H: Stunt Performer`, `K: Stunt Coordinator` |
| 201 | Studio / Distant | `Studio` |
| 202 | **Per-day stunt adjustments** (multi-day) | `100.00` — the week's figure is their sum |
| 205 / 206 / 207 | Daily-overtime (1.5x) / double-time (2x) / penalty (1.5x) hours | `1.60`, `6.70` |
| 209 | Gross total | `$2,810.00` |
| 211 | Subtotal before adjustments | `$2,550.00` |
| 214 | Base scale rate | `$1,030.00` |
| 252 | **Dates worked** (multi-day) | `2/23`, `2/24` |
| 253 | Days worked count | `2` |
| 257 | **Hours worked per day** (multi-day) | `11.00`, `8.50` |
| 260 / 266 / 271 | Per-day time values (multi-day) | `16.75`, `17.50` |
| 276 | **Day codes** (multi-day) | `SW`, `WF` — Start / Work / Finish |

`Weekly Player` rows with 44.00 or 48.00 guaranteed hours are the cases the
weekly calculation must reproduce.

Two adjustment columns are easy to confuse, and swapping them still yields a
plausible gross: **202** is the per-day stunt adjustment that feeds the
overtime rate and the 6th/7th-day premiums, while **190** is allowances and
meal penalties added after the subtotal. `src/lib/weekly/from-showbiz.ts`
maps a parsed card onto the weekly engine and is the one place that mapping
is written down in code.
