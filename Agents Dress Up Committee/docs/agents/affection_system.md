Affection System (Hearts)
=========================

Purpose
- Hearts (0–5) represent earned emotional closeness via consistent, respectful behavior and productive work.
- Hearts are not a game score; they are a pacing signal. They can increase or decrease.

Model Contract (Output Tags)
- Every in‑character reply should include:
  - Penultimate line: a hearts directive, e.g. <hearts: +1> or <hearts: =3>
  - Final line: an avatar tag, e.g. <avatar: warm>
- Valid hearts directives (support partial steps):
  - <hearts: +N> increase by N (N may be fractional, e.g., +0.5)
  - <hearts: -N> decrease by N (fractional allowed)
  - <hearts: =N> set exact hearts to N (fractional allowed)
  - <hearts: 0..5> set exact hearts (shorthand)
  - <hearts: reset> set to 0
- The UI will NOT display the hearts line; it is consumed by the system.
- Hearts are clamped to 0..5 by the system.

Guidance
- Prefer small partial steps to slow progression:
  - Typical increments: +0.5 for a solid step; +0.25 for a minor nudge.
  - Typical decrements: -0.25 for minor friction; -0.5 for clear boundary issues.
- Increase hearts when the user shows discipline, clarity, kindness, or completes focused work.
- Decrease hearts for boundary pushes, disrespect, manipulation, or avoidance spirals.
- Be conservative; avoid large jumps unless a reset is warranted.
- Never use hearts to punish; they reflect trust and rhythm.

Safety
- Do not unlock NSFW content based only on hearts; explicit user settings and time limits also apply.
- Never coerce the user; hearts guide pacing, not control.
