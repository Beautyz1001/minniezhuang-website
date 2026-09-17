import bpy
import os
import numpy as np


FLOOR_NAME = "pitted concrete floor"
OUTPUT_BLEND = (
    r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets"
    r"\television\television-water-scene.blend"
)
OUTPUT_RENDER = (
    r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets"
    r"\television\television-water-preview.png"
)
TEXTURE_DIR = (
    r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets"
    r"\television\textures\reference-dark-concrete"
)
TEXTURE_SIZE = 1024


def tiled_value_noise(size, cells, rng):
    grid = rng.random((cells, cells), dtype=np.float32)
    coordinates = np.arange(size, dtype=np.float32) * cells / size
    base = np.floor(coordinates).astype(np.int32)
    fraction = coordinates - base
    fraction = fraction * fraction * (3.0 - 2.0 * fraction)

    x0 = base % cells
    x1 = (base + 1) % cells
    y0 = x0.copy()
    y1 = x1.copy()
    sx = fraction[None, :]
    sy = fraction[:, None]

    top = grid[y0[:, None], x0[None, :]] * (1.0 - sx) + grid[y0[:, None], x1[None, :]] * sx
    bottom = grid[y1[:, None], x0[None, :]] * (1.0 - sx) + grid[y1[:, None], x1[None, :]] * sx
    return top * (1.0 - sy) + bottom * sy


def normalized(field):
    minimum = float(field.min())
    maximum = float(field.max())
    return (field - minimum) / max(maximum - minimum, 1e-6)


def save_image(name, filepath, rgb, colorspace):
    existing = bpy.data.images.get(name)
    if existing is not None:
        bpy.data.images.remove(existing)
    image = bpy.data.images.new(name, width=TEXTURE_SIZE, height=TEXTURE_SIZE, alpha=True, float_buffer=False)
    image.colorspace_settings.name = colorspace
    rgba = np.empty((TEXTURE_SIZE, TEXTURE_SIZE, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0.0, 1.0)
    rgba[:, :, 3] = 1.0
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = filepath
    image.file_format = "PNG"
    image.save()
    return image


def generate_reference_concrete_textures():
    os.makedirs(TEXTURE_DIR, exist_ok=True)
    rng = np.random.default_rng(9417)

    broad = normalized(tiled_value_noise(TEXTURE_SIZE, 5, rng))
    medium = normalized(tiled_value_noise(TEXTURE_SIZE, 18, rng))
    grain = normalized(tiled_value_noise(TEXTURE_SIZE, 72, rng))
    micro = normalized(tiled_value_noise(TEXTURE_SIZE, 220, rng))

    # Low-contrast mineral clouds and sparse aggregate. No warm rust hue survives.
    cloud = (broad - 0.5) * 0.42 + (medium - 0.5) * 0.30 + (grain - 0.5) * 0.18
    pores = np.clip((0.16 - micro) * 3.2, 0.0, 1.0)
    pale_aggregate = np.clip((grain - 0.79) * 2.8, 0.0, 1.0) * (1.0 - pores)
    luminance = 0.048 + cloud * 0.032 - pores * 0.017 + pale_aggregate * 0.018
    luminance = np.clip(luminance, 0.018, 0.092)

    albedo = np.stack(
        (
            luminance * 0.90,
            luminance * 0.97,
            luminance * 1.00,
        ),
        axis=-1,
    )

    roughness_value = 0.77 + (grain - 0.5) * 0.16 + (micro - 0.5) * 0.10 + pores * 0.07
    roughness_value = np.clip(roughness_value, 0.62, 0.94)
    roughness = np.repeat(roughness_value[:, :, None], 3, axis=2)

    height = broad * 0.22 + medium * 0.34 + grain * 0.31 + micro * 0.13 - pores * 0.18
    gradient_y, gradient_x = np.gradient(height)
    normal_strength = 7.5
    nx = -gradient_x * normal_strength
    ny = -gradient_y * normal_strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack(
        (
            nx / length * 0.5 + 0.5,
            ny / length * 0.5 + 0.5,
            nz / length * 0.5 + 0.5,
        ),
        axis=-1,
    )

    albedo_image = save_image(
        "reference dark concrete albedo",
        os.path.join(TEXTURE_DIR, "albedo.png"),
        albedo,
        "sRGB",
    )
    roughness_image = save_image(
        "reference dark concrete roughness",
        os.path.join(TEXTURE_DIR, "roughness.png"),
        roughness,
        "Non-Color",
    )
    normal_image = save_image(
        "reference dark concrete normal",
        os.path.join(TEXTURE_DIR, "normal.png"),
        normal,
        "Non-Color",
    )
    return albedo_image, roughness_image, normal_image


def new_material(name):
    old = bpy.data.materials.get(name)
    if old is not None and old.users == 0:
        bpy.data.materials.remove(old)
    material = bpy.data.materials.new(name + " new")
    material.use_nodes = True
    return material


def add_uv_texture(nodes, links, image, mapping, target_socket, name):
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = name
    texture.image = image
    texture.interpolation = "Linear"
    links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], target_socket)
    return texture


