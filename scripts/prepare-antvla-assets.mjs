import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// Run only when updating the archived rollout, not during website builds.
const source = resolve(process.argv[2] ?? "../antvla_candidate_animations/avocado_for_animation");
const destination = fileURLToPath(new URL("../public/demo/antvla/3d/", import.meta.url));
await mkdir(join(destination, "licences"), { recursive: true });

for (const name of ["robot.glb", "avocado.glb", "paper_box.glb", "table.glb", "camera.json"]) {
  await copyFile(join(source, "high_fidelity_assets", name), join(destination, name));
}
for (const name of ["franka-asset-Apache-2.0.txt", "franka-NOTICE.txt"]) {
  await copyFile(join(source, "high_fidelity_assets/licences", name), join(destination, "licences", name));
}

// Ship only the kinematics needed for playback, without local source paths.
const kinematics = JSON.parse(await readFile(join(source, "high_fidelity_assets/kinematics.json"), "utf8"));
await writeFile(join(destination, "kinematics.json"), JSON.stringify({
  joint_order: kinematics.joint_order,
  joints: kinematics.joints.filter((joint) => joint.type !== "fixed").map((joint) => ({
    name: joint.name,
    type: joint.type,
    axis: joint.axis_parent_joint_frame,
    node: joint.glb_joint_node,
  })),
}));

for (const [policy, filename] of [["baseline", "baseline.trajectory.json"], ["antvla", "antvla_teacher.trajectory.json"]]) {
  const trajectory = JSON.parse(await readFile(join(source, filename), "utf8"));
  const frames = trajectory.frames.map((frame) => ({
    t: frame.t,
    joints: [...frame.joint_positions, ...frame.gripper_positions],
    object: frame.object,
    target: frame.target,
  }));
  await writeFile(join(destination, `${policy}.json`), JSON.stringify({
    policy: trajectory.metadata.policy,
    duration: frames.at(-1).t,
    joint_names: [...trajectory.robot.joint_names, ...trajectory.robot.gripper_joint_names],
    frames,
  }));
  console.log(`${policy}: ${frames.length} recorded poses, ${frames.at(-1).t.toFixed(2)} seconds`);
}
console.log(`Prepared standalone browser assets in ${destination}`);
