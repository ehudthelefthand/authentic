# ADR 0004: Replay omits scan and verdict

Date: 2026-05-30
Status: Accepted

## Context

A Snapshot records a full Session: participant joins, fill sequence, plus the
ceremony fields introduced in ADR 0003 (`ceremonyMode`, `scanningAt`,
`verdictAt`). The first replay implementation used those fields to synthesize
a scan sweep and verdict overlay at the end of playback, so a replay would
re-enact the entire ceremony arc.

In practice the admin never wants to replay the ceremony moment. Replays are
used as ambient playback — running between sessions, or showing the build-up
of a past session on the display — where a sudden red "ERROR / UNAUTHENTIC"
or green "AUTHENTIC" overlay is confusing (it looks like a live verdict) and
breaks the ambient feel.

Two concrete bugs also fell out of the synthetic scan/verdict path:

1. The display's scan-line render was gated on
   `sessionInfo.state === 'scanning'`, which is never true during replay
   (replay does not mutate live session state). The sweep silently never
   drew, so the verdict overlay slammed in over a still fingerprint.
2. Server scaled `SCANNING_DURATION_MS` by replay speed but the client
   animation duration is fixed wall-clock. At 4x/10x the verdict fired
   before the intro reveal even finished.

## Decision

**Replay covers join + fill events only.** It ends shortly after the last
fill event. The server does not broadcast synthetic `scan_start` or
`verdict` events during replay, and the client no longer handles them.

Snapshot files still record `ceremonyMode`, `scanningAt`, and `verdictAt` —
they are historical metadata of the Session and may be used later for stats
or analysis. They are simply not consumed by the replay path.

## Consequences

- Replay semantics are now: speed (1x / 4x / 10x) scales the join+fill
  timeline; there is no ceremony tail to scale or not scale. The scale
  mismatch bug disappears by construction.
- Future contributors reading a snapshot file will see ceremony fields and
  wonder why replay ignores them — this ADR is the answer.
- If a "full ceremony replay" mode is ever wanted (e.g. for a recap on the
  big screen), it would be a separate, explicitly-chosen mode rather than
  the default. Out of scope here.
