# ADR 0002: Radial-band Particle Assignment

Date: 2026-05-29
Status: Accepted

## Context

When a [[participant]] submits during an Open [[session]], the server assigns
them one of the unowned [[particle]]s. Until now assignment has been
arbitrary (effectively random across the whole pool), which made the
fingerprint fill in visually scattered. We want submissions to feel like the
fingerprint is *growing* — starting at the center and expanding outward —
without making it look mechanical.

## Decision

Assign particles in **radial bands**:

1. Precompute, once per layout, a band index for every particle: bands run
   from the geometric center of the fingerprint outward. Roughly 10 bands,
   each holding ~30 particles.
2. When a participant submits, pick the **lowest band that still has unowned
   particles**, then pick a **random unowned particle within that band**.
3. Order across submissions therefore advances band-by-band from center to
   edge, but order *within* a band is non-deterministic.

## Alternatives Considered

- **A1 — Strict nearest-first (deterministic order)**. Rejected: the
  fingerprint fills as visibly concentric rings — too mechanical, fights the
  organic character of the artwork.
- **A3 — Weighted-random biased toward center**. Rejected: the "starts from
  the center" narrative becomes too faint to read on screen — it just looks
  like ordinary random with a slight clump.
- **Status quo (uniform random across pool)**. Rejected: no narrative of
  growth; the fingerprint appears to materialize in noise.

## Consequences

- Submissions read as "the fingerprint is growing outward" while still
  feeling alive (random within each band).
- [[Snapshot]]/[[replay]] determinism: the *band order* is stable, but the
  exact `particleIndex` recorded depends on the within-band random draw at
  the time of submission. Replays of stored snapshots are unaffected (they
  replay recorded indices verbatim), but two live sessions with identical
  submission timing will not produce identical layouts. This is intentional.
- Changing the band count or band boundaries later will not break stored
  snapshots — snapshots store concrete `particleIndex` values, not band
  references.
- [[Fill-the-gap]] still draws from whatever particles remain dark; with
  radial assignment those will tend to cluster at the outer bands, so the
  closing reveal naturally completes the outer edge — a desirable framing.
