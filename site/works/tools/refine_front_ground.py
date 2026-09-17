import bpy
import math
from mathutils import Vector


FLOOR_NAME = "pitted concrete floor"
OUTPUT_BLEND = (
    r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets"
    r"\television\television-water-scene.blend"
)
OUTPUT_RENDER = (
    r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets"
    r"\television\television-water-preview.png"
)

# The original floor extents and transform are deliberately preserved. Only the
# height of vertices inside the television's near foreground is changed.
GRID_X = 201
GRID_Y = 181
HALF_WIDTH = 2.9
HALF_DEPTH = 2.45


def clamp(value, minimum=0.0, maximum=1.0):
    return max(minimum, min(maximum, value))


def smoothstep(edge0, edge1, value):
    if edge0 == edge1:
        return 0.0
    t = clamp((value - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def hash2(ix, iy):
    # Stable pseudo-random values without changing Blender's global random state.
    value = math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123
    return value - math.floor(value)


def value_noise(x, y):
    x0 = math.floor(x)
    y0 = math.floor(y)
    tx = x - x0
    ty = y - y0
    sx = tx * tx * (3.0 - 2.0 * tx)
    sy = ty * ty * (3.0 - 2.0 * ty)
    a = hash2(x0, y0)
    b = hash2(x0 + 1, y0)
    c = hash2(x0, y0 + 1)
    d = hash2(x0 + 1, y0 + 1)
    top = a + (b - a) * sx
    bottom = c + (d - c) * sx
    return top + (bottom - top) * sy


def fbm(x, y, octaves=5):
    value = 0.0
    amplitude = 0.55
    frequency = 1.0
    normalizer = 0.0
    for octave in range(octaves):
        value += value_noise(x * frequency + octave * 17.3, y * frequency - octave * 11.7) * amplitude
        normalizer += amplitude
        frequency *= 2.07
        amplitude *= 0.48
    return value / normalizer


def ellipse_bowl(x, y, cx, cy, rx, ry, depth, angle=0.0):
    cosine = math.cos(angle)
    sine = math.sin(angle)
    dx = x - cx
    dy = y - cy
    px = (dx * cosine + dy * sine) / rx
    py = (-dx * sine + dy * cosine) / ry
    radius = math.sqrt(px * px + py * py)
    if radius >= 1.0:
        return 0.0, 0.0

    # A broad shallow basin with a softened, slightly raised broken lip.
    interior = 1.0 - smoothstep(0.08, 0.96, radius)
    basin = -depth * interior * interior
    rim = depth * 0.12 * math.exp(-((radius - 0.91) / 0.075) ** 2)
    return basin + rim, interior


def front_patch_mask(x, y):
    # Offset left and toward the camera to match the reference composition.
    radial = math.sqrt(((x + 0.16) / 0.86) ** 2 + ((y + 0.88) / 0.94) ** 2)
    ellipse = 1.0 - smoothstep(0.70, 1.0, radial)
    # Keep the television's contact area untouched so it never appears to float.
    front_gate = 1.0 - smoothstep(-0.30, -0.08, y)
    return ellipse * front_gate


PITS = (
    (-0.28, -0.78, 0.42, 0.32, 0.019, math.radians(-18)),
    (0.24, -0.65, 0.33, 0.24, 0.014, math.radians(21)),
    (-0.05, -1.16, 0.45, 0.22, 0.013, math.radians(-8)),
    (-0.58, -0.55, 0.22, 0.17, 0.010, math.radians(31)),
    (0.42, -1.08, 0.18, 0.28, 0.009, math.radians(-29)),
)


def surface_height_and_wetness(x, y):
    mask = front_patch_mask(x, y)
    if mask <= 0.0:
        return 0.0, 0.0

    macro = (fbm(x * 0.92 + 3.1, y * 0.92 - 1.7, 5) - 0.52) * 0.025
    aggregate_basin = 0.0
    pit_presence = 0.0
    for pit in PITS:
        basin, presence = ellipse_bowl(x, y, *pit)
        aggregate_basin += basin
        pit_presence = max(pit_presence, presence)

    # Fine chipped concrete relief. It remains subordinate to the broad pits.
    coarse_chip = (fbm(x * 4.8 - 7.0, y * 4.8 + 2.0, 4) - 0.50) * 0.0070
    fine_chip = (value_noise(x * 18.0 + 5.0, y * 18.0 - 9.0) - 0.50) * 0.0028
    height = mask * (macro + aggregate_basin + coarse_chip + fine_chip)

    # Wetness follows low points but breaks apart with two unrelated noise scales.
    broad_wet = fbm(x * 1.25 + 9.4, y * 1.25 - 5.3, 5)
    chipped_edge = fbm(x * 5.7 - 2.1, y * 5.7 + 8.6, 4)
    low_point = clamp((-height - 0.002) / 0.023)
    wetness = mask * clamp(low_point * 0.74 + pit_presence * 0.32)
    wetness *= smoothstep(0.42, 0.66, broad_wet * 0.68 + chipped_edge * 0.32)
    return height, wetness


def remove_old_global_wetness(material):
    """Restore the original dry sockets before removing the rejected global pass."""
    if material is None or not material.use_nodes:
        return
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        return

    for node_name, socket_name in (
        ("wetness_base_color", "Base Color"),
        ("wetness_roughness", "Roughness"),
    ):
        node = nodes.get(node_name)
        if node is None or not node.inputs[1].is_linked:
            continue
        source = node.inputs[1].links[0].from_socket
        for existing in list(bsdf.inputs[socket_name].links):
            links.remove(existing)
        links.new(source, bsdf.inputs[socket_name])

    for node in list(nodes):
        if node.name.startswith("wetness_"):
            nodes.remove(node)


def make_moisture_material(dry_material, name, color, roughness, coat):
    material = dry_material.copy()
    material.name = name + " new"
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        raise RuntimeError("The floor material has no Principled BSDF node.")

    base_input = bsdf.inputs.get("Base Color")
    if base_input is not None:
        for existing in list(base_input.links):
            links.remove(existing)
        base_input.default_value = (*color, 1.0)

    # Moist areas retain the scanned normal map but become dark enough to vanish
    # until a grazing screen reflection reveals them.
    roughness_input = bsdf.inputs.get("Roughness")
    if roughness_input is not None:
        for existing in list(roughness_input.links):
            links.remove(existing)
        roughness_input.default_value = roughness

    coat_weight = bsdf.inputs.get("Coat Weight")
    coat_roughness = bsdf.inputs.get("Coat Roughness")
    if coat_weight is not None:
        coat_weight.default_value = coat
    if coat_roughness is not None:
        coat_roughness.default_value = roughness * 0.72
    return material


floor = bpy.data.objects.get(FLOOR_NAME)
if floor is None or floor.type != "MESH":
    raise RuntimeError(f"Could not find mesh object: {FLOOR_NAME}")

original_location = floor.location.copy()
original_rotation = floor.rotation_euler.copy()
original_scale = floor.scale.copy()
dry_material = next(
    (material for material in floor.data.materials if material and material.name.startswith("scanned worn concrete")),
    floor.active_material,
)
if dry_material is None:
    raise RuntimeError("The floor has no material.")

remove_old_global_wetness(dry_material)
damp_material = make_moisture_material(
    dry_material,
    "front basin damp concrete",
    (0.012, 0.016, 0.017),
    0.48,
    0.08,
)
wet_material = make_moisture_material(
    dry_material,
    "front basin shallow water",
    (0.004, 0.007, 0.008),
    0.24,
    0.24,
)

vertices = []
for row in range(GRID_Y):
    v = row / (GRID_Y - 1)
    y = -HALF_DEPTH + v * HALF_DEPTH * 2.0
    for column in range(GRID_X):
        u = column / (GRID_X - 1)
        x = -HALF_WIDTH + u * HALF_WIDTH * 2.0
        z, _ = surface_height_and_wetness(x, y)
        vertices.append((x, y, z))

faces = []
material_indices = []
for row in range(GRID_Y - 1):
    for column in range(GRID_X - 1):
        lower_left = row * GRID_X + column
        lower_right = lower_left + 1
        upper_left = lower_left + GRID_X
        upper_right = upper_left + 1
        faces.append((lower_left, lower_right, upper_right, upper_left))
        material_indices.append(0)


def append_damp_patch(cx, cy, radius_x, radius_y, angle, phase, rings=7, segments=64):
    """Add a thin, irregular damp skin to the same floor mesh.

    It follows a locally averaged version of the terrain, so it sits inside the
    shallow basins without becoming a flat mirror or a separate water tray.
    """
    start = len(vertices)
    cosine = math.cos(angle)
    sine = math.sin(angle)

    center_z, _ = surface_height_and_wetness(cx, cy)
    vertices.append((cx, cy, center_z + 0.00046))

    for ring in range(1, rings + 1):
        ring_fraction = ring / rings
        for segment in range(segments):
            theta = math.tau * segment / segments
            outline = (
                1.0
                + math.sin(theta * 3.0 + phase) * 0.12
                + math.sin(theta * 7.0 - phase * 0.7) * 0.065
                + math.sin(theta * 11.0 + phase * 1.9) * 0.032
            )
            radial = ring_fraction * outline
            local_x = math.cos(theta) * radius_x * radial
            local_y = math.sin(theta) * radius_y * radial
            x = cx + local_x * cosine - local_y * sine
            y = cy + local_x * sine + local_y * cosine

            samples = (
                surface_height_and_wetness(x, y)[0],
                surface_height_and_wetness(x + 0.025, y)[0],
                surface_height_and_wetness(x - 0.025, y)[0],
                surface_height_and_wetness(x, y + 0.025)[0],
                surface_height_and_wetness(x, y - 0.025)[0],
            )
            smoothed_ground = sum(samples) / len(samples)
            edge_lift = 0.00022 + (1.0 - ring_fraction) * 0.00024
            vertices.append((x, y, smoothed_ground + edge_lift))

    for segment in range(segments):
        faces.append((start, start + 1 + segment, start + 1 + (segment + 1) % segments))
        material_indices.append(2)

    for ring in range(1, rings):
        inner = start + 1 + (ring - 1) * segments
        outer = start + 1 + ring * segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append((inner + segment, outer + segment, outer + next_segment, inner + next_segment))
            material_indices.append(1 if ring >= rings - 2 else 2)


# Overlapping shapes read as rain-darkened broken ground rather than one designed
# oval. They remain wholly inside the localized front patch.
append_damp_patch(-0.24, -0.96, 0.40, 0.25, math.radians(-17), 0.8)
append_damp_patch(0.22, -0.78, 0.24, 0.15, math.radians(24), 2.4)
append_damp_patch(-0.08, -1.31, 0.31, 0.13, math.radians(-9), 4.1)
append_damp_patch(-0.56, -0.78, 0.15, 0.11, math.radians(30), 5.5)

new_mesh = bpy.data.meshes.new("localized pitted concrete floor mesh")
new_mesh.from_pydata(vertices, [], faces)
new_mesh.update()

uv_layer = new_mesh.uv_layers.new(name="UVMap")
for polygon in new_mesh.polygons:
    polygon.use_smooth = True
    for loop_index in polygon.loop_indices:
        vertex_index = new_mesh.loops[loop_index].vertex_index
        x, y, _ = new_mesh.vertices[vertex_index].co
        uv_layer.data[loop_index].uv = ((x + HALF_WIDTH) / (HALF_WIDTH * 2.0), (y + HALF_DEPTH) / (HALF_DEPTH * 2.0))

old_mesh = floor.data
floor.data = new_mesh
floor.data.materials.clear()
floor.data.materials.append(dry_material)
floor.data.materials.append(damp_material)
floor.data.materials.append(wet_material)
for polygon, material_index in zip(floor.data.polygons, material_indices):
    polygon.material_index = material_index

floor.location = original_location
floor.rotation_euler = original_rotation
floor.scale = original_scale

if old_mesh.users == 0:
    bpy.data.meshes.remove(old_mesh)

for material in list(bpy.data.materials):
    if material in {damp_material, wet_material}:
        continue
    if material.name.startswith(("front basin damp concrete", "front basin shallow water")) and material.users == 0:
        bpy.data.materials.remove(material)
wet_material.name = "front basin shallow water"
damp_material.name = "front basin damp concrete"

scene = bpy.context.scene
scene.render.filepath = OUTPUT_RENDER
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND, check_existing=False)
bpy.ops.render.render(write_still=True)

print(
    "FRONT_GROUND_REFINED",
    f"vertices={len(vertices)}",
    f"faces={len(faces)}",
    f"moisture_faces={sum(1 for value in material_indices if value > 0)}",
    f"location={tuple(round(value, 6) for value in floor.location)}",
    f"rotation={tuple(round(value, 6) for value in floor.rotation_euler)}",
    f"scale={tuple(round(value, 6) for value in floor.scale)}",
)
