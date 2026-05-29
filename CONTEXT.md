# Context

Domain glossary for the Authentic Camp interactive fingerprint wall.

## Particle

A single arc rendered on the display. The artwork is composed of a fixed
number of particles (currently 300) laid out in a fingerprint shape. Each
particle is either **dark** (ambient background) or **lit** (owned by a
Participant or filled by the admin).

## Participant

A person who has submitted via the mobile page during an Open Session. Each
Participant owns exactly **one** Particle — identified by `particleIndex`,
and a color drawn from a curated palette. Identity is anonymous: only an
opaque `id` (used to enable [[ping]]) and the chosen color are stored.
Persisted on the device via `localStorage` so the same person can return and
[[ping]] their Particle later.

## Standby

A person who has the mobile page open but has not yet submitted. Visible on
the [[admin]] screen as a live count during Idle and Open states, so the
admin can gauge how many people are waiting before opening the session, and
how many late arrivals are still on the page before closing it. A Standby
becomes a [[participant]] on successful submit.

## Session

The unit of time during which Participants can join. A Session has five
states, traversed once per ceremony:

- **Idle** — before the admin opens. Display shows ambient dark arcs. Mobile
  page is reachable but submission is disabled.
- **Open** — admin has started the session. Particles are cleared to dark.
  Mobile users can submit.
- **Closed** — admin has stopped accepting new submissions. Already-joined
  Participants can still [[ping]]. No fill yet.
- **Scanning** — entered automatically after [[fill-the-gap]] completes.
  Plays the neon reveal (intro), then a scan-line animation over the
  finished fingerprint. ~4 seconds total. No admin interaction.
- **Verdict** — final state. Display shows a large overlay that depends on
  the session's [[ceremony-mode]]: red ERROR / UNAUTHENTIC for `opening`,
  green AUTHENTIC for `closing`. Stays until [[reset]]. Pinging remains
  enabled. The overlay itself can be toggled off independently — see
  [[verdict-overlay]].

Each session has a `sessionId` (bumped on [[reset]]) that mobile clients use
to detect when their stored identity belongs to a past session.

## Verdict Overlay

The ceremonial ERROR / AUTHENTIC banner drawn on top of the artwork during
[[verdict]]. Distinct from the [[verdict]] state itself: the Session can
remain in Verdict while the overlay is hidden, exposing the bare lit
fingerprint underneath so the artwork can be shown standalone after the
ceremonial moment has passed.

Visibility is controlled by the [[admin]] via a toggle. Defaults to visible
each time the Session enters Verdict; [[reset]] clears the toggle back to
visible. The same visibility applies to the matching banner on the mobile
page — when the overlay is hidden on the [[display]], the mobile verdict
banner is hidden too.

## Error Alarm

A continuous looping alarm sound that plays alongside the **opening**-mode
Verdict Overlay (the red ERROR variant). The **closing**-mode (green
AUTHENTIC) has no alarm — only a one-shot success chime when Verdict is
first entered.

Has its own admin toggle, default on each time the Session enters Verdict;
[[reset]] clears it back to on. The alarm is **gated** by [[verdict-overlay]]
visibility: hiding the overlay silences the alarm without changing its
toggle state, so re-showing the overlay resumes the alarm if it was on. The
alarm toggle is only meaningful while the overlay is visible.

## Ceremony Mode

Selected by the [[admin]] before transitioning a Session from Idle to Open,
and locked for the lifetime of that Session. Determines what [[verdict]] the
Session resolves to:

- **opening** — for the camp's opening ceremony. Verdict resolves to
  *unauthentic* (red ERROR overlay). Story: "we are not authentic yet — we
  need to discover it together during camp."
- **closing** — for the camp's closing ceremony. Verdict resolves to
  *authentic* (green overlay). Story: "we found it."

Persists across [[reset]] — resets do not clear the selected mode.

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

Playback of a Snapshot on the display, covering the **join + [[fill-the-gap]]
events only**. Ends after the last fill — the [[scanning]] sweep and
[[verdict]] overlay are intentionally not replayed (see ADR 0004). Admin picks
speed (1x / 4x / 10x). Shows a "REPLAY" badge so it isn't mistaken for a live
session.

## Sound Theme

The audible character of the four moments on the [[display]] that play
sound:

- **Submit** — short tone when a Participant joins
- **Scan** — looping sweep during [[scanning]]
- **Error Alarm** — looping pulse during opening-mode [[verdict]] (see
  [[error-alarm]])
- **Success Chime** — one-shot bell when closing-mode [[verdict]] is entered

Three themes are available — **Sci-Fi**, **Organic**, **Retro-arcade** —
each providing one variant per moment. The [[admin]] picks a global theme
that applies to all four moments by default, and may override individual
moments to a different theme.

Settable from the admin console at any time (not locked to Idle). Changes
take effect from the next time each moment fires — sounds already playing
(such as the Scan loop or Error Alarm) finish in their current theme and
adopt the new one on the next start. Like [[ceremony-mode]], the theme
config is held in memory and initialised from env vars on boot; [[reset]]
preserves it.

## Admin

The person operating the event. Reaches the admin screen via a magic URL
containing a token printed to the server console on startup (`ADMIN_TOKEN`).
No live login form.

## Display

The projector-facing screen (`display-v4.html`). One canonical display per
deployment.
