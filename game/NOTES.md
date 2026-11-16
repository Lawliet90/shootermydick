# ShooterMyDick — notes & credits

## Bot character model

The bots' soldier model is **"Game Ready Military Character" by jayb3e**,
published on Sketchfab under the **CC-BY (Creative Commons Attribution)**
license — credit to the author is required, and is given here.

- Source: Sketchfab, "Game Ready Military Character" by **jayb3e**
- Model URL: https://sketchfab.com/3d-models/game-ready-military-character-8cd04f8d8ca94f7fb911fef2d3802f13
- License: CC-BY — © jayb3e, used with attribution
- Integration: converted to `assets/military-character.glb` (vest textures
  downscaled 4096² → 2048² for download size; geometry, rig and animation
  clips unchanged). Both teams use the same model with team-tinted
  materials (teal = Police, rust = Terrorists). The rifle is an in-game
  procedural mesh attached to the model's RightHand bone — the source file
  ships no weapon.

## First-person viewmodel

The viewmodel is fully procedural: detailed part-built guns plus TWO
low-poly hands (HAND_POSES in weapon.js carries right + left per
weapon, left = null for the one-handed knife), matching the user's
reference POV screenshot: olive CAMO sleeves (fixed-seed canvas blotch
texture, flat-shaded 8-sided segments), bare skin wrist bands, and
green FINGERLESS gloves — three box segments per finger laid on a real
arc around the gripped part, the last segment skin, so the wrap is
geometry, not a blob. The right hand works the pistol grip (index
finger extended to the trigger), the left supports the pump /
handguard / forend, or cups the P9 grip two-handed. Hands are built
by buildArm (adapted 2026-11-16 from the user's own snippet): a root
group at the grip point, the fist (capsule palm + fingers, scale 1.3)
in a rotated hand group inside it, and the arm as TWO camo runs with
a slight elbow bend (~11°): a forearm run (skin wrist → green glove
band → dark cuff → tapered camo forearm, elbow at 0.25) and an
upper-arm run along a second direction, radii ~20% slimmer than the
old single-tube stack. Both runs point mostly toward the viewer
(foreshortened) and down, with negative gun-space X compensating the
viewmodel's 0.3 rad hip yaw. Third fix (user's 14:49 VK-7 playtest:
even the 0.64 m toward-viewer chain still read as long straight camo
columns, left arm 373 px at 1440×900): the viewmodel base also sits
much lower (hip y −0.36, z −0.55, −0.06 rad hip pitch that drops the
far support grip ~2.3× more than the near trigger grip; ADS lifts
and unpitches back to the old sight line), so the grips ride at
~75–90% of screen height and the sleeves exit the bottom edge near
the centre. Measured in-match (shot mode, vmMeasure): at 1440×900
the visible left arm is 215–229 px (24–25% of screen height, was
41%), right arm ~91–94 px (10%); bottom-edge entry x ≈ 44.5–45%
(left) and ≈ 60% (right) of width. The fist wraps its fingers around its local X axis, so
each pose aligns that axis with the gripped part's long axis (rot.z
−90° for the near-vertical pistol grip, rot.y 90° for forends, pump
and knife handle along Z) — otherwise the fingers stand up beside
the gun in a raised-fist salute and the weapon floats. Grip proof is
measured, not eyeballed: `window.__dustline.debug.vmMeasure()`
projects the live viewmodel and reports per hand the fist screen
box, grip-point-inside-fist, true forearm diameter vs fist width,
finger-segment distances/arc around the grip axis, and the arm's
visible screen length (armLenPx: the in-frame part of the bent
grip → elbow → sleeve-end polyline, with armPctH and the bottom-edge
entry point exitXPx). Presentation is layered on an absolute base pose every

## Barrel / crosshair alignment

