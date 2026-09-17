import bpy
from mathutils import Vector


OUTPUT_BLEND = r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets\television\television-water-scene.blend"
SCREEN_NAME = "CRT_screen_replaceable"
BODY_NAME = "CRT_television_body"

# The source TV was delivered as one mesh, without a separate screen object.
# Vertex 147 is the centre of its actual recessed CRT glass. Its twelve
# connected faces form that glass exactly: this is topology extracted from the
# original model, not a new plane, a bounding-box estimate, or a raycast over
# the whole housing.
CRT_GLASS_CENTER_VERTEX_INDEX = 147
ANTI_Z_FIGHT_OFFSET_LOCAL = 0.035  # 0.00035 in exported scene units


body = bpy.data.objects.get(BODY_NAME)
old_screen = bpy.data.objects.get(SCREEN_NAME)
if body is None:
    raise RuntimeError("The television body was not found.")

screen_material = old_screen.data.materials[0] if old_screen and old_screen.data.materials else None
if old_screen:
    bpy.data.objects.remove(old_screen, do_unlink=True)

glass_faces = [
    polygon for polygon in body.data.polygons
    if CRT_GLASS_CENTER_VERTEX_INDEX in polygon.vertices
]
if len(glass_faces) != 12:
    raise RuntimeError(
        f"Expected 12 faces connected to the CRT glass centre; found {len(glass_faces)}."
    )

source_vertex_indices = sorted({index for face in glass_faces for index in face.vertices})
index_map = {source_index: new_index for new_index, source_index in enumerate(source_vertex_indices)}

# Offset each copied point by its own glass normal. The layer therefore stays
# on the original curved glass, only a sub-millimetre ahead to prevent flicker.
vertex_normals = {source_index: Vector() for source_index in source_vertex_indices}
for face in glass_faces:
    for source_index in face.vertices:
        vertex_normals[source_index] += face.normal

positions = []
for source_index in source_vertex_indices:
    normal = vertex_normals[source_index].normalized()
    positions.append(body.data.vertices[source_index].co + normal * ANTI_Z_FIGHT_OFFSET_LOCAL)

# UVs determine only how project imagery is cropped; the copied CRT topology
# is the visible mask. The bounds are measured from those same glass vertices.
min_x = min(position.x for position in positions)
max_x = max(position.x for position in positions)
min_z = min(position.z for position in positions)
max_z = max(position.z for position in positions)
uvs = [
    ((position.x - min_x) / (max_x - min_x), (position.z - min_z) / (max_z - min_z))
    for position in positions
]
faces = [tuple(index_map[source_index] for source_index in face.vertices) for face in glass_faces]

mesh = bpy.data.meshes.new(f"{SCREEN_NAME} mesh")
mesh.from_pydata(positions, [], faces)
mesh.uv_layers.new(name="CRT content UV")
for polygon in mesh.polygons:
    for loop_index in polygon.loop_indices:
        mesh.uv_layers.active.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
mesh.update()

screen = bpy.data.objects.new(SCREEN_NAME, mesh)
bpy.context.collection.objects.link(screen)
screen.matrix_world = body.matrix_world.copy()
if screen_material:
    mesh.materials.append(screen_material)

print(
    "Extracted original CRT glass faces:",
    [face.index for face in glass_faces],
    "local bounds:",
    tuple(round(value, 4) for value in (min_x, max_x, min_z, max_z)),
)
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND, check_existing=False)
