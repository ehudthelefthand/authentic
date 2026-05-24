# ADR 0001: One Particle Per Person, Hard Cap at 300

Date: 2026-05-22
Status: Accepted

## Context

The artwork is composed of a fixed number of arcs ("particles") — currently
300, chosen for visual composition. The event is a church camp opening
session with an unknown attendee count. We need to define how attendees map
to particles.

## Decision

- Each Participant owns exactly **one** Particle.
- The pool is hard-capped at 300. Participant #301 sees a friendly
  "session full" message on the mobile page.
- The admin is expected to watch the live count and Close the Session
  before approaching the cap.
- Remaining unowned Particles at Close are completed by the admin via
  [[fill-the-gap]].

## Alternatives Considered

- **One cluster per person** (current code behavior, ~25% of remaining dark
  particles per Participant). Rejected: makes "their particle" ambiguous,
  weakens the personal meaning of [[ping]].
- **Auto-expand the pool past 300**. Rejected: the layout was tuned for 300;
  adding more risks messing up the composition.
- **Shared slots** (multiple Participants on one Particle, color blending).
  Rejected: muddies ownership, and pinging gets ambiguous.

## Consequences

- The "their particle is mine" promise is clean. Pinging is meaningful.
- Snapshot/replay has a stable per-Participant identity to record.
- Hard ceiling at 300 attendees. For a single camp opening this is generous,
  but raising it later requires bumping `TOTAL_PARTICLES` and re-checking the
  visual composition.
- The admin carries the social responsibility of timing the Close so no one
  is turned away. The admin screen surfaces the live count to support this.
