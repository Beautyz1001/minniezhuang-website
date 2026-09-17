import bpy


OUTPUT_GLB = r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets\television\television.glb"
WEB_OBJECTS = {
    "CRT_television_body",
    "CRT_screen_replaceable",
    "pitted concrete floor",
    "dark rear wall",
}


bpy.ops.object.select_all(action="DESELECT")
for name in WEB_OBJECTS:
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"Required web model object is missing: {name}")
    obj.select_set(True)

bpy.context.view_layer.objects.active = bpy.data.objects["CRT_television_body"]
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_GLB,
    export_format="GLB",
    use_selection=True,
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)