The crosshair sits at exact screen centre and bullets leave along the
camera ray, so the aim is always true — but the viewmodel's 0.3 rad
hip yaw put the barrel's projected axis ~139 px off the crosshair at
1440×900 (the user's 2026-11-16 AK-47 playtest: the barrel pointed
up-left while the crosshair floated above/right of the muzzle line).
`GUN_AIM` in weapon.js carries a per-weapon hip-fire pose — a small
gunGroup pitch/yaw plus a 0.06 m drop for rifles/shotgun (P9: pitch
only, no drop) — that puts the bore line through the crosshair:
rifles/shotgun rx −0.03, ry −0.33, dy −0.06 (total yaw ~−0.03, total
pitch ~−0.09: nearly level and straight, no upward cant); P9 rx 0.20,
ry −0.24. The pose is applied in step() scaled by (1 − adsBlend), so
ADS is untouched: it fades out and the sights sit on the crosshair
exactly as before (bore a sight-height below, as a real gun). Hands
and arms are children of gunGroup, so they ride the pose and the
fists stay on their grips by construction — gripInsideFist is still
verified by vmMeasure. The drop is what keeps the arms at the
accepted length: rotation alone cost ~+55 px of visible left arm
(285 px), the drop buys it back to ~220 px (24%). The muzzle-flash
anchor (muzzleLocal) is re-derived from the posed gun every frame.
Measured in-match with the `barrelMeasure()` probe (bore line
projected through the viewmodel camera, pixel distance from screen
centre): steady hip 0.1 px (AK-47, VK-7, Ratter, M4A1-S, Longbow,
AWP), 1.2 px (Breacher-12), 0.8 px (P9) at 1440×900; 1.0–1.9 px at
1280×720. Frozen 2 steps after firing the same captures read
0.8–3.3 px (Breacher 9–12 px: its 0.05 recoil viewKick is still
decaying in that frame; it settles to the steady value). With the
0.3 rad hip yaw kept, no sane pitch closes the line at all (even
+0.45 rad leaves ~33 px) — the yaw has to go. Bullet impacts scatter
around the crosshair by the weapon's spread only (AK-47 9.6 px,
VK-7 7.8 px, P9 6.6 px, Breacher-12 30.5 px across 8 pellets); the
aim ray itself is exact.

User's final viewmodel fix (2026-11-16): after the barrel fix the
straight-on gun made the crosshair read badly, so the user ordered
the hip gun dropped to Y −0.12 total (his numbers: base −0.03 →
−0.12, per-weapon −0.09 to −0.12). Implemented as GUN_AIM dy −0.09
for rifles/shotgun (hip total −0.12) and dy −0.06 for P9 (hip total
−0.09, top of his band — a full drop would push its fists off the
bottom edge); knife unchanged. VM_GUN_POS.y stays −0.03: it is also
the ADS base, and changing it would drop the ADS sights ~97 px off
the crosshair — the drop lives in the hip-only dy, which fades out
on ADS, so ADS is unchanged (verified: sights on the crosshair,
bore a sight-height below). Measured steady hip at 1440×900:
AK-47/VK-7 muzzle ~213 px below the crosshair, bore line 1.2 px
from it; Breacher 0.2 px; P9 2.6 px. The drop costs ~20–30 px of
visible left arm (198–200 px vs the accepted 217–229 px) — a direct
consequence of the prescribed drop, not a rig regression; P9 arms
fall to ~64 px. −0.15 (dy −0.12) is held as the next lever if the
user still finds the barrel too high.
frame — exponentially smoothed mouse sway, subtle idle breathing, a
weapon-switch settle blend, and a time-normalized reload dip+cant that
moves gun and hand as one unit and returns exactly to base — merged
from the user's own viewmodel fix (2026-11-16) so sway/reload/switch
can never accumulate rotation or distort the arm. The GodotFPS-Template
rigged-arms kit (bukkbeek, MIT) that briefly supplied the viewmodel
arms was removed on the user's call: in the live build it rendered as
an oversized white clay rifle with no visible hands.
`assets/fps_demo_arms.glb` is no longer loaded by the game.

## Sound samples

The pistol/SMG shot, reload, weapon-change and empty-click samples in
`assets/sfx-godot/` still come from the GodotFPS-Template kit by
bukkbeek (MIT). Bot gunfire reuses the pistol/SMG samples (synth bursts
for other weapon kinds) with distance attenuation.
