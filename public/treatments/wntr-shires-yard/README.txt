WNTR x Shires Yard — images
============================

Drop the act stills into THIS folder, using these exact filenames:

  act-1-frost.jpg     Act I  — Frost
  act-2-snow.jpg      Act II — Snowfield
  act-3-aurora.jpg    Act III — Aurora
  act-4-flames.jpg    Act IV — Sea of Flames

Specs: 16:10 ratio, around 1600x1000px, JPG or WebP, under ~400KB each.


Why they live in public/ and not next to the page
--------------------------------------------------
Vite copies everything in public/ into the build untouched. If these sat
beside the treatment's index.html instead, Vite would try to resolve and
hash them at build time — and the build would FAIL for any image that
isn't there yet.

Here, a missing image just doesn't render: that act falls back to its
line-drawn placeholder icon and the site builds fine. So you can add the
four stills one at a time, over weeks, and never break a deploy.

The page refers to them by absolute path, e.g.
  /treatments/wntr-shires-yard/act-1-frost.jpg
which is this folder once built. Don't change the folder name without
updating the four <img> tags in
  treatments/wntr-shires-yard/index.html
