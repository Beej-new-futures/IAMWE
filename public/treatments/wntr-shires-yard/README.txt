WNTR x Shires Yard — images
============================

All ten are in place, encoded from projects/WNTR (14.2MB of PNG/JPG down
to 1.5MB). To replace one, drop a new file over the same name — the page
refers to them by absolute path and nothing else needs editing.

THE FOUR ACTS  (16:9 room renders, shown large)
  act-1-frost.jpg     Act I   — Frost
  act-2-snow.jpg      Act II  — Snowfield
  act-3-aurora.jpg    Act III — Aurora
  act-4-flames.jpg    Act IV  — Sea of Flames

LOOK & FEEL  (reference, shown smaller and captioned as such)
  entrance.jpg        Entrance material studies   (composite sheet)
  snowflake.jpg       Crystal structure studies   (composite sheet)
  room-02.jpg         Projection volume reference
  room-01.jpg         Warm interval reference
  ref-02.jpg          Approach reference
  ref-01.jpg          Suspension reference

NOTE — act 1 and act 2 are currently the SAME PICTURE. act-1-frost.png
and act-2-snow.png in projects/WNTR are byte-for-byte identical, so Frost
and Snowfield show the same render. Drop a different image over
act-2-snow.jpg when there is one.

Specs for replacements: acts want 16:9, around 1600-1920px wide. The two
composite sheets keep their own 16:9 and are letterboxed rather than
cropped, so nothing at their edges is lost. Reference images are cropped
to 4:3 (or 3:4 for the two tall ones). Keep each under ~250KB.

Why these live in public/ : Vite copies public/ into the build untouched.
Beside the page instead, Vite would try to resolve and hash them at build
time, and the build would FAIL for any image not yet added.
