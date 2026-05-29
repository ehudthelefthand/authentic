# ADR 0003: Ceremony Modes and Scanning/Verdict Resolution

Date: 2026-05-29
Status: Accepted

## Context

The app is used twice per camp: once at the **opening ceremony** and once at
the **closing ceremony**. The intended emotional arc is:

- **Opening**: participants submit, the wall fills, the system "scans" the
  composite fingerprint — and *fails*. A large red "UNAUTHENTIC" verdict
  pins the moment: *we are not yet who we will become*. Camp begins.
- **Closing**: same flow, but the scan *succeeds*. Green "AUTHENTIC". The
  fingerprint is now a record of who the camp turned out to be.

The original Session model (Idle → Open → Closed → Ended) only supports the
"fill and reveal" climax. It has no notion of two different ceremonies or
of a scripted post-fill resolution.

## Decision

### Ceremony Mode

Introduce a per-session field `ceremonyMode: 'opening' | 'closing'`. The
admin picks it before transitioning Idle → Open; once Open, it is locked
for the lifetime of that Session. `reset` preserves the previously selected
mode.

### State machine

Extend Session.state from 4 to 5 states:

```
Idle → Open → Closed → Scanning → Verdict
                 ↑                    │
              admin: Fill       admin: Reset → Idle
```

- **Scanning** is entered *automatically* when `fill-the-gap` finishes. It
  plays the existing neon reveal as a ~2s intro, then a horizontal scan
  line sweeps the fingerprint twice (~4s total).
- **Verdict** is entered *automatically* after the scan line. The display
  shows a horizontal band across the center of the fingerprint with a
  two-line message:
  - `opening` mode → red **ERROR** / `IDENTITY NOT VERIFIED`
  - `closing` mode → green **AUTHENTIC** / `IDENTITY VERIFIED`
  Entrance is a brief glitch (≈200ms flicker) into solid. Verdict is
  terminal — it persists until the admin presses Reset. Pinging remains
  enabled.

The state name `Ended` is retired; `Verdict` replaces it as the "session
finished" state. Snapshots gain `ceremonyMode` and `verdictAt` fields.

## Alternatives Considered

- **S2 — Keep 4 states; treat scan + verdict as sub-phases inside Ended.**
  Rejected: hides important transitions from snapshots/replay and from the
  admin UI's idea of "where are we now." Two named states are clearer.
- **S3 — Drop the neon reveal entirely; replace with scan animation.**
  Rejected: the neon reveal is the established climax of the artwork.
  Reusing it as the *intro* to the scan preserves the emotional payoff and
  layers a new moment on top.
- **Mode by deploy-time env var.** Rejected: would require redeploy
  between the camp's opening and closing nights — fragile and operationally
  hostile in a live event.
- **Mode by URL query param per device.** Rejected: lets admin and display
  disagree about which ceremony is running. A server-held mode keeps every
  client in lockstep.

## Consequences

- `Ended` no longer exists in session state. Code that branched on
  `state === 'ended'` must move to `verdict`. Persisted field `endedAt` is
  kept in snapshots for backward compatibility but the new authoritative
  field is `verdictAt`.
- Snapshots written before this ADR have no `ceremonyMode`. On replay they
  stop at the post-fill frame — no scan, no verdict overlay. This is
  acceptable because no production snapshots existed before this change.
- The display now requires a one-time user gesture ("TAP TO START") before
  the first session of each boot, because the Web Audio API cannot start
  audio without a gesture. Admin clicks once during pre-event setup.
- Replay reproduces the full flow including scan and verdict — the climax
  is part of what's worth replaying.
- The admin UI gains a mode selector that is editable only while Idle, and
  visible (but disabled) in all other states so the operator can always
  see which ceremony is in progress.
