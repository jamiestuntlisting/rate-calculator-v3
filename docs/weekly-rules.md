# SAG-AFTRA **Weekly Player** gross-pay rules

Reverse-engineered from `ShowBiz_SAG_Cards_Export_042826.csv` (the "SAG Cards
Export", 414 cards, 280 columns, no header — see `showbiz-csv-format.md` for the
file format). This document covers only the **133 cards with column 182 =
`Weekly Player`**.

**Result: the formula below reproduces column 209 (GROSS) exactly — to the cent —
on 132 of 133 weekly cards (99.2%).** It also reproduces column 211 (subtotal) on
the same 132. The single miss is a malformed card (`S1234`, see
[Unexplained cases](#unexplained-cases)).

---

## 1. The model in one sentence

A weekly card is a fixed **10-slot line-item table**. Every slot is
`amount = units x rate x multiplier`. The subtotal (211) is the sum of the ten
slots; the gross (209) is the subtotal plus the adjustment column (190).

```
209 (GROSS)    = 211 + 190
211 (subtotal) = round( sum of the 10 slot amounts , 2 )
```

Verified: `sum(col 247) == col 211` and `col 211 + col 190 == col 209` on all
133 cards. (`col 197` mirrors 211 and `col 152` mirrors 209 — 0 mismatches.)

---

## 2. Inputs

| Symbol | Column | Meaning | Notes |
| --- | --- | --- | --- |
| `SCALE` | **214** | Applicable weekly base/scale rate | e.g. `$3,936.00`, `$4,646.00` |
| `CONTRACT` | **188** | Negotiated contract weekly rate | `$4,400.00` or `$5,500.00` in this file |
| `GH` | **185** | Guaranteed hours | `44.00` Studio / `48.00` Distant |
| `A` | **202** | Per-day stunt **adjustments** (multi-day array) | `A = sum(202)` |
| `D` | **253** | Days on the card | equals `len(252)` and `len(276)` on all 133 |
| `HOLcount` | **276** | count of day-code tokens equal to `HOL` | |
| `H15w` | **183** | Weekly-overtime hours (paid at 1.5x) | max observed 6.00 |
| `H15d` | **205** | Daily-overtime hours (paid at 1.5x) | |
| `H20` | **206** | Double-time hours (paid at 2.0x) | |
| `H15p` | **207** | Penalty/second-1.5x-bucket hours | derives from per-day array 212 |
| `EXTRA` | **194** | Extra item: `Loc Allowance` or `HOLIDAY` | blank on 122 of 133 |
| `SIXTH` | **191** | `6th Day` flag | present on 41 |
| `SEVENTH` | **192** | `7th Day` flag | present on 24 |
| `ADJ` | **190** | Adjustments added after the subtotal | `= 218 + 229` |

`185` and `201` are perfectly correlated: `44.00 <-> Studio` (112 cards),
`48.00 <-> Distant` (21 cards).

---

## 3. The formula

### 3.1 Derived rates

```
DAILY  = SCALE / 5                       # a day of the weekly guarantee
H      = min(CONTRACT, SCALE + A) / 44   # the overtime hourly rate
```

The **/44 divisor is constant** — it is *not* the guaranteed-hours column.
Distant cards (`GH = 48.00`) still divide by 44 (confirmed on all 21).
Equivalently `H = min(col189, (col214 + A) / 44)`, since **`col 189 = col 188 / 44`**
on all 133 cards (see §6).

`H` matched the rate actually stored in column 246 on **101 of 102** rate
observations; the one exception is slot 5 of `S1235`, which is a flat amount, not
an hourly rate.

### 3.2 Base proration factor

```
FACTOR = min(D, 5) / 5  +  0.20 * HOLcount
```

Days 6 and 7 do **not** raise `FACTOR` — they are paid through slots 8/9.
`FACTOR` is stored verbatim in `col 248[0]` (0 mismatches / 133).

Observed values: `1.0` (129 cards), `0.8` (D=4), `0.2` (D=1), `1.2` (D>=5 with one
`HOL` day, 2 cards).

### 3.3 Overtime absorption for heavily-adjusted weeks

```
ABSORB_15W = (SCALE + A) >= CONTRACT + 9 * H       # 9 = 6 hrs x 1.5
```

When true, the **1.5x weekly-overtime slot is dropped entirely** while the 2.0x
slot is still paid in full. This is the classic over-scale credit: extra weekly
compensation is credited against straight overtime but never against double time.
See [Unexplained cases](#unexplained-cases) for how tightly this threshold is
pinned by the data.

### 3.4 The ten slots

| Slot | Term | units | rate | mult | Amount | Emitted when |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Weekly base | 1.00 | `SCALE` | `FACTOR` | `SCALE * FACTOR` | always |
| 1 | Daily OT | `col 205` | `H` | 1.50 | `205 * H * 1.5` | `205` set (50 cards) |
| 2 | Double time | `col 206` | `H` | 2.00 | `206 * H * 2.0` | `206` set (60 cards) |
| 3 | Penalty OT | `col 207` | `H` | 1.50 | `207 * H * 1.5` | `207` set (11 cards) |
| 4 | Weekly OT | `col 183` | `H` | 1.50 | `183 * H * 1.5` | `183` set **and not** `ABSORB_15W` (31 cards) |
| 5 | Extra (`col 194`) | see below | see below | 1.00 | see below | `194` non-blank (10 cards) |
| 6 | *(never used)* | | | | | — |
| 7 | Adjustments | 1.00 | `A` | 1.00 | `A` | `A > 0` (86 cards) |
| 8 | 6th day | 1.00 | `0.3*SCALE + 0.1*A` | 1.00 | `0.3*SCALE + 0.1*A` | `col 191 = "6th Day"` (41 cards) |
| 9 | 7th day | 1.00 | `0.4*SCALE + 0.2*A` | 1.00 | `0.4*SCALE + 0.2*A` | `col 192 = "7th Day"` (24 cards) |

Slot 5 by extra type:

| `col 194` | Amount | Reading |
| --- | --- | --- |
| `Loc Allowance` | `4.00 * H * 1.00` | the 4 hours by which the 48-hour Distant guarantee exceeds the 44 hours the weekly rate buys, at straight time. Occurs only on Distant/48 cards (9 of 21). |
| `HOLIDAY` | `DAILY` (`= SCALE / 5`) | one extra day at scale. |

6th/7th day check: `0.3*SCALE = 1.5 * DAILY` and `0.4*SCALE = 2.0 * DAILY`, i.e.
**6th day = time-and-a-half of a day, 7th day = double a day**, plus `0.5` /
`1.0` of `A/5` respectively (the premium portion of the daily adjustment; the
straight portion is already paid in slot 7). Verified on all 41 + 24 cards,
including the 4 cards where a 7th day is flagged without a 6th day.

### 3.5 Reference implementation

```python
def weekly_gross(c):
    SCALE, CONTRACT = c.col214, c.col188
    A      = sum(c.col202)                          # per-day adjustments
    DAILY  = SCALE / 5
    H      = min(CONTRACT, SCALE + A) / 44
    FACTOR = min(c.col253, 5) / 5 + 0.20 * c.col276.count('HOL')
    absorb = (SCALE + A) >= CONTRACT + 9 * H

    items = [
        SCALE * FACTOR,                             # 0 base
        c.col205 * H * 1.5,                         # 1 daily OT
        c.col206 * H * 2.0,                         # 2 double time
        c.col207 * H * 1.5,                         # 3 penalty OT
        0.0 if absorb else c.col183 * H * 1.5,      # 4 weekly OT
        {'Loc Allowance': 4.0 * H,                  # 5 extra
         'HOLIDAY':       DAILY}.get(c.col194, 0.0),
        0.0,                                        # 6 unused
        A,                                          # 7 adjustments
        0.3 * SCALE + 0.1 * A if c.col191 else 0.0, # 8 sixth day
        0.4 * SCALE + 0.2 * A if c.col192 else 0.0, # 9 seventh day
    ]
    subtotal = round(sum(items), 2)                 # 211
    return round(subtotal + c.col190, 2)            # 209
```

---

## 4. Rounding

1. **Compute every slot at full precision. Sum. Round once, to 2 dp.**
   `H` is a repeating decimal on most cards (e.g. `3936/44 = 89.4545...`).
   Rounding each slot first and then summing produces a **1-cent error on 7 of
   133 cards**: `S1079`, `S1080`, `S1209`, `S1210`, `S1211`, `S1405`, `S1409`.
   Example — `S1210`: unrounded slots `4034 + 916.8182 + 825.1364 = 5775.9545`
   -> `5775.95` (matches 209); rounded-then-summed gives `5775.96` (wrong).
2. The **displayed** per-line amounts (column 247) *are* individually rounded to
   2 dp, which is why `sum(col 247)` can be a cent off `col 211` on those 7 cards.
   Reproduce 209/211 from unrounded terms; use rounded terms only for display.
3. `H` is stored in column 246 rounded to 4 dp (`89.4545`, `98.5455`,
   `105.4318`). Do **not** compute from the 4-dp value — recompute from
   `min(CONTRACT, SCALE + A) / 44`.
4. Adjustment column 190 and its parts (218, 229) are already exact cents.

---

## 4b. Weekly overtime (column 183) is not derived from hours

Worth stating plainly, because it looks derivable and is not. Col 183 does
not follow from the hours on the card:

- 32 of the 133 cards carry **exactly 6.00** hours of weekly overtime. Their
  weeks total **35, 40, 48 and 56 hours**. The figure does not move with the
  work.
- S1209 worked 35 hours against a 44-hour guarantee — under it — and was
  paid 6.00 hours of weekly overtime anyway.
- S1058 worked 103.42 hours against a 48-hour guarantee and was paid **none**.
- Every value seen is a round number: 1.00 (10 cards), 2.00 (1), 6.00 (32).
- None of the 21 Distant cards carry any, which fits the location allowance
  taking its place.

Six candidate rules were tested against all 133 cards — hours less 44, hours
less the guarantee, either of those less the daily and double-time buckets,
and the same on straight-time-only hours. The best managed 73/133, and
predicting a flat zero scored better at 90/133.

It reads as a term of the deal — guaranteed overtime written into the
contract — rather than anything the week's work implies. The app asks for it
once alongside the rates and applies it to each week, and must not try to
compute it from logged days.

Col 257 is no help here either: on 28 of the 133 cards the per-day hours
array does not have as many entries as the day count.

## 5. Day codes (column 276)

One token per day, aligned with the date array (252) and every other multi-day
array. Multi-letter tokens are concatenations of single-day statuses; `TR` and
`HOL` are two/three-letter atoms.

| Token | n | Meaning | Hours logged? | Adjustment on that day? | Effect on gross |
| --- | --- | --- | --- | --- | --- |
| `W` | 467 | Work | 420 of 467 | 263 of 467 | none directly |
| `WF` | 113 | Work + Finish (last day) | 109 of 113 | 74 of 113 | none directly |
| `SW` | 110 | Start + Work (first day) | 108 of 110 | 71 of 110 | none directly |
| `SWF` | 4 | Start + Work + Finish (single-day) | 2 of 4 | 2 of 4 | none directly |
| `H` | 10 | **Hold** — on payroll, not called | never (0 of 10) | never | none (covered by the weekly guarantee) |
| `R` | 7 | **Rehearsal** — a called non-shoot day | 3 of 7 | 2 of 7 | none (inside the guarantee) |
| `TR` | 8 | **Travel** | never (0 of 8) | never | counts toward `D`, so it prorates the base (`S1059`/`S1081`: `TR` alone, D=1 -> `FACTOR = 0.2`) |
| `STR` | 1 | Start + Travel | no | no | as `TR` |
| `WFTR` | 1 | Work + Finish + Travel | no | no | none |
| `HOL` | 2 | **Holiday worked** | 2 of 2 | never | **+0.20 to `FACTOR`** (one extra day at scale) |
| `w` | 6 | lowercase Work — appears only on `S1256`/`S1279` (`W w w w SW`), no hours, no adjustments | never | never | treat as `W` |

Only `HOL` and the day *count* affect the gross. `H` (hold) and `R` (rehearsal)
days are absorbed by the weekly guarantee; `TR` days are absorbed too but still
count toward `D`.

---

## 6. Supporting relationships (all verified on 133/133)

| Relationship | Notes |
| --- | --- |
| `col 189 = col 188 / 44` | **not** `188 / 185`. The 21 Distant cards (185 = 48) still use 44, which is why `189` "mismatches" 188/185 on exactly those 21. `189` is the contract hourly and is the ceiling in `H`. |
| `col 214` = applicable weekly scale | An **input**, not derivable from date alone: 2021 cards carry both `$3,936` and `$3,955` for overlapping weeks (different Basic Agreement years per production). Observed table: 2021 `3,936` / `3,955`; 2023 `4,034`; 2024–25 `4,489`; 2026 `4,478` and `4,646`. Feeds slot 0, the 6th/7th-day rates, `DAILY`, and (with `A`) the OT hourly. |
| `col 190 = col 218 + col 229` | 0 mismatches. |
| `col 218 = k * (SCALE / 5)`, `k` an integer | 0 non-integers over 31 cards; observed `k` in {1, 2, 4, 5, 6}. Whole extra days at daily scale, booked as an adjustment rather than a line item. |
| `col 229 = sum(col 146) + sum(col 147)` | 0 mismatches. Per-day **meal penalties**. |
| meal-penalty ladder | `col 143`/`148` = 1st-meal penalty count, `col 146` its dollars; `col 149`/`150` = 2nd-meal count, `col 147` its dollars. Amount = `$25` for the 1st half-hour, `$35` for the 2nd, `$50` each thereafter. **45 of 45** day-entries match (e.g. 7 penalties -> `25+35+50*5 = $310`; 4 -> `$160`; 2 -> `$60`; 5 -> `$210`). |
| `col 203/204/208 == slot 1/2/3 amounts` | 0 mismatches — they are outputs, not inputs. |
| `col 186 = 205 + 207 + 206` | total overtime hours; 0 mismatches. |
| `col 202` sum `== slot 7 amount` | 0 mismatches. |
| `col 248[0] == FACTOR` | 0 mismatches — the proration lives in the multiplier column, **not** the units column (`col 245[0]` is always `1.00`). |
| `col 152 == col 209`, `col 197 == col 211` | duplicate display columns. |
| `col 257/260/264/266/267/269/271/273/274` | per-day **clock times** in decimal hours (values > 24 are past midnight), e.g. `S1042`: `9.25` report, `9.50` set call, `14.00`/`14.50` meal out/in, `19.00` wrap, `19.25` dismiss. The earlier note that 257 is "hours worked per day" is wrong. **None of these feed the gross.** |
| `col 210` | total hours; roughly `(days with hours x standard day from col 161) + overtime hours`, but it does not hold cleanly on every card and is not needed for the gross. |

### Overtime hours are inputs, not derived here

`183 / 205 / 206 / 207` are entered on the card, not computed from the timecard
arrays in this export. Within the well-formed 2026 test blocks the relationship
`col 210 = 44 + col 183 + col 206` holds exactly (e.g. `S1367` 45 = 44+1;
`S1369` 55 = 44+6+5; `S1370` 60 = 44+6+10), and `col 183` never exceeds
**6.00** — i.e. the first 6 hours past the weekly guarantee at 1.5x, everything
beyond at 2x. `col 207` tracks the per-day array `col 212` (penalty hours) rounded
up, but the rounding granularity is inconsistent (0.1 on some cards, 0.25 on
others), so treat 207 as an input.

---

## 7. Match rate and unexplained cases

| Model variant | Gross (209) exact | Subtotal (211) exact |
| --- | --- | --- |
| Full model (§3) | **132 / 133 (99.2%)** | 132 / 133 |
| …rounding each line before summing (§4.1 violated) | 125 / 133 (94.0%) | 125 / 133 |
| …without the §3.3 absorption rule | 120 / 133 (90.2%) | 120 / 133 |
| …without absorption **and** round-per-line | 113 / 133 (85.0%) | 113 / 133 |

### Unexplained cases

| # | Card(s) | Pattern | Actual 209 | Model 209 | Diagnosis |
| --- | --- | --- | --- | --- | --- |
| 1 | `S1234` (row 279) | `col 194 = HOLIDAY` but slot 5 is priced at nothing | `$6,926.23` | `$7,824.03` (+897.80) | **Malformed card, not a rule.** Its arrays read `245[5] = 1.00`, `248[5] = 1.00`, but `246[5]` and `247[5]` are **empty** — the holiday line was created and never priced. Its sibling `S1235`, same production/week, has the identical `194 = HOLIDAY` and does carry `246[5] = 897.8 = SCALE/5`. Both cards *also* carry `col 218 = 897.80` (a whole day at daily scale) inside `col 190`, so `S1235` in effect pays the holiday twice and `S1234` once. Encoding the opposite rule (`HOLIDAY -> 0`) also scores 132/133, just failing `S1235` instead. Only 2 cards in the file exercise this path and they disagree. |

### Bounded, not pinned: the §3.3 absorption threshold

The 12 cards that motivated §3.3 (`S1382`–`S1384`, `S1385`, `S1387`–`S1390`,
`S1392`–`S1395`) all set `col 183` yet emit no slot 4. They come from a clean
2026 test matrix that varies only `col 202`:

| `A` (col 202 total) | `SCALE + A` | ratio to `CONTRACT` (`$5,500`) | slot 4 |
| --- | --- | --- | --- |
| 0 / 500 / 600 / 700 / 1,000 | 4,646 – 5,646 | 0.845 – 1.027 | **paid** (31 cards) |
| 2,500 / 5,000 / 10,000 | 7,146 – 14,646 | 1.299 – 2.663 | **absorbed** (12 cards) |

The cut therefore lies anywhere in `(5,646 , 7,146]`. The rule shipped in §3.3,
`SCALE + A >= CONTRACT + 9*H`, puts it at `$6,625` for these cards and is the
only closed form tried that also explains the low-adjustment cards on other
productions (`S1280`: `SCALE + A = 4,728` vs threshold `4,400 + 900 = 5,300`, so
slot 4 is paid — a flat `A >= $2,000` rule would agree here, a
"credit the whole over-scale excess" rule would not, since the excess `$328`
already exceeds the `$300` of overtime owed). **Treat the exact cut point as
unverified**; any threshold in `(5,646 , 7,146]` reproduces this dataset.

### Also inferred rather than proven

- `R` = Rehearsal (vs. "Rest"): 3 of its 7 occurrences carry hours and 2 carry a
  daily adjustment, so it is a *called* day, not an idle one. Idle days use `H`.
- The `0.1*A` / `0.2*A` terms in the 6th/7th-day rates are exact on all 65
  flagged cards but only 4 distinct `A` values (600, 700, 1000, 1300) exercise a
  non-zero `A`.

---

## 8. Worked examples (unit-test fixtures)

All six reproduce 209 and 211 to the cent.

### 8.1 `S1022` — simplest case: base + 1.5x daily OT + adjustment

*Jamie Northrup, The Equalizer, Nov 5 2021, TV / Studio / H: Stunt Performer*

| Input | Value |
| --- | --- |
| 185 / 201 | `44.00` / Studio |
| 188 / 189 / 214 | `$4,400.00` / `$100.00` / `$3,936.00` |
| 202 | `[,,,,,,400]` -> `A = 400` |
| 205 (1.5x hrs) | `0.50` |
| 253 / 276 | `5` / `R R R R SWF` |
| 190 | *(blank)* |

```
H      = min(4400, 3936 + 400) / 44 = 4336 / 44 = 98.545454...
FACTOR = min(5,5)/5 + 0.20*0        = 1.0
absorb = 4336 >= 4400 + 9*98.5455 (=5286.9)?  -> False

slot 0  base       1.00 x 3936      x 1.00 = 3936.0000
slot 1  daily OT   0.50 x 98.545455 x 1.50 =   73.9091
slot 7  adjustment 1.00 x 400       x 1.00 =  400.0000
                                    211    = 4409.9091 -> 4409.91  == $4,409.91
                                    209    = 4409.91 + 0 = 4409.91 == $4,409.91
```

### 8.2 `S894` — 2x overtime, hourly driven by scale + adjustment

*Warren Hull, Cabrini, Jul 30 2021, Theatrical / Studio / H: Stunt Performer*

| Input | Value |
| --- | --- |
| 185 / 188 / 214 | `44.00` / `$5,500.00` / `$3,936.00` |
| 202 | `[,,,200,,,]` -> `A = 200` |
| 206 (2x hrs) | `1.70` |
| 253 / 276 | `5` / `STR SWF SWF SWF WFTR` |

```
H      = min(5500, 3936 + 200) / 44 = 4136 / 44 = 94.00     <- the contract ceiling
FACTOR = 1.0                                                   does NOT bind here

slot 0  base        1.00 x 3936 x 1.00 = 3936.00
slot 2  double time 1.70 x 94   x 2.00 =  319.60
slot 7  adjustment  1.00 x 200  x 1.00 =  200.00
                                 211   = 4455.60            == $4,455.60
                                 209   = 4455.60            == $4,455.60
```

### 8.3 `S934` — Distant + Loc Allowance + penalty OT + adjustments

*Clarrel Pope, The Plane, Sep 18 2021, Theatrical / **Distant** / H: Stunt Performer*

| Input | Value |
| --- | --- |
| 185 / 201 | `48.00` / Distant |
| 188 / 214 | `$5,500.00` / `$3,936.00` |
| 202 | `[,,,,,400,]` -> `A = 400` |
| 194 | `Loc Allowance` |
| 206 / 207 | `1.60` / `6.70` |
| 253 / 276 | `6` / `H H W W W W` |
| 190 | `$1,457.20` (`218 = 787.20` = 1 x 3936/5, `229 = 670.00` meal penalties) |

```
H      = min(5500, 3936 + 400) / 44 = 4336 / 44 = 98.545454...   <- /44, not /48
FACTOR = min(6,5)/5 = 1.0                                        (2 hold days are inside the guarantee)

slot 0  base         1.00 x 3936      x 1.00 = 3936.0000
slot 2  double time  1.60 x 98.545455 x 2.00 =  315.3455
slot 3  penalty OT   6.70 x 98.545455 x 1.50 =  990.3818
slot 5  loc allow    4.00 x 98.545455 x 1.00 =  394.1818        <- the 48-44 hours at straight time
slot 7  adjustment   1.00 x 400       x 1.00 =  400.0000
                                      211    = 6035.9091 -> 6035.91  == $6,035.91
                                      209    = 6035.91 + 1457.20 = 7493.11 == $7,493.11
```

### 8.4 `S1415` — 6th day + 7th day + weekly OT + double time

*Weekly Timecard Sample 100, Apr 25 2026, Theatrical / Studio / H: Stunt Performer*

| Input | Value |
| --- | --- |
| 185 / 188 / 214 | `44.00` / `$5,500.00` / `$4,646.00` |
| 202 | `[100 x 7]` -> `A = 700` |
| 183 / 206 | `6.00` / `14.00` |
| 191 / 192 | `6th Day` / `7th Day` |
| 253 / 276 | `7` / `SW W W W W W WF` |
| 190 | `$5,575.20` (`218 = 5575.20` = 6 x 4646/5) |

```
H      = min(5500, 4646 + 700) / 44 = min(5500, 5346) / 44 = 121.50
FACTOR = min(7,5)/5 = 1.0                       <- days 6 and 7 do NOT raise the base
absorb = 5346 >= 5500 + 9*121.50 (=6593.5)? -> False

slot 0  base         1.00 x 4646  x 1.00 = 4646.00
slot 2  double time 14.00 x 121.5 x 2.00 = 3402.00
slot 4  weekly OT    6.00 x 121.5 x 1.50 = 1093.50
slot 7  adjustment   1.00 x 700   x 1.00 =  700.00
slot 8  6th day  0.3*4646 + 0.1*700      = 1463.80   (= 1.5 x 929.20 + 0.5 x 140)
slot 9  7th day  0.4*4646 + 0.2*700      = 1998.40   (= 2.0 x 929.20 + 1.0 x 140)
                                    211  = 13303.70          == $13,303.70
                                    209  = 13303.70 + 5575.20 = 18878.90 == $18,878.90
```

### 8.5 `S1231` — short week (4 days): base prorated to 0.8

*Nancy McCrumb, Genesis, Jul 7 2024, Theatrical / Distant / H: Stunt Performer*

| Input | Value |
| --- | --- |
| 185 / 188 / 214 | `48.00` / `$5,500.00` / `$4,489.00` |
| 202 | `[,150,,,,,]` -> `A = 150` |
| 206 / 207 | `3.50` / `1.40` |
| 253 / 276 | `4` / `SW W W WF` |
| 190 | `$1,327.80` (`218 = 897.80` = 1 x 4489/5, `229 = 430.00` = meal penalties 4+2+5 -> 160+60+210) |

```
H      = min(5500, 4489 + 150) / 44 = 4639 / 44 = 105.431818...
FACTOR = min(4,5)/5 = 0.80                       <- stored in col 248[0]

slot 0  base         1.00 x 4489       x 0.80 = 3591.2000
slot 2  double time  3.50 x 105.431818 x 2.00 =  738.0227
slot 3  penalty OT   1.40 x 105.431818 x 1.50 =  221.4068
slot 7  adjustment   1.00 x 150        x 1.00 =  150.0000
                                       211    = 4700.6295 -> 4700.63 == $4,700.63
                                       209    = 4700.63 + 1327.80 = 6028.43 == $6,028.43
```

### 8.6 `S1383` — overtime absorption (the §3.3 rule)

*Weekly Timecard Sample 68, Apr 25 2026, Theatrical / Studio / H: Stunt Performer*

| Input | Value |
| --- | --- |
| 185 / 188 / 214 | `44.00` / `$5,500.00` / `$4,646.00` |
| 202 | `[500 x 5]` -> `A = 2500` |
| 183 | `6.00` |
| 253 / 276 | `5` / `SW W W W WF` |

```
H      = min(5500, 4646 + 2500) / 44 = min(5500, 7146) / 44 = 125.00   <- contract ceiling binds
FACTOR = 1.0
absorb = 7146 >= 5500 + 9*125 (=6625)?  -> TRUE

slot 0  base       1.00 x 4646 x 1.00 = 4646.00
slot 4  weekly OT  ABSORBED           =    0.00     <- 6.00 hrs would have been 1125.00
slot 7  adjustment 1.00 x 2500 x 1.00 = 2500.00
                                211   = 7146.00     == $7,146.00
                                209   = 7146.00     == $7,146.00
```

Its sibling `S1384` is identical plus `206 = 5.00`, and gross rises by exactly
`5 x 125 x 2 = 1250` to `$8,396.00` — confirming double time is **never**
absorbed.
