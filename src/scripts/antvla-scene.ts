import * as THREE from "three";

/** Calibrate the supplied proxy meshes to the recorded simulator contact plane. */
export function alignSceneMeshes(
  avocado: THREE.Object3D,
  box: THREE.Object3D,
  table: THREE.Object3D,
  restingBoxHeight: number,
) {
  const tableTop = table.getObjectByName("table_top");
  const boxVisual = box.getObjectByName("paper_box__visual");
  if (!tableTop || !boxVisual) throw new Error("Scene assets are missing their visual geometry");

  // Isaac's table contact plane is z=0; the exported tabletop ends at z=-0.01.
  table.updateMatrixWorld(true);
  table.position.z -= new THREE.Box3().setFromObject(tableTop, true).max.z;
  // The original proxy is too shallow to support the box's full footprint.
  table.scale.y = 1.35;

  // This export was aligned to the elevated *initial* box pose. Remove that
  // offset and align the base to its resting pose instead, preserving the
  // recorded initial settling and all subsequent motion of the box root.
  boxVisual.position.z = 0;
  box.updateMatrixWorld(true);
  const boxBottom = new THREE.Box3().setFromObject(box, true).min.z;
  boxVisual.position.z = -restingBoxHeight - boxBottom;

  // The rolling object centre is ~29.5 mm above the table, but this procedural
  // proxy has a ~24 mm radial envelope. Match that contact radius while retaining
  // the long axis, the recorded centre/orientation, and the gripper alignment.
  avocado.scale.set(1.2, 1.2, 1);
}
