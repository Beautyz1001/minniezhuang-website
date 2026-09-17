import bpy
import os
import math
from mathutils import Vector


SOURCE_BLEND = r"E:\0 素材\电视机\4\4.blend"
TEXTURE_DIR = r"E:\0 素材\电视机\4\maps"
OUTPUT_BLEND = r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets\television\television-water-scene.blend"
OUTPUT_RENDER = r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets\television\television-water-preview.png"
CONCRETE_TEXTURE_DIR = r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets\television\textures\worn-concrete-floor"


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(name, color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat, bsdf


def cube(name, location, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("softened edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    return obj


def curved_screen(name, center, half_width, half_height, front_y, mat, rings=24, segments=96):
    """A smooth superellipse CRT face, with no straight chamfered corners."""
    vertices = [(center[0], front_y - 0.006, center[2])]
    uvs = [(0.5, 0.5)]
    faces = []
    exponent = 4.4  # Soft-square CRT outline: rounder than a rectangle, not an oval.

    for ring in range(1, rings + 1):
        radius = ring / rings
        for segment in range(segments):
            angle = math.tau * segment / segments
            cosine, sine = math.cos(angle), math.sin(angle)
            x_shape = math.copysign(abs(cosine) ** (2 / exponent), cosine)
            z_shape = math.copysign(abs(sine) ** (2 / exponent), sine)
            x = center[0] + x_shape * half_width * radius
            z = center[2] + z_shape * half_height * radius
            # Only a tiny centre bulge, kept within the television's existing bezel.
            y = front_y - 0.006 * (1 - radius * radius)
            vertices.append((x, y, z))
            uvs.append(((x_shape * radius + 1) * 0.5, (z_shape * radius + 1) * 0.5))

    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for ring in range(1, rings):
        inner = 1 + (ring - 1) * segments
        outer = 1 + ring * segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append((inner + segment, outer + segment, outer + next_segment, inner + next_segment))

    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    uv_layer = mesh.uv_layers.new(name="CRT content UV")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            uv_layer.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
    mesh.materials.append(mat)
    screen = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(screen)
    return screen


def crack(name, points, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.004
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def area(name, location, target, color, power, size):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    point_at(light, target)
    return light


bpy.ops.wm.open_mainfile(filepath=SOURCE_BLEND, load_ui=False)

# The supplied source uses absolute paths from its original authoring machine.
# Reattach the adjacent maps and make a compact, self-contained material for web export.
television = next(obj for obj in bpy.data.objects if obj.type == "MESH")
television.name = "CRT_television_body"
television.scale = (8.0, 8.0, 8.0)
bpy.context.view_layer.objects.active = television
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

for image in bpy.data.images:
    if image.filepath:
        image.filepath = os.path.join(TEXTURE_DIR, os.path.basename(image.filepath))
        image.reload()

tv_mat, tv_bsdf = material("television aged plastic", (0.09, 0.10, 0.11), roughness=0.52, metallic=0.05)
nodes = tv_mat.node_tree.nodes
links = tv_mat.node_tree.links
diffuse = bpy.data.images.get("file44")
normal = bpy.data.images.get("file43")
specular = bpy.data.images.get("file46")

if diffuse:
    diffuse.colorspace_settings.name = "sRGB"
    diffuse_node = nodes.new("ShaderNodeTexImage")
    diffuse_node.image = diffuse
    diffuse_node.name = "albedo"
    links.new(diffuse_node.outputs["Color"], tv_bsdf.inputs["Base Color"])
if normal:
    normal.colorspace_settings.name = "Non-Color"
    normal_node = nodes.new("ShaderNodeTexImage")
    normal_node.image = normal
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.45
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], tv_bsdf.inputs["Normal"])
if specular:
    specular.colorspace_settings.name = "Non-Color"
    specular_node = nodes.new("ShaderNodeTexImage")
    specular_node.image = specular
    links.new(specular_node.outputs["Color"], tv_bsdf.inputs["Roughness"])
television.data.materials.clear()
television.data.materials.append(tv_mat)

# Lift the original asset precisely onto the shallow water's floor.
min_z = min((television.matrix_world @ Vector(corner)).z for corner in television.bound_box)
television.location.z -= min_z

# A dark, inset screen only fills the original CRT aperture. It is not a separate block.
screen_mat, screen_bsdf = material("screen phosphor", (0.001, 0.006, 0.007), roughness=0.22, metallic=0.06)
screen_bsdf.inputs["Emission Color"].default_value = (0.004, 0.020, 0.018, 1)
screen_bsdf.inputs["Emission Strength"].default_value = 0.82
screen_nodes = screen_mat.node_tree.nodes
screen_links = screen_mat.node_tree.links
noise = screen_nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 280.0
noise.inputs["Detail"].default_value = 2.0
ramp = screen_nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.31
ramp.color_ramp.elements[0].color = (0.004, 0.008, 0.009, 1)
ramp.color_ramp.elements[1].position = 0.69
ramp.color_ramp.elements[1].color = (0.38, 0.48, 0.52, 1)
screen_links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
screen_links.new(ramp.outputs["Color"], screen_bsdf.inputs["Emission Color"])
screen = curved_screen("CRT_screen_replaceable", (-0.105, 0, 0.307), 0.245, 0.184, -0.272, screen_mat)

# The screen is fitted to the supplied television's real glass surface, not its overall bounds.
screen_wrap = screen.modifiers.new("fit to original CRT glass", "SHRINKWRAP")
screen_wrap.target = television
screen_wrap.wrap_method = "NEAREST_SURFACEPOINT"
screen_wrap.wrap_mode = "ON_SURFACE"
screen_wrap.offset = 0.0005
bpy.context.view_layer.objects.active = screen
screen.select_set(True)
bpy.ops.object.modifier_apply(modifier=screen_wrap.name)
screen.select_set(False)

# Set up the dark room and an uneven, damaged concrete floor.
world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.002, 0.003, 0.006, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0

concrete, concrete_bsdf = material("scanned worn concrete", (0.01, 0.012, 0.014), roughness=0.86)
concrete_nodes = concrete.node_tree.nodes
concrete_links = concrete.node_tree.links
coordinates = concrete_nodes.new("ShaderNodeTexCoord")
mapping = concrete_nodes.new("ShaderNodeMapping")
mapping.inputs["Scale"].default_value = (2.2, 2.2, 1.0)
concrete_links.new(coordinates.outputs["Generated"], mapping.inputs["Vector"])

diffuse_concrete = bpy.data.images.load(os.path.join(CONCRETE_TEXTURE_DIR, "diffuse.jpg"))
diffuse_concrete.colorspace_settings.name = "sRGB"
diffuse_node = concrete_nodes.new("ShaderNodeTexImage")
diffuse_node.image = diffuse_concrete
darken = concrete_nodes.new("ShaderNodeMixRGB")
darken.blend_type = "MULTIPLY"
darken.inputs["Fac"].default_value = 1.0
darken.inputs[2].default_value = (0.10, 0.12, 0.14, 1)
concrete_links.new(mapping.outputs["Vector"], diffuse_node.inputs["Vector"])
concrete_links.new(diffuse_node.outputs["Color"], darken.inputs[1])
concrete_links.new(darken.outputs["Color"], concrete_bsdf.inputs["Base Color"])

roughness_concrete = bpy.data.images.load(os.path.join(CONCRETE_TEXTURE_DIR, "roughness.jpg"))
roughness_concrete.colorspace_settings.name = "Non-Color"
roughness_node = concrete_nodes.new("ShaderNodeTexImage")
roughness_node.image = roughness_concrete
concrete_links.new(mapping.outputs["Vector"], roughness_node.inputs["Vector"])
concrete_links.new(roughness_node.outputs["Color"], concrete_bsdf.inputs["Roughness"])

normal_concrete = bpy.data.images.load(os.path.join(CONCRETE_TEXTURE_DIR, "normal-gl.png"))
normal_concrete.colorspace_settings.name = "Non-Color"
normal_node = concrete_nodes.new("ShaderNodeTexImage")
normal_node.image = normal_concrete
normal_map = concrete_nodes.new("ShaderNodeNormalMap")
normal_map.inputs["Strength"].default_value = 0.68
concrete_links.new(mapping.outputs["Vector"], normal_node.inputs["Vector"])
concrete_links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
concrete_links.new(normal_map.outputs["Normal"], concrete_bsdf.inputs["Normal"])

displacement_concrete = bpy.data.images.load(os.path.join(CONCRETE_TEXTURE_DIR, "displacement.png"))
displacement_concrete.colorspace_settings.name = "Non-Color"
displacement_node = concrete_nodes.new("ShaderNodeTexImage")
displacement_node.image = displacement_concrete
concrete_bump = concrete_nodes.new("ShaderNodeBump")
concrete_bump.inputs["Strength"].default_value = 0.42
concrete_bump.inputs["Distance"].default_value = 0.085
concrete_links.new(mapping.outputs["Vector"], displacement_node.inputs["Vector"])
concrete_links.new(displacement_node.outputs["Color"], concrete_bump.inputs["Height"])
concrete_links.new(concrete_bump.outputs["Normal"], concrete_bsdf.inputs["Normal"])

bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0.15, 0))
floor = bpy.context.object
floor.name = "pitted concrete floor"
floor.scale = (2.9, 2.45, 1)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
floor.data.materials.append(concrete)

# Rear wall is kept almost invisible: it only catches the television's rim light.
wall = cube("dark rear wall", (0, 1.82, 1.5), (2.9, 0.08, 1.8), concrete)

# Camera and sparse cinematic lighting.
bpy.ops.object.camera_add(location=(0.32, -4.30, 1.20))
camera = bpy.context.object
camera.name = "works television camera"
camera.data.lens = 61
point_at(camera, (-0.05, -0.02, 0.31))
bpy.context.scene.camera = camera

# This area source is the CRT's emitted light, not an environmental fill light.
area("screen spill", (-0.10, -0.52, 0.38), (-0.12, -0.78, -0.03), (0.47, 0.57, 0.64), 48, 0.36)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1600
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUTPUT_RENDER
scene.render.film_transparent = False
scene.view_settings.look = "Medium High Contrast"
scene.render.image_settings.color_mode = "RGBA"

# Keep the external asset portable for the later GLB/web export.
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND, check_existing=False)
bpy.ops.render.render(write_still=True)
