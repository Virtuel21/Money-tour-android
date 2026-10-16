"""Author the runtime board in Blender, preserving the existing scene and artwork.

Run via Blender MCP: exec(compile(open(path, encoding='utf-8').read(), path, 'exec')).
Geometry measurements and lossless canvas textures live in board-source/.
Coordinates in the manifest are Three.js Y-up; editable meshes are Blender Z-up.
"""
import bpy
import json
import math
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'scripts', 'board-source')
manifest = json.load(open(os.path.join(SOURCE, 'manifest.json'), encoding='utf-8'))
previous = [s for s in bpy.data.scenes if s.get('money_tour_board_source')]
owned = set(o for s in previous for o in s.objects)
if bpy.context.window.scene in previous:
    bpy.context.window.scene = next(s for s in bpy.data.scenes if s not in previous)
for obj in owned:
    bpy.data.objects.remove(obj, do_unlink=True)
for old in previous:
    bpy.data.scenes.remove(old)
scene = bpy.data.scenes.new('Money Tour · Exact runtime board')
scene['money_tour_board_source'] = True
bpy.context.window.scene = scene
collection = scene.collection
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'apps/web/public/models/money-tour.glb'))
originals = {name: scene.objects.get(name) for name in ['board', 'tile']}
imported = list(scene.objects)
cache = {}
materials = {}


def material(name, color, roughness=.95, opacity=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*linear, opacity)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Alpha'].default_value = opacity
    mat.diffuse_color = (*linear, opacity)
    materials[name] = mat
    return mat


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = parent
    return obj


def box(name, size, position, mat, parent):
    key = ('box', tuple(round(s, 10) for s in size), mat.name)
    if key not in cache:
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj = bpy.context.object
        obj.scale = (size[0], size[2], size[1])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(mat)
        cache[key] = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
    obj = bpy.data.objects.new(name, cache[key])
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = (position[0], -position[2], position[1])
    return obj


def plane(name, width, depth, position, mat, parent, angle=0):
    key = ('plane', round(width, 10), round(depth, 10), mat.name)
    if key not in cache:
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(-width/2, depth/2, 0), (width/2, depth/2, 0),
                          (-width/2, -depth/2, 0), (width/2, -depth/2, 0)], [], [(0, 2, 1), (2, 3, 1)])
        uv = mesh.uv_layers.new(name='UVMap')
        coords = [(0, 1), (1, 1), (0, 0), (1, 0)]
        for face in mesh.polygons:
            for loop in face.loop_indices:
                uv.data[loop].uv = coords[mesh.loops[loop].vertex_index]
        mesh.materials.append(mat)
        mesh.update()
        cache[key] = mesh
    obj = bpy.data.objects.new(name, cache[key])
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = (position[0], -position[2], position[1])
    obj.rotation_euler.z = angle
    return obj


def duplicate(original, name, parent, scale):
    obj = original.copy()
    obj.name = name
    collection.objects.link(obj)
    obj.parent = parent
    obj.scale = scale
    for child in original.children:
        duplicate(child, name + ' / ' + child.name, obj, child.scale)
    return obj