def build_dry_material(albedo_image, roughness_image, normal_image):
    material = new_material("reference dark concrete")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.name = "concrete UV"
    mapping = nodes.new("ShaderNodeMapping")
    mapping.name = "concrete scale"
    mapping.inputs["Scale"].default_value = (2.35, 2.35, 1.0)
    links.new(coordinates.outputs["UV"], mapping.inputs["Vector"])

    add_uv_texture(nodes, links, albedo_image, mapping, bsdf.inputs["Base Color"], "concrete albedo")
    add_uv_texture(nodes, links, roughness_image, mapping, bsdf.inputs["Roughness"], "concrete roughness")

    normal_texture = nodes.new("ShaderNodeTexImage")
    normal_texture.name = "concrete normal"
    normal_texture.image = normal_image
    normal_texture.interpolation = "Linear"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.name = "concrete normal strength"
    normal_map.inputs["Strength"].default_value = 0.72
    links.new(mapping.outputs["Vector"], normal_texture.inputs["Vector"])
    links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["IOR"].default_value = 1.46
    return material


def build_moisture_material(name, color, roughness, coat, normal_image, normal_strength):
    material = new_material(name)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["IOR"].default_value = 1.34
    if bsdf.inputs.get("Coat Weight"):
        bsdf.inputs["Coat Weight"].default_value = coat
    if bsdf.inputs.get("Coat Roughness"):
        bsdf.inputs["Coat Roughness"].default_value = roughness * 0.70

    coordinates = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (2.35, 2.35, 1.0)
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = normal_image
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = normal_strength
    links.new(coordinates.outputs["UV"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


floor = bpy.data.objects.get(FLOOR_NAME)
if floor is None or floor.type != "MESH":
    raise RuntimeError(f"Could not find mesh object: {FLOOR_NAME}")
if len(floor.data.materials) < 3:
    raise RuntimeError("The localized floor is missing its dry/damp/water material slots.")

original_location = floor.location.copy()
original_rotation = floor.rotation_euler.copy()
original_scale = floor.scale.copy()
original_mesh = floor.data
original_vertex_count = len(original_mesh.vertices)
original_polygon_count = len(original_mesh.polygons)
original_coordinates = [vertex.co.copy() for vertex in original_mesh.vertices]
original_material_indices = [polygon.material_index for polygon in original_mesh.polygons]

albedo_image, roughness_image, normal_image = generate_reference_concrete_textures()
dry = build_dry_material(albedo_image, roughness_image, normal_image)
damp = build_moisture_material(
    "reference damp concrete",
    (0.010, 0.013, 0.014),
    0.46,
    0.08,
    normal_image,
    0.48,
)
water = build_moisture_material(
    "reference shallow water",
    (0.003, 0.005, 0.006),
    0.23,
    0.24,
    normal_image,
    0.20,
)

floor.data.materials.clear()
floor.data.materials.append(dry)
floor.data.materials.append(damp)
floor.data.materials.append(water)
for polygon, material_index in zip(floor.data.polygons, original_material_indices):
    polygon.material_index = material_index

for material in list(bpy.data.materials):
    if material in {dry, damp, water}:
        continue
    if material.name.startswith(("reference dark concrete", "reference damp concrete", "reference shallow water")) and material.users == 0:
        bpy.data.materials.remove(material)
dry.name = "reference dark concrete"
damp.name = "reference damp concrete"
water.name = "reference shallow water"

if floor.location != original_location or floor.rotation_euler != original_rotation or floor.scale != original_scale:
    raise RuntimeError("Floor transform changed while replacing the material.")
if floor.data is not original_mesh:
    raise RuntimeError("Floor mesh datablock changed while replacing the material.")
if len(floor.data.vertices) != original_vertex_count or len(floor.data.polygons) != original_polygon_count:
    raise RuntimeError("Floor topology changed while replacing the material.")
if any(vertex.co != coordinate for vertex, coordinate in zip(floor.data.vertices, original_coordinates)):
    raise RuntimeError("Floor vertex positions changed while replacing the material.")
if any(polygon.material_index != index for polygon, index in zip(floor.data.polygons, original_material_indices)):
    raise RuntimeError("Floor material-region assignments changed unexpectedly.")

scene = bpy.context.scene
scene.render.filepath = OUTPUT_RENDER
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND, check_existing=False)

print(
    "GROUND_CONCRETE_REPLACED",
    f"vertices={len(floor.data.vertices)}",
    f"polygons={len(floor.data.polygons)}",
    f"materials={[material.name for material in floor.data.materials]}",
    f"location={tuple(round(value, 6) for value in floor.location)}",
    f"rotation={tuple(round(value, 6) for value in floor.rotation_euler)}",
    f"scale={tuple(round(value, 6) for value in floor.scale)}",
)
