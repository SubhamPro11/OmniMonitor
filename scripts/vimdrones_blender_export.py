"""
Vimdrones Designer (Blender) Choreography Exporter
---------------------------------------------------
This script exports drone light show choreographies created in Blender
to the standard Vimdrones / OmniMonitor show-plan JSON format.

Usage in Blender:
1. Open your drone choreography .blend file.
2. Ensure drones are named "Drone_01", "DRONE-01", etc. or grouped in a "Drones" collection.
3. Run this script in the Blender Text Editor or from the command line:
   blender show.blend --background --python vimdrones_blender_export.py -- output_show.json
"""

import sys
import json

def export_blender_choreography(output_filepath="vimdrones_export.json"):
    try:
        import bpy
    except ImportError:
        print("[ERROR] This script must be executed inside Blender (import bpy failed).")
        return False

    scene = bpy.context.scene
    fps = scene.render.fps / scene.render.fps_base if hasattr(scene.render, "fps_base") else scene.render.fps
    frame_start = scene.frame_start
    frame_end = scene.frame_end
    total_frames = frame_end - frame_start + 1
    duration_sec = total_frames / fps

    print(f"[Vimdrones Exporter] FPS: {fps}, Frames: {frame_start} to {frame_end} ({duration_sec:.2f}s)")

    # Find drone objects (either in collection 'Drones' or matching name pattern)
    drone_objs = []
    if "Drones" in bpy.data.collections:
        drone_objs = [obj for obj in bpy.data.collections["Drones"].objects if obj.type == "MESH" or obj.type == "EMPTY"]
    else:
        drone_objs = [obj for obj in scene.objects if "drone" in obj.name.lower()]

    if not drone_objs:
        print("[WARNING] No objects in 'Drones' collection or matching 'drone'. Exporting all selected mesh objects.")
        drone_objs = [obj for obj in bpy.context.selected_objects if obj.type == "MESH" or obj.type == "EMPTY"]

    if not drone_objs:
        print("[ERROR] No drone objects found to export.")
        return False

    # Sort drone objects by name for consistent indexing
    drone_objs.sort(key=lambda o: o.name)
    print(f"[Vimdrones Exporter] Found {len(drone_objs)} drone objects.")

    drones_payload = []

    for idx, obj in enumerate(drone_objs):
        drone_id = f"DRONE-{str(idx + 1).zfill(2)}"
        keyframes = []

        for frame in range(frame_start, frame_end + 1):
            scene.frame_set(frame)
            t_offset_ms = int(((frame - frame_start) / fps) * 1000)

            # World position (Blender Z-up coordinates)
            loc = obj.matrix_world.translation
            x = round(float(loc.x), 3)
            y = round(float(loc.y), 3)
            z = round(float(loc.z), 3)

            # Extract LED material emission color if available
            r, g, b = 255, 255, 255
            brightness = 100

            if obj.material_slots and len(obj.material_slots) > 0:
                mat = obj.material_slots[0].material
                if mat and mat.use_nodes:
                    # Look for Emission node
                    for node in mat.node_tree.nodes:
                        if node.type == "EMISSION":
                            color = node.inputs["Color"].default_value
                            strength = node.inputs["Strength"].default_value
                            r = int(min(255, max(0, color[0] * 255)))
                            g = int(min(255, max(0, color[1] * 255)))
                            b = int(min(255, max(0, color[2] * 255)))
                            brightness = int(min(100, max(0, strength * 10)))
                            break

            keyframes.append({
                "t_offset_ms": t_offset_ms,
                "x": x,
                "y": y,
                "z": z,
                "r": r,
                "g": g,
                "b": b,
                "brightness": brightness
            })

        drones_payload.append({
            "drone_id": drone_id,
            "object_name": obj.name,
            "keyframes": keyframes
        })

    export_data = {
        "format": "vimdrones_designer_export",
        "version": "1.0",
        "show_name": bpy.path.display_name_from_filepath(bpy.data.filepath) or "Vimdrones Blender Show",
        "frame_rate": fps,
        "frame_start": frame_start,
        "frame_end": frame_end,
        "duration_ms": int(duration_sec * 1000),
        "drone_count": len(drone_objs),
        "drones": drones_payload
    }

    with open(output_filepath, "w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=2)

    print(f"[SUCCESS] Exported {len(drone_objs)} drones and {total_frames} frames to {output_filepath}")
    return True

if __name__ == "__main__":
    out_file = "vimdrones_export.json"
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1:]
        if args:
            out_file = args[0]
    export_blender_choreography(out_file)
