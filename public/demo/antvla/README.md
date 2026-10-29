# Avocado rollout demo

The AntVLA selected-work card on the homepage contains a Three.js / WebGL 2 scene,
not a video texture. It occupies one column of the two-column laptop layout. The articulated
Franka GLB is driven by the seven recorded arm joint angles and two finger
positions. Avocado and box poses are replayed alongside the arm. Drag to orbit,
scroll/pinch to zoom, and use the timeline to inspect either rollout.

The default is the successful privileged AntVLA teacher. The reactive baseline is
also selectable. Playback starts when the scene is visible, loops by default, and
pauses offscreen. Reduced-motion users start with a still, playable scene.

## Updating the data

With Node 22.23.4 or newer, from the website directory:

```sh
node scripts/prepare-antvla-assets.mjs ../antvla_candidate_animations/avocado_for_animation
npm run build
```

`3d/` contains standalone copies of the supplied GLBs, camera, kinematics, licence
notices, and compact trajectories. A normal build/deployment needs no access to
the original archive. The preparer omits policy actions and local source paths
from the trajectory downloads. The original MP4s remain available as references.

All scene assets and trajectory poses use Isaac's Z-up robot-base coordinates.
The viewer applies a single -90° X rotation at their common root. The GLB joint
nodes encode the fixed URDF transforms at zero joint position: revolute motion
is composed after each origin rotation, while the supplied finger translation
axes are in the parent frame. Do not apply the initial pose twice.

The browser uses a wider, centred presentation view so the whole robot is visible.
The exported camera audit view is available in `3d/camera.json`.

`src/scripts/antvla-scene.ts` calibrates the supplied proxy meshes to the recorded
contact plane without changing the trajectory: the tabletop is lifted 10 mm to
z=0 and deepened to support the box, the box's initial-pose-only visual offset is
replaced with a resting-pose alignment, and the avocado's radial envelope is
expanded 20% to match its recorded rolling contact height. Its long axis and all
recorded object centres, orientations, and robot joints are preserved.

Robot asset attribution and Apache 2.0 licence: `3d/licences/`.
