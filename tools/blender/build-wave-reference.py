#!/usr/bin/env python3
"""Build an orthographic toon wave/curl reference with Blender.

Run with:
  blender --background --factory-startup \
    --python tools/blender/build-wave-reference.py

The render and .blend are offline art-direction references. They are not loaded
by the game and do not define gameplay geometry.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "docs" / "art-source" / "blender"


def parse_args() -> argparse.Namespace:
    blender_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args(blender_args)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def material(name: str, color: tuple[float, float, float, float], roughness: float = 0.9):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = color
    shader = mat.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Roughness"].default_value = roughness
        if "Specular IOR Level" in shader.inputs:
            shader.inputs["Specular IOR Level"].default_value = 0.22
    return mat


def add_cube(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat,
):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def make_profile_slab(
    name: str,
    points: list[tuple[float, float]],
    half_depth: float,
    mat,
):
    count = len(points)
    vertices = [(x, -half_depth, z) for x, z in points]
    vertices += [(x, half_depth, z) for x, z in points]
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, next_index + count, index + count))

    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    return obj


def make_poly_curve(
    name: str,
    points: list[tuple[float, float, float]],
    bevel_depth: float,
    mat,
    cyclic: bool = False,
):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 0
    curve.resolution_u = 1
    curve.fill_mode = "FULL"
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinates in zip(spline.points, points):
        point.co = (*coordinates, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def add_droplet(name: str, location: tuple[float, float, float], radius: float, mat) -> None:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=location)
    droplet = bpy.context.object
    droplet.name = name
    droplet.data.materials.append(mat)


def look_at(obj, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def configure_scene(output_dir: Path):
    scene = bpy.context.scene
    # Blender 5.1 exposes the current Eevee engine as BLENDER_EEVEE.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 432
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 90
    scene.render.film_transparent = False
    scene.render.filepath = str(output_dir / "wave-curl-reference.png")
    scene.render.use_file_extension = True

    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.008, 0.018, 0.035, 1.0)
    background.inputs["Strength"].default_value = 0.28

    scene.view_settings.view_transform = "Standard"
    try:
        scene.view_settings.look = "Medium High Contrast"
    except TypeError:
        scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.render.use_freestyle = True
    scene.render.line_thickness = 1.15
    linestyle = scene.view_layers[0].freestyle_settings.linesets[0].linestyle
    linestyle.color = (0.015, 0.025, 0.055)
    linestyle.thickness = 1.25
    return scene


def build_scene() -> None:
    ink = material("Deep navy ink", (0.018, 0.035, 0.075, 1.0))
    sky = material("Twilight sky", (0.055, 0.105, 0.18, 1.0))
    horizon = material("Horizon haze", (0.12, 0.30, 0.40, 1.0))
    deep = material("Deep water", (0.018, 0.17, 0.24, 1.0))
    face = material("Wave face", (0.035, 0.43, 0.48, 1.0), roughness=0.72)
    mid = material("Wave middle", (0.08, 0.58, 0.59, 1.0), roughness=0.68)
    light = material("Wave reflected light", (0.34, 0.78, 0.72, 1.0), roughness=0.64)
    foam = material("Foam", (0.90, 0.96, 0.79, 1.0), roughness=0.85)
    gold = material("Power seam gold", (1.0, 0.65, 0.20, 1.0), roughness=0.76)

    add_cube("Sky backdrop", (0.0, 4.2, 3.2), (9.0, 0.12, 5.2), sky)
    add_cube("Horizon band", (0.0, 4.0, 1.25), (9.0, 0.14, 0.38), horizon)
    add_cube("Ocean base", (0.0, 0.4, -0.5), (9.0, 4.8, 0.35), deep)

    profile = [
        (-6.2, -0.42), (-6.2, 0.08), (-5.0, 0.15), (-3.8, 0.27),
        (-2.6, 0.45), (-1.55, 0.70), (-0.65, 1.08), (0.08, 1.62),
        (0.56, 2.32), (0.82, 3.15), (0.96, 3.92), (1.30, 4.48),
        (1.88, 4.84), (2.55, 4.85), (3.15, 4.55), (3.63, 4.02),
        (3.86, 3.42), (3.72, 2.96), (3.34, 2.68), (2.88, 2.67),
        (2.35, 2.36), (1.72, 1.74), (1.12, 1.18), (0.54, 0.75),
        (-0.35, 0.42),
        (-1.70, 0.10), (-3.30, -0.18), (-5.00, -0.34),
    ]
    make_profile_slab("Hero wave body", profile, 1.72, face)

    # Layered face bands make the form useful as a paint-over and pixel-cluster guide.
    face_bands = [
        [(-5.7, -1.77, 0.17), (-3.8, -1.79, 0.34), (-2.1, -1.80, 0.62), (-0.7, -1.81, 1.16), (0.25, -1.82, 1.95)],
        [(-5.4, -1.79, -0.02), (-3.5, -1.80, 0.14), (-1.8, -1.81, 0.42), (-0.35, -1.82, 0.92), (0.48, -1.83, 1.52)],
        [(-4.9, -1.80, -0.18), (-3.0, -1.81, -0.02), (-1.3, -1.82, 0.24), (0.02, -1.83, 0.66), (0.72, -1.84, 1.16)],
        [(-1.15, -1.81, 0.84), (-0.35, -1.83, 1.34), (0.18, -1.85, 1.91), (0.49, -1.86, 2.58), (0.61, -1.87, 3.15)],
    ]
    for index, points in enumerate(face_bands):
        make_poly_curve(f"Face light band {index + 1}", points, 0.055 if index < 3 else 0.075, light if index % 2 == 0 else mid)

    # Curl shadow and crest foam articulate the pocket without pretending to be gameplay truth.
    curl_center = (2.68, -1.83, 3.35)
    inner_arc = []
    crest_arc = []
    for step in range(22):
        theta = math.radians(55 + step * (250 / 21))
        inner_arc.append((
            curl_center[0] + 0.95 * math.cos(theta),
            curl_center[1] - 0.01,
            curl_center[2] + 0.86 * math.sin(theta),
        ))
        crest_arc.append((
            curl_center[0] + 1.31 * math.cos(theta),
            curl_center[1] - 0.05,
            curl_center[2] + 1.22 * math.sin(theta),
        ))
    make_poly_curve("Barrel pocket shadow", inner_arc, 0.13, ink)
    make_poly_curve("Curl foam crown", crest_arc[:14], 0.16, foam)

    crest_points = [
        (-5.9, -1.86, 0.15), (-4.6, -1.88, 0.25), (-3.3, -1.89, 0.38),
        (-2.1, -1.90, 0.59), (-1.0, -1.91, 0.91), (-0.08, -1.92, 1.42),
        (0.49, -1.93, 2.16), (0.78, -1.94, 3.10), (0.97, -1.95, 4.01),
        (1.40, -1.96, 4.54), (2.02, -1.97, 4.84),
    ]
    make_poly_curve("Crest feather", crest_points, 0.12, foam)

    power_line = [
        (-4.8, -1.93, 0.28), (-3.6, -1.95, 0.43), (-2.4, -1.96, 0.67),
        (-1.35, -1.97, 0.99), (-0.47, -1.98, 1.43), (0.12, -1.99, 1.96),
        (0.45, -2.00, 2.48),
    ]
    make_poly_curve("Power seam reference", power_line, 0.055, gold)

    spray_arcs = [
        [(1.45, -1.9, 4.70), (1.16, -1.86, 5.12), (0.78, -1.78, 5.34), (0.34, -1.68, 5.36)],
        [(1.78, -1.72, 4.88), (1.62, -1.56, 5.31), (1.40, -1.38, 5.61)],
        [(2.15, -1.45, 4.92), (2.27, -1.20, 5.34), (2.47, -0.96, 5.52)],
        [(2.55, -1.15, 4.78), (2.94, -0.86, 5.10), (3.40, -0.62, 5.18)],
    ]
    for index, points in enumerate(spray_arcs):
        make_poly_curve(f"Spray arc {index + 1}", points, 0.045 + index * 0.006, foam)

    droplets = [
        (0.15, -1.62, 5.48, 0.08), (0.62, -1.38, 5.61, 0.07),
        (1.08, -1.18, 5.76, 0.09), (1.61, -0.98, 5.86, 0.065),
        (2.20, -0.75, 5.75, 0.08), (2.85, -0.58, 5.55, 0.06),
        (3.45, -0.45, 5.28, 0.075), (3.88, -0.38, 4.96, 0.055),
    ]
    for index, (x, y, z, radius) in enumerate(droplets):
        add_droplet(f"Spray droplet {index + 1}", (x, y, z), radius, foam)

    foreground_foam = [
        (-6.6, -3.5, -0.10), (-5.2, -3.6, 0.02), (-3.8, -3.55, -0.05),
        (-2.4, -3.62, 0.05), (-1.0, -3.58, -0.03), (0.4, -3.64, 0.04),
        (1.8, -3.58, -0.04), (3.2, -3.62, 0.02), (4.8, -3.55, -0.05),
    ]
    make_poly_curve("Foreground foam line", foreground_foam, 0.07, foam)

    bpy.ops.object.light_add(type="SUN", location=(-4.0, -6.0, 9.0))
    sun = bpy.context.object
    sun.name = "Warm rim sun"
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(-32))
    sun.data.energy = 2.25
    sun.data.color = (1.0, 0.75, 0.48)

    bpy.ops.object.light_add(type="AREA", location=(-2.0, -6.0, 7.0))
    area = bpy.context.object
    area.name = "Cool face fill"
    area.data.energy = 820.0
    area.data.shape = "DISK"
    area.data.size = 7.0
    area.data.color = (0.30, 0.65, 0.90)
    look_at(area, (0.5, 0.0, 2.0))

    bpy.ops.object.light_add(type="AREA", location=(4.0, 1.0, 6.5))
    rim = bpy.context.object
    rim.name = "Foam rim light"
    rim.data.energy = 580.0
    rim.data.size = 4.0
    rim.data.color = (1.0, 0.72, 0.38)
    look_at(rim, (2.0, 0.0, 3.5))

    bpy.ops.object.camera_add(location=(0.0, -24.0, 6.8))
    camera = bpy.context.object
    camera.name = "Orthographic art camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 11.20
    camera.data.lens = 50
    look_at(camera, (-0.75, 0.0, 2.55))
    bpy.context.scene.camera = camera


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    clear_scene()
    scene = configure_scene(output_dir)
    build_scene()
    blend_path = output_dir / "wave-curl-reference.blend"
    # A generated build should leave one canonical source, not rotating .blend1 backups.
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)
    bpy.ops.render.render(write_still=True)
    print(f"Saved Blender source: {blend_path}")
    print(f"Saved reference render: {scene.render.filepath}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
