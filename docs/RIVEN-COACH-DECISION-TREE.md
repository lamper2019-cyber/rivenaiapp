# RIVEN Coach — Decision Tree

How "Message from RIVEN" decides **what to say, when, and when to stay quiet** —
so it feels like a real coach, not a notification machine. This is the logic
behind the daily check-in + weekly average + community.

---

## The guardrails (read these first — they govern everything below)

1. **Max 1 proactive RIVEN push per day** per member (the Sunday wrap is the
   one exception). Her own replies in chat never count against this.
2. **Silence is a valid move.** A quiet, on-track day gets *no* message. We do
   not message just to message — that's how coaches get muted.
3. **Earned escalation.** Gentle → check-in → concern, based on days missed.
   We never open with worry.
4. **One message = one job + one optional tap.** Never a wall of text.
5. **Voice = peaceful discipline.** No guilt, no cheerleading, no therapy
   clichés. "That's data, not a problem." "Steady wins."
6. **Target band: 3–5 RIVEN touches per week.** Under 2 → she feels forgotten.
   Over 6 → she mutes us.

---

## 1. THE DAILY LOOP (runs each morning, per member)

```
MORNING (~8a her time)
│
├─ Did she log her WEIGHT yesterday?
│
├─ YES ───────────────────────────────────────────────────────────────┐
│   • Streak intact.                                                    │
│   • Dashboard shows today's weigh-in slider (one number, no waist).   │
│   • RIVEN message?  → USUALLY SILENT. Don't reward showing up with    │
│        noise. Exceptions only:                                        │
│          - 7-day milestone  → light nod ("A full week logged. That's  │
│            the part most people skip.")                               │
│          - trend shift (see §3)                                       │
│                                                                       │
└─ NO ──► how many days in a row has she missed?                        │
    │                                                                   │
    ├─ 1 day   → NO push. Dashboard just shows the slider.              │
    │             (One miss is not a problem. Don't flinch.)            │
    │                                                                   │
    ├─ 2 days  → GENTLE (push + chip):                                  │
    │             "Two quiet days. No numbers needed — just tap your    │
    │              weight when you're up."                              │
    │                                                                   │
    ├─ 3–4 days → CHECK-IN (push + chip):                               │
    │             "Haven't seen you since [day]. You good? One tap and  │
    │              we're back on track."                                │
    │                                                                   │
    └─ 5+ days  → RE-ENGAGE + flag to coach dashboard:                  │
                  "Real talk — life happens. The scale's not the point, │
                   showing up is. Start fresh today?"                   │
```

---

## 2. MEAL LOGGING (a separate signal — don't blend with weight)

```
By EVENING (~7p)
│
├─ Logged at least one meal today?
│   ├─ YES → silent. (Optional: ≤2×/week one light affirmation —
│   │        "Protein's on point. Stack more plates like this.")
│   └─ NO  → ONE evening nudge only (never all day):
│            "Light day on the log. Even rough numbers beat zero."
```

---

## 3. WEIGHT TREND (the weekly average — what we actually coach)

```
Every weigh-in feeds a 7-DAY ROLLING AVERAGE. We coach the average, never the
daily wiggle (water, salt, cycle move the scale 2–3 lb — that's noise).

SUNDAY WRAP (full-screen, once a week):
│
├─ First week        → "Here's your starting line: avg [X] lb. No judgment —
│                        just the baseline we build from."
├─ Down vs last wk   → "Down [X] lb on the 7-day average. That's real. Steady wins."
├─ Flat              → "Held steady. Maintenance is a skill — now we nudge."
└─ Up vs last wk     → "Up a touch on the average. That's data, not a problem.
                        One thing to clamp down this week: [protein / steps]."
```

---

## 4. WHAT IF SHE DOESN'T RESPOND TO A RIVEN MESSAGE?

```
RIVEN sent a message →
│
├─ She opened or replied within 48h  → normal loop, ledger resets.
│
└─ No open within 48h → STEP DOWN, don't pile on.
   • Next touch waits for the next *real* trigger (a missed day, the Sunday
     wrap) — never an immediate follow-up nag.
   • 7 days fully dark → ONE "the door's open" message, then go quiet and
     flag the coach. We don't chase; we leave the porch light on.
```

---

## 5. THE COMMUNITY (the circle) — how RIVEN behaves there

```
A member posts in the circle →
│
├─ HEAVY-DAY post  → RIVEN never "fixes" it. The room witnesses (peer cheers).
│                    RIVEN may drop ONE private line, not a public reply:
│                    "Saw you in the circle. Heavy days are data, not failure."
│
├─ WIN / walk / meal post → RIVEN says nothing. Peer cheers carry it. RIVEN
│                           staying out of the wins is what makes the room feel
│                           like *theirs*, not a feed it's performing on.
│
└─ Silent in the circle 7+ days → soft invite inside the morning RIVEN card
                                  ("The room's been asking about you"), never a
                                  guilt trip, never a push.
```

---

## 6. THE FREQUENCY LEDGER (the "real coach" rule, summarized)

| Window | Limit |
|---|---|
| Per member / day | ≤ 1 proactive RIVEN push (+ the Sunday wrap on Sundays) |
| Per member / week | **3–5 touches** is the target band |
| Too quiet | < 2/week → she feels forgotten |
| Too loud | > 6/week → she mutes us |
| Never counts | her own chat replies (those are always welcome) |

---

## How this maps to what already runs in the app

These existing crons are the "clock" — the tree above is the *decision* layer
that sits on top of them:

- `morning-checkin`, `midday-checkin`, `evening-checkin` — time-of-day triggers
- `sean-messages` — the proactive message picker (this is where §1–§2 live)
- `monday-checkin` / `sunday-recap` / `sunday-reminder` — the weekly wrap (§3)
- `weekly-digest` — coach-side rollup
- `process-ai-replies` — handles her replies back to RIVEN

**To build the daily loop:** the missed-day escalation (§1) and the 7-day
average (§3) are the two new pieces; everything else is re-pointing existing
crons from a monthly to a daily cadence.