sea_mat = material('board_water', '#31cbd0', .4)
foam_mat = material('board_foam', '#b1f5ed', 1, .55)
# Unlit graphic ripples reproduce MeshBasicMaterial, including its alpha.
foam_shader = next(n for n in foam_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
foam_shader.inputs['Emission Color'].default_value = foam_shader.inputs['Base Color'].default_value
foam_shader.inputs['Emission Strength'].default_value = 1
trim_mat = material('board_owner', '#ffffff', 1)
selection_mat = material('board_selection', '#ffdf55', 1, .7)
quay_edge = material('board_quay_edge', '#537e80', .9)
quay_floor = material('board_quay_floor', '#fff1cc', .9)
surface_mat = material('board_artwork', '#ffffff')
backdrop_mat = material('board_backdrop', '#25625e')
decal_mat = material('board_decal', '#ffffff')
island_mat = material('board_island', '#ffffff')

# Texture swatches are part of the GLB and remain editable in the .blend.
swatches = empty('board_surfaces')
for i, variant in enumerate(manifest['variants']):
    mat = material('board_surface_' + str(i), '#ffffff')
    image = bpy.data.images.load(os.path.join(SOURCE, variant['file']), check_existing=True)
    image.pack()
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    obj = plane('swatch_' + str(i), 1, 1, (0, -5, 0), mat, swatches)
    obj['surfaceKey'] = variant['key']

config = json.load(open(os.path.join(ROOT, 'packages/engine/src/game.config.json'), encoding='utf-8'))
runtime_roots = [swatches]
for shape in manifest['shapes']:
    count = shape['count']
    root = empty('board_' + str(count))
    runtime_roots.append(root)
    root['tileCount'] = count
    duplicate(originals['board'], 'platform_' + str(count), root,
              ((shape['x'] * 2 + shape['depth']) / 16.65,
               (shape['z'] * 2 + shape['depth']) / 16.65, 1))
    box('water_' + str(count), (shape['x'] * 2 - shape['depth'], .06, shape['z'] * 2 - shape['depth']), (0, .02, 0), sea_mat, root)
    for i in range(34):
        plane('ripple_' + str(count) + '_' + str(i), .22 + (i % 3) * .13, .045,
              (((i * 37) % 113) / 10 - 5.5, .06, ((i * 29) % 109) / 10 - 5.4), foam_mat, root, -math.pi / 4)
    # The four original dioramas are camera-facing textured meshes, authored once.
    scale = min(1, (shape['x']-3.38)/6.15, (shape['z']-3.38)/5.4)
    forward = Vector((18, 22, 18)).normalized()
    right = Vector((0, 1, 0)).cross(forward).normalized()
    camera_up = forward.cross(right)
    for i, (x, z) in enumerate([(-2.5, -1.6), (2.5, -1.6), (-2.5, 2.2), (2.5, 2.2)]):
        obj = plane('island_' + str(count) + '_' + str(i), 3.05, 3.05, (0, 0, 0), island_mat, root)
        obj.data = obj.data.copy()
        for vertex, (sx, sy) in zip(obj.data.vertices, [(-.5, .95), (.5, .95), (-.5, -.05), (.5, -.05)]):
            v = (Vector((x, .08, z)) + right * sx * 3.05 + camera_up * sy * 3.05) * scale
            vertex.co = (v.x, -v.z, v.y)
        obj.data.update()
        obj['atlasIndex'] = i+2
    for tile in shape['tiles']:
        i, x, z = tile['id'], tile['x'], tile['z']
        prefix = str(count) + '_' + str(i)
        cell = empty('cell_' + prefix, root)
        model = duplicate(originals['tile'], 'tile_' + prefix, cell, (tile['width']/1.66, tile['depth']/1.66, 1))
        model.location = (x, -z, 0)
        plane('surface_' + prefix, tile['width']-.12, tile['depth']-.12, (x, .28, z), surface_mat, cell)
        icon_size = min(tile['width'], tile['depth']) - .12
        plane('icon_' + prefix, icon_size, icon_size, (x, .28, z), surface_mat, cell)
        plane('backdrop_' + prefix, tile['width']-.12, tile['depth']-.12, (x, .276, z), backdrop_mat, cell)
        normal = tile['normal']
        trim = box('trim_' + prefix, ((shape['depth'] if tile['corner'] else shape['step'])-.04, .5, .16),
                   (x+normal['x']*1.69, .305, z+normal['z']*1.69), trim_mat, cell)
        trim.rotation_euler.z = tile['angle']
        box('selection_' + prefix, (tile['width']-.15, .025, tile['depth']-.15), (x, .27, z), selection_mat, cell)
        label = tile['label']
        quay = empty('quay_' + prefix, cell)
        quay.location = (label['rent']['x'], -label['rent']['z'], .16)
        quay.rotation_euler.z = tile['angle']
        box('quay_edge_' + prefix, (label['width']+.06, .16, 1.5), (0, 0, 0), quay_edge, quay)
        box('quay_floor_' + prefix, (label['width'], .05, 1.44), (0, .1, 0), quay_floor, quay)
        plane('wreck_' + prefix, 2.65, 2.65, (x-normal['x']*.3, .286, z-normal['z']*.3), decal_mat, cell, tile['angle'])

# Preserve imported source data without exporting the source scene's other models.
for obj in imported:
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    obj.select_set(True)
export_path = os.path.join(ROOT, 'apps/web/public/models/board-layout.glb')
import io_scene_gltf2
fmt = next(item[0] for item in io_scene_gltf2.get_format_items(scene, bpy.context) if item[0] == 'GLB')
bpy.ops.export_scene.gltf(filepath=export_path, export_format=fmt, use_selection=True,
                          use_active_scene=True, export_yup=True, export_extras=True)

# A separate scene presents the exact 32-cell board without overlapping variants.
display = bpy.data.scenes.new('Money Tour · Board inspection')
display['money_tour_board_source'] = True
for obj in scene.objects:
    ancestor = obj
    while ancestor.parent:
        ancestor = ancestor.parent
    if ancestor.name == 'board_32':
        display.collection.objects.link(obj)
bpy.context.window.scene = display
for tile in config['board']:
    i = tile['id']
    key = f"{tile['type']}:{tile.get('group', '')}:{tile.get('color', '')}"
    index = next(k for k, v in enumerate(manifest['variants']) if v['key'] == key)
    obj = display.objects['surface_32_' + str(i)]
    obj.data = obj.data.copy()
    obj.data.materials.clear()
    obj.data.materials.append(materials['board_surface_' + str(index)])
    for name in ['icon', 'backdrop', 'trim', 'selection', 'wreck']:
        display.objects[name + '_32_' + str(i)].hide_render = True
        display.objects[name + '_32_' + str(i)].hide_set(True)
    for obj in [display.objects['quay_32_' + str(i)], *display.objects['quay_32_' + str(i)].children]:
        obj.hide_render = True
        obj.hide_set(True)

def preview_texture(obj, filename, index=None, columns=1, angle=0):
    mat = material('Preview / ' + obj.name, '#ffffff')
    image = bpy.data.images.load(os.path.join(ROOT, 'apps/web/public/textures', filename), check_existing=True)
    image.pack()
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    uv = mat.node_tree.nodes.new('ShaderNodeTexCoord')
    mapping = mat.node_tree.nodes.new('ShaderNodeMapping')
    mat.node_tree.links.new(uv.outputs['UV'], mapping.inputs['Vector'])
    if index is not None:
        mapping.inputs['Scale'].default_value = (1/columns, .5, 1)
        mapping.inputs['Location'].default_value = ((index % columns)/columns, .5 if index < columns else 0, 0)
    if angle:
        mapping.inputs['Rotation'].default_value.z = -angle
        mapping.inputs['Location'].default_value = (0, 1, 0)
    mat.node_tree.links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    mat.node_tree.links.new(tex.outputs['Alpha'], shader.inputs['Alpha'])
    if obj.name.startswith('island_'):
        mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value = 1
    obj.data = obj.data.copy()
    obj.data.materials.clear()
    obj.data.materials.append(mat)

for tile, frame in zip(config['board'], manifest['shapes'][-1]['tiles']):
    i, kind = tile['id'], tile['type']
    if kind in ['chance', 'tax', 'insurance']:
        preview_texture(display.objects['surface_32_' + str(i)], kind+'-tile-v2.webp', angle=frame['angle'])
    if kind in ['casino', 'karma']:
        display.objects['surface_32_' + str(i)].hide_render = True
        display.objects['surface_32_' + str(i)].hide_set(True)
        icon = display.objects['icon_32_' + str(i)]
        icon.hide_render = False
        icon.hide_set(False)
        backdrop = display.objects['backdrop_32_' + str(i)]
        backdrop.hide_render = False
        backdrop.hide_set(False)
        preview_texture(icon, 'expansion-v1.webp', 0 if kind=='casino' and i<15 else 1 if kind=='casino' else 3, 2)
    if kind == 'island':
        wreck = display.objects['wreck_32_' + str(i)]
        wreck.hide_render = False
        wreck.hide_set(False)
        preview_texture(wreck, 'lost-island-v1.webp')
for i in range(4):
    preview_texture(display.objects['island_32_' + str(i)], 'architecture-v3.webp', i+2, 3)
camera_data = bpy.data.cameras.new('Board camera')
camera_data.type = next(i.identifier for i in camera_data.bl_rna.properties['type'].enum_items if i.identifier == 'ORTHO')
camera_data.ortho_scale = 36
camera = bpy.data.objects.new('Board camera', camera_data)
display.collection.objects.link(camera)
camera.location = (18, -18, 22)
camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
display.camera = camera
display.render.resolution_x = 1600
display.render.resolution_y = 1200
display.render.resolution_percentage = 100
world = bpy.data.worlds.new('Board studio')
world.use_nodes = True
display.world = world
next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Strength'].default_value = .8
lamp_data = bpy.data.lights.new('Warm key', 'AREA')
lamp_data.energy = 2400
lamp_data.size = 12
lamp = bpy.data.objects.new('Warm key', lamp_data)
display.collection.objects.link(lamp)
lamp.location = (-8, -10, 20)
lamp.rotation_euler = (-lamp.location).to_track_quat('-Z', 'Y').to_euler()
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
blend_path = os.environ.get('MONEY_TOUR_BOARD_BLEND_OUT', os.path.join(ROOT, 'artifacts', 'money-tour-board.blend'))
os.makedirs(os.path.dirname(blend_path), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
print(json.dumps({'export': export_path, 'bytes': os.path.getsize(export_path), 'blend': blend_path,
                  'objects': len(scene.objects), 'meshes': len(cache), 'textures': len(manifest['variants'])}))
