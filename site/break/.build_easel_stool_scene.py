import bpy
import os
from math import radians
from mathutils import Vector


OUTPUT_DIR = r"C:\Users\think\Desktop\personalwebsite\personal-website\site\break\assets"
OUTPUT_BLEND = os.path.join(OUTPUT_DIR, "easel-stool-scene.blend")
OUTPUT_PREVIEW = os.path.join(OUTPUT_DIR, "easel-stool-scene-preview.png")
SOURCE_BLEND = r"E:\0 素材\画架\A442 美术绘画工具\1.blend"
TV_SCENE = r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets\television\television-water-scene.blend"
FLOOR_NAME = "pitted concrete floor"
EASEL_GROUP = "Group1"
STOOL_GROUP = "Group4"


def descendants(root):
    return {root, *root.children_recursive}


def append_floor(collection):
    with bpy.data.libraries.load(TV_SCENE, link=False) as (source, target):
        target.objects = [FLOOR_NAME]
    floor = bpy.data.objects.get(FLOOR_NAME)
    if floor is None:
        raise RuntimeError(f"Could not append {FLOOR_NAME!r} from the television scene")
    for existing_collection in list(floor.users_collection):
        existing_collection.objects.unlink(floor)
    collection.objects.link(floor)
    floor.name = "television concrete floor"
    return floor


def retain_easel_and_stool():
    """Keep exactly the two user-grouped assets from the opened source blend."""
    source_root = bpy.data.objects["Model"]
    easel = bpy.data.objects[EASEL_GROUP]
    stool = bpy.data.objects[STOOL_GROUP]
    keep = descendants(source_root) & (descendants(easel) | descendants(stool) | {source_root})

    for obj in list(bpy.context.scene.objects):
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    for old_collection in list(bpy.data.collections):
        bpy.data.collections.remove(old_collection)

    collection = bpy.data.collections.new("easel + stool")
    bpy.context.scene.collection.children.link(collection)
    for obj in keep:
        for old_collection in list(obj.users_collection):
            old_collection.objects.unlink(obj)
        collection.objects.link(obj)

    source_root.name = "easel + stool"
    easel.name = "easel"
    stool.name = "stool"

    # Keep the source blend's orientation and centimeter-to-meter conversion.
    # Its shared root already carries both; only scale it up for the BREAK
    # composition, retaining the artist's placement of the two groups.
    source_root.scale *= 12.0
    source_root.location.x = -1.18
    source_root.location.y = 0.28
    bpy.context.view_layer.update()
    corners = [
        obj.matrix_world @ Vector(corner)
        for obj in keep
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    source_root.location.z -= min(point.z for point in corners)
    bpy.context.view_layer.update()
    return source_root


def material(name, color, metallic=0.0, roughness=0.5, emission=None):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission[0], 1.0)
        shader.inputs["Emission Strength"].default_value = emission[1]
    return value


def add_floor_lamp(collection):
    """Minimal reference-style floor lamp: disc base, slim stem, tapered shade."""
    lamp = bpy.data.objects.new("floor lamp — red glow", None)
    collection.objects.link(lamp)
    lamp.location = (0.18, 2.78, 0.0)

    metal = material("lamp brushed steel", (0.16, 0.17, 0.18), metallic=0.85, roughness=0.26)
    shade = material("lamp shade warm grey", (0.63, 0.62, 0.59), metallic=0.0, roughness=0.64)
    red = material("lamp bulb red emission", (0.85, 0.015, 0.01), roughness=0.25, emission=((1.0, 0.0, 0.0), 7.0))

    def primitive(operator, name, location, scale, surface):
        operator(location=location)
        obj = bpy.context.object
        obj.name = name
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(surface)
        obj.parent = lamp
        return obj

    primitive(
        lambda **kwargs: bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.19, depth=0.045, **kwargs),
        "lamp base", (0, 0, 0.023), (1, 1, 1), metal,
    )
    primitive(
        lambda **kwargs: bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.018, depth=1.54, **kwargs),
        "lamp stem", (0, 0, 0.80), (1, 1, 1), metal,
    )
    primitive(
        lambda **kwargs: bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, **kwargs),
        "lamp red bulb", (0, 0, 1.62), (0.08, 0.08, 0.08), red,
    )
    primitive(
        lambda **kwargs: bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.22, radius2=0.15, depth=0.30, **kwargs),
        "lamp tapered shade", (0, 0, 1.72), (1, 1, 1), shade,
    )
    primitive(
        lambda **kwargs: bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.148, depth=0.012, **kwargs),
        "lamp red diffuser", (0, 0, 1.565), (1, 1, 1), red,
    )

    glow_data = bpy.data.lights.new("lamp red point light", "POINT")
    glow_data.color = (1.0, 0.01, 0.0)
    glow_data.energy = 95
    glow_data.shadow_soft_size = 0.32
    glow = bpy.data.objects.new("lamp red point light", glow_data)
    collection.objects.link(glow)
    glow.location = (0, 0, 1.58)
    glow.parent = lamp
    return lamp


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def make_camera(collection):
    data = bpy.data.cameras.new("break detail preview camera")
    data.lens = 52
    camera = bpy.data.objects.new("break detail preview camera", data)
    collection.objects.link(camera)
    camera.location = (4.7, -4.3, 2.5)
    # Aim a little to the asset's right so the arrangement sits on the left
    # side of the BREAK detail composition.
    look_at(camera, (2.4, 2.72, 0.82))
    bpy.context.scene.camera = camera


def make_preview_lights(collection):
    key_data = bpy.data.lights.new("preview softbox", "AREA")
    key_data.energy = 650
    key_data.shape = "DISK"
    key_data.size = 4.5
    key = bpy.data.objects.new("preview softbox", key_data)
    collection.objects.link(key)
    key.location = (-2.4, -2.8, 4.2)
    look_at(key, (-1.1, 0.25, 0.8))

    fill_data = bpy.data.lights.new("preview fill", "AREA")
    fill_data.energy = 180
    fill_data.shape = "RECTANGLE"
    fill_data.size = 3.0
    fill = bpy.data.objects.new("preview fill", fill_data)
    collection.objects.link(fill)
    fill.location = (2.6, -1.0, 1.8)
    look_at(fill, (-1.0, 0.2, 0.72))


def configure_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.filepath = OUTPUT_PREVIEW
    scene.view_settings.look = "Medium High Contrast"


root = retain_easel_and_stool()
environment = bpy.data.collections.new("ground only")
bpy.context.scene.collection.children.link(environment)
append_floor(environment)
lamp = add_floor_lamp(bpy.data.collections["easel + stool"])

# Save the deliverable before adding temporary preview-only camera and lights:
# opening the blend shows just the floor, easel, stool, and floor lamp.
bpy.context.view_layer.objects.active = root
root.select_set(True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)

lighting = bpy.data.collections.new("temporary preview lighting")
bpy.context.scene.collection.children.link(lighting)
make_camera(lighting)
make_preview_lights(lighting)
configure_render()
bpy.ops.render.render(write_still=True)
print(f"SAVED_BLEND={OUTPUT_BLEND}")
print(f"SAVED_PREVIEW={OUTPUT_PREVIEW}")
