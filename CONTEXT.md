# Context

Domain glossary for the Authentic Camp interactive fingerprint wall.

## Particle

A single arc rendered on the display. The artwork is composed of a fixed
number of particles (currently 300) laid out in a fingerprint shape. Each
particle is either **dark** (ambient background) or **lit** (owned by a
Participant or filled by the admin).

## Participant

A person who has submitted via the mobile page during an Open Session. Each
Participant owns exactly **one** Particle — identified by `particleIndex`.
Persisted on the device via `localStorage` so the same person can return and
[[ping]] their Particle later.

## Session

The unit of time during which Participants can join. A Session has four states:

- **Idle** — before the admin opens. Display shows ambient dark arcs. Mobile
  page is reachable but submission is disabled.
- **Open** — admin has started the session. Particles are cleared to dark.
  Mobile users can submit.
- **Closed** — admin has stopped accepting new submissions. Already-joined
  Participants can still [[ping]]. No fill yet.
- **Ended** — after [[fill-the-gap]] completes. Display shows the full neon
  reveal. Pinging stays enabled indefinitely.

Each session has a `sessionId` (bumped on [[reset]]) that mobile clients use
to detect when their stored identity belongs to a past session.

## Ping

A short tap on the mobile fingerprint button (after submitting) that triggers
a visual effect on the Participant's Particle: a white flash plus a soft
expanding ring in the Particle's color. 3-second cooldown per Participant.
Available in Open, Closed, and Ended states.

## Fill the Gap

Admin-triggered action available after the Session is Closed. Lights all
remaining dark Particles over ~8 seconds with the existing stagger, using
random selections from the curated palettes. Transitions the Session to
Ended.

## Reset

Admin-triggered action that wipes Participants, bumps `sessionId`, and
returns to Idle. Snapshots on disk are preserved.

## Snapshot

A frozen record of one completed Session, saved to
`snapshots/<closedAt>.json`. Contains per-submission `{ participantId, name,
particleIndex, timestamp }`, the [[fill-the-gap]] sequence, and session
metadata. Used for [[replay]].

## Replay

Playback of a Snapshot on the display. Admin picks speed (1x / 4x / 10x).
Shows a "REPLAY" badge so it isn't mistaken for a live session.

## Admin

The person operating the event. Reaches the admin screen via a magic URL
containing a token printed to the server console on startup (`ADMIN_TOKEN`).
No live login form.

## Display

The projector-facing screen (`display-v4.html`). One canonical display per
deployment.
