import bpy


FLOOR_NAME = "pitted concrete floor"
OUTPUT_BLEND = r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets\television\television-water-scene.blend"
OUTPUT_RENDER = r"C:\Users\think\Desktop\personalwebsite\personal-website\site\works\assets\television\television-water-preview.png"


floor = bpy.data.objects.get(FLOOR_NAME)
if floor is None or floor.active_material is None:
    raise RuntimeError("Could not find the pitted concrete floor material.")

material = floor.active_material
nodes = material.node_tree.nodes
links = material.node_tree.links
bsdf = nodes.get("Principled BSDF")
mapping = nodes.get("Mapping")

if bsdf is None or mapping is None:
    raise RuntimeError("The concrete material is missing its expected shader nodes.")

# Remove a previous pass so this remains safe to run again while tuning the scene.
for node in list(nodes):
    if node.name.startswith("wetness_"):
        nodes.remove(node)

# Two different scales make the marks read as absorbed, irregular dampness rather
# than a patterned liquid surface. The material remains mostly dry.
large_noise = nodes.new("ShaderNodeTexNoise")
large_noise.name = "wetness_large_noise"
large_noise.inputs["Scale"].default_value = 1.25
large_noise.inputs["Detail"].default_value = 4.0
large_noise.inputs["Roughness"].default_value = 0.72
large_noise.inputs["Distortion"].default_value = 2.35

large_ramp = nodes.new("ShaderNodeValToRGB")
large_ramp.name = "wetness_large_shape"
large_ramp.color_ramp.elements[0].position = 0.50
large_ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
large_ramp.color_ramp.elements[1].position = 0.66
large_ramp.color_ramp.elements[1].color = (1, 1, 1, 1)

fine_noise = nodes.new("ShaderNodeTexNoise")
fine_noise.name = "wetness_fine_noise"
fine_noise.inputs["Scale"].default_value = 6.5
fine_noise.inputs["Detail"].default_value = 5.0
fine_noise.inputs["Roughness"].default_value = 0.78
fine_noise.inputs["Distortion"].default_value = 1.1

fine_ramp = nodes.new("ShaderNodeValToRGB")
fine_ramp.name = "wetness_fine_breakup"
fine_ramp.color_ramp.elements[0].position = 0.35
fine_ramp.color_ramp.elements[0].color = (0.20, 0.20, 0.20, 1)
fine_ramp.color_ramp.elements[1].position = 0.72
fine_ramp.color_ramp.elements[1].color = (1, 1, 1, 1)

mask_mix = nodes.new("ShaderNodeMixRGB")
mask_mix.name = "wetness_irregular_mask"
mask_mix.blend_type = "MULTIPLY"
mask_mix.inputs[0].default_value = 0.76

mask_strength = nodes.new("ShaderNodeMath")
mask_strength.name = "wetness_strength"
mask_strength.operation = "MULTIPLY"
mask_strength.inputs[1].default_value = 0.62

# Wet areas are only a little darker, but their lower roughness catches the CRT
# spill in a broken, shallow sheen instead of becoming a mirror or a water tray.
base_mix = nodes.new("ShaderNodeMixRGB")
base_mix.name = "wetness_base_color"
base_mix.inputs[2].default_value = (0.012, 0.018, 0.021, 1)

roughness_mix = nodes.new("ShaderNodeMixRGB")
roughness_mix.name = "wetness_roughness"
roughness_mix.inputs[2].default_value = (0.29, 0.29, 0.29, 1)

links.new(mapping.outputs["Vector"], large_noise.inputs["Vector"])
links.new(mapping.outputs["Vector"], fine_noise.inputs["Vector"])
links.new(large_noise.outputs["Fac"], large_ramp.inputs["Fac"])
links.new(fine_noise.outputs["Fac"], fine_ramp.inputs["Fac"])
links.new(large_ramp.outputs["Color"], mask_mix.inputs[1])
links.new(fine_ramp.outputs["Color"], mask_mix.inputs[2])
links.new(mask_mix.outputs["Color"], mask_strength.inputs[0])
links.new(mask_strength.outputs["Value"], base_mix.inputs[0])
links.new(mask_strength.outputs["Value"], roughness_mix.inputs[0])

base_input = bsdf.inputs["Base Color"]
roughness_input = bsdf.inputs["Roughness"]
for existing_link in list(base_input.links):
    links.new(existing_link.from_socket, base_mix.inputs[1])
    links.remove(existing_link)
for existing_link in list(roughness_input.links):
    links.new(existing_link.from_socket, roughness_mix.inputs[1])
    links.remove(existing_link)
links.new(base_mix.outputs["Color"], base_input)
links.new(roughness_mix.outputs["Color"], roughness_input)

# Keep node placement readable for future visual tuning in Blender.
large_noise.location = (180, -360)
large_ramp.location = (380, -360)
fine_noise.location = (180, -520)
fine_ramp.location = (380, -520)
mask_mix.location = (590, -390)
mask_strength.location = (780, -390)
base_mix.location = (980, 10)
roughness_mix.location = (980, -150)

scene = bpy.context.scene
scene.render.filepath = OUTPUT_RENDER
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND, check_existing=False)
bpy.ops.render.render(write_still=True)
