# IAMOT juggling demo assets

The home-page viewer renders 50 curated CoTracker3 ball trajectories with fixed
0.5-second trails. Video and canvas share a single playback clock. Hover reveals
the video underneath the tracks; touch layouts include a reveal toggle.

- `tracks.json`: crop-relative trajectories, colours, frame rate, and dimensions.
- `video.mp4`: the corresponding cropped 121-frame video (30 fps).
- `poster.jpg`: a static preview while the lazy-loaded viewer initializes.
- `source.json`: source URL, selected time interval, model, and selection checksum.

Trail history wraps around the clip for a populated first frame. The discontinuous
last-to-first joining segment is omitted rather than drawn as a false motion line.
Occlusion estimates do not hide any tracks.

Regenerate these assets from the website root with:

```bash
node scripts/prepare-iamot-assets.mjs
```

The asset generator expects the curated export in the sibling `IAMOT_demo` folder;
an alternative source directory may be supplied as its first argument. Website
builds require only these standalone public assets, not the local ML environment.
