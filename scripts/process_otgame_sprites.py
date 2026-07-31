from __future__ import annotations

import json
import statistics
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "assets" / "otgame" / "sprites"
OUTPUT_ROOT = PROJECT_ROOT / "public" / "games" / "otgame" / "sprites"

EXPANDED_ATLASES = {
    "emmy": ASSET_ROOT / "emmy" / "atlases" / "emmy-expanded-actions.png",
    "opie": ASSET_ROOT / "opie" / "atlases" / "opie-expanded-actions.png",
}


ATLAS_SPECS = (
    {
        "character": "emmy",
        "path": ASSET_ROOT / "emmy" / "atlases" / "emmy-locomotion-atlas.png",
        "rows": ("idle", "run_forward", "retreat", "jump"),
    },
    {
        "character": "emmy",
        "path": ASSET_ROOT / "emmy" / "atlases" / "emmy-punch-strip.png",
        "rows": ("punch",),
    },
    {
        "character": "emmy",
        "path": ASSET_ROOT / "emmy" / "atlases" / "emmy-kick-strip.png",
        "rows": ("kick",),
    },
    {
        "character": "emmy",
        "path": ASSET_ROOT / "emmy" / "atlases" / "emmy-combat-atlas.png",
        "rows": (
            "guard_dodge",
            "jump_punch",
            "jump_kick",
            "hit_reaction",
            "knockdown_recover",
            "ko",
        ),
    },
    {
        "character": "emmy",
        "path": ASSET_ROOT / "emmy" / "atlases" / "emmy-powered-atlas.png",
        "rows": (
            "powerup",
            "powered_idle",
            "special_sx",
            "counter_xs",
            "super_zx",
            "victory",
        ),
    },
    {
        "character": "opie",
        "path": ASSET_ROOT / "opie" / "atlases" / "opie-locomotion-atlas.png",
        "rows": ("idle", "run_forward", "retreat", "jump"),
    },
    {
        "character": "opie",
        "path": ASSET_ROOT / "opie" / "atlases" / "opie-combat-atlas.png",
        "rows": (
            "punch",
            "kick",
            "guard_dodge",
            "jump_punch",
            "jump_kick",
            "hit_knockdown_recover",
        ),
    },
    {
        "character": "opie",
        "path": ASSET_ROOT / "opie" / "atlases" / "opie-powered-atlas.png",
        "rows": (
            "powerup",
            "powered_idle",
            "special_sx",
            "counter_xs",
            "super_zx",
            "victory",
        ),
    },
)


ANIMATION_TIMING = {
    "idle": {"fps": 8, "loop": True},
    "run_forward": {"fps": 14, "loop": True},
    "retreat": {"fps": 12, "loop": True},
    "jump": {"fps": 14, "loop": False, "input": "A"},
    "punch": {
        "fps": 18,
        "loop": False,
        "input": "S",
        "activeFrames": [2, 3],
        "hitStopMs": 65,
    },
    "kick": {
        "fps": 16,
        "loop": False,
        "input": "Z",
        "activeFrames": [3],
        "hitStopMs": 80,
    },
    "guard_dodge": {"fps": 14, "loop": False, "input": "X", "holdFrame": 2},
    "jump_punch": {
        "fps": 17,
        "loop": False,
        "input": "AS",
        "activeFrames": [3],
        "hitStopMs": 75,
    },
    "jump_kick": {
        "fps": 16,
        "loop": False,
        "input": "AZ",
        "activeFrames": [3],
        "hitStopMs": 90,
    },
    "hit_reaction": {"fps": 14, "loop": False},
    "knockdown_recover": {"fps": 11, "loop": False},
    "hit_knockdown_recover": {"fps": 12, "loop": False},
    "ko": {"fps": 10, "loop": False, "holdLastFrame": True},
    "powerup": {
        "fps": 12,
        "loop": False,
        "input": "X",
        "requiresState": "regular",
    },
    "signature_throw": {
        "fps": 15,
        "loop": False,
        "input": "X",
        "requiresState": "powered",
        "activeFrames": [5, 6, 7],
        "hitStopMs": 135,
    },
    "signature_lunge": {
        "fps": 16,
        "loop": False,
        "input": "X",
        "requiresState": "powered",
        "activeFrames": [5, 6, 7],
        "hitStopMs": 145,
    },
    "powered_idle": {"fps": 8, "loop": True, "requiresState": "powered"},
    "special_sx": {
        "fps": 18,
        "loop": False,
        "input": "SX",
        "requiresState": "powered",
        "activeFrames": [2, 3, 4],
        "hitStopMs": 95,
    },
    "counter_xs": {
        "fps": 18,
        "loop": False,
        "input": "XS",
        "requiresState": "powered",
        "activeFrames": [3, 4],
        "hitStopMs": 105,
    },
    "super_zx": {
        "fps": 20,
        "loop": False,
        "input": "ZX",
        "requiresState": "powered",
        "activeFrames": [2, 3, 4],
        "hitStopMs": 135,
    },
    "victory": {"fps": 10, "loop": False, "holdLastFrame": True},
}


def rel_url(path: Path) -> str:
    return "/" + path.relative_to(PROJECT_ROOT / "public").as_posix()


def save_strip(frames: list[Image.Image], path: Path) -> None:
    width = sum(frame.width for frame in frames)
    height = max(frame.height for frame in frames)
    strip = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    cursor = 0
    for frame in frames:
        strip.alpha_composite(frame, (cursor, 0))
        cursor += frame.width
    path.parent.mkdir(parents=True, exist_ok=True)
    strip.save(path)


def connected_components(alpha: Image.Image, threshold: int = 16) -> list[dict]:
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[dict] = []

    for start_y in range(height):
        for start_x in range(width):
            start_index = start_y * width + start_x
            if visited[start_index] or pixels[start_x, start_y] <= threshold:
                visited[start_index] = 1
                continue

            queue = deque([(start_x, start_y)])
            visited[start_index] = 1
            points: list[tuple[int, int]] = []
            min_x = max_x = start_x
            min_y = max_y = start_y

            while queue:
                x, y = queue.popleft()
                points.append((x, y))
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                for next_y in range(max(0, y - 1), min(height, y + 2)):
                    for next_x in range(max(0, x - 1), min(width, x + 2)):
                        next_index = next_y * width + next_x
                        if visited[next_index]:
                            continue
                        visited[next_index] = 1
                        if pixels[next_x, next_y] > threshold:
                            queue.append((next_x, next_y))

            components.append(
                {
                    "points": points,
                    "size": len(points),
                    "bbox": (min_x, min_y, max_x + 1, max_y + 1),
                    "center": ((min_x + max_x) / 2, (min_y + max_y) / 2),
                }
            )
    return components


def bbox_distance(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> float:
    first_left, first_top, first_right, first_bottom = first
    second_left, second_top, second_right, second_bottom = second
    horizontal = max(first_left - second_right, second_left - first_right, 0)
    vertical = max(first_top - second_bottom, second_top - first_bottom, 0)
    return (horizontal * horizontal + vertical * vertical) ** 0.5


def clean_cell(cell: Image.Image, keep_effects: bool) -> Image.Image:
    alpha = cell.getchannel("A")
    components = connected_components(alpha)
    if not components:
        return cell

    center_x = cell.width / 2
    center_y = cell.height / 2

    def main_score(component: dict) -> float:
        component_x, component_y = component["center"]
        distance = ((component_x - center_x) ** 2 + (component_y - center_y) ** 2) ** 0.5
        return component["size"] / (1 + distance / 28)

    main = max(components, key=main_score)
    keep: list[dict] = [main]
    source_pixels = cell.load()

    for component in components if keep_effects else ():
        if component is main or component["size"] < 6:
            continue
        component_distance = bbox_distance(main["bbox"], component["bbox"])
        bright_pink_or_blue = 0
        white_glow = 0
        for x, y in component["points"]:
            red, green, blue, _ = source_pixels[x, y]
            if (
                red > 180
                and blue > 120
                and red > green * 1.15
            ) or (
                blue > 160
                and green > 130
                and blue > red * 1.08
            ):
                if red + green + blue > 480:
                    bright_pink_or_blue += 1
            if red > 225 and green > 225 and blue > 225:
                white_glow += 1

        effect_ratio = bright_pink_or_blue / component["size"]
        white_ratio = white_glow / component["size"]
        left, top, right, bottom = component["bbox"]
        component_width = max(1, right - left)
        component_height = max(1, bottom - top)
        elongated = max(
            component_width / component_height,
            component_height / component_width,
        )
        nearby = component_distance <= max(cell.width, cell.height) * 0.48

        if (
            effect_ratio >= 0.45
            or (
                white_ratio >= 0.7
                and component["size"] <= main["size"] * 0.02
                and nearby
            )
            or (
                elongated >= 5
                and component["size"] <= main["size"] * 0.2
                and nearby
            )
        ):
            keep.append(component)

    keep_mask = Image.new("L", cell.size, 0)
    keep_pixels = keep_mask.load()
    for component in keep:
        for x, y in component["points"]:
            keep_pixels[x, y] = 255

    cleaned = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    cleaned.paste(cell, (0, 0), Image.composite(alpha, Image.new("L", cell.size, 0), keep_mask))
    return cleaned


def main_component_bbox(frame: Image.Image) -> tuple[int, int, int, int]:
    components = connected_components(frame.getchannel("A"))
    if not components:
        raise RuntimeError("Cannot locate character in an empty sprite frame")
    center_x = frame.width / 2
    center_y = frame.height / 2

    def main_score(component: dict) -> float:
        component_x, component_y = component["center"]
        distance = ((component_x - center_x) ** 2 + (component_y - center_y) ** 2) ** 0.5
        return component["size"] / (1 + distance / 28)

    return max(components, key=main_score)["bbox"]


def normalize_frames(
    frames: list[Image.Image],
    canvas_size: int = 512,
    lock_character_scale: bool = False,
) -> list[Image.Image]:
    boxes = [frame.getchannel("A").getbbox() for frame in frames]
    if any(box is None for box in boxes):
        raise RuntimeError("Cannot normalize an empty sprite frame")

    if lock_character_scale:
        character_boxes = [main_component_bbox(frame) for frame in frames]
        typical_width = statistics.median(
            box[2] - box[0] for box in character_boxes
        )
        typical_height = statistics.median(
            box[3] - box[1] for box in character_boxes
        )
        scale = min(360 / typical_width, 410 / typical_height)
    else:
        character_boxes = boxes
        max_width = max(box[2] - box[0] for box in boxes if box is not None)
        max_height = max(box[3] - box[1] for box in boxes if box is not None)
        scale = min(440 / max_width, 440 / max_height)

    baseline = 482
    normalized: list[Image.Image] = []

    for frame, box, character_box in zip(frames, boxes, character_boxes):
        if lock_character_scale:
            sprite = frame
            anchor_left, _, anchor_right, anchor_bottom = character_box
            anchor_center_x = (anchor_left + anchor_right) / 2
        else:
            sprite = frame.crop(box)
            anchor_center_x = sprite.width / 2
            anchor_bottom = sprite.height
        new_size = (
            max(1, round(sprite.width * scale)),
            max(1, round(sprite.height * scale)),
        )
        sprite = sprite.resize(new_size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        x = round(canvas_size / 2 - anchor_center_x * scale)
        y = round(baseline - anchor_bottom * scale)
        canvas.alpha_composite(sprite, (x, y))
        normalized.append(canvas)

    return normalized


def save_animation(
    character: str,
    animation: str,
    frames: list[Image.Image],
) -> dict:
    animation_dir = OUTPUT_ROOT / character / "animations" / animation
    animation_dir.mkdir(parents=True, exist_ok=True)
    frame_paths: list[Path] = []

    for index, frame in enumerate(frames):
        frame_path = animation_dir / f"frame-{index:02d}.png"
        frame.save(frame_path)
        frame_paths.append(frame_path)

    strip_path = OUTPUT_ROOT / character / "strips" / f"{animation}.png"
    save_strip(frames, strip_path)

    timing = dict(ANIMATION_TIMING[animation])
    return {
        **timing,
        "frameCount": len(frames),
        "frames": [rel_url(path) for path in frame_paths],
        "strip": rel_url(strip_path),
        "frameSizes": [{"width": frame.width, "height": frame.height} for frame in frames],
    }


def split_atlas(spec: dict, manifest: dict) -> None:
    image = Image.open(spec["path"]).convert("RGBA")
    rows = spec["rows"]
    row_count = len(rows)
    column_count = 6

    for row_index, animation in enumerate(rows):
        cell_width = image.width / column_count
        cell_height = image.height / row_count
        center_y = (row_index + 0.5) * cell_height
        frames: list[Image.Image] = []
        for column_index in range(column_count):
            center_x = (column_index + 0.5) * cell_width
            left = max(0, round(center_x - cell_width * 0.65))
            right = min(image.width, round(center_x + cell_width * 0.65))
            top = max(0, round(center_y - cell_height * 0.78))
            bottom = min(image.height, round(center_y + cell_height * 0.78))
            keep_effects = animation in {
                "powerup",
                "powered_idle",
                "special_sx",
                "counter_xs",
                "super_zx",
                "victory",
            }
            frame = clean_cell(
                image.crop((left, top, right, bottom)),
                keep_effects=keep_effects,
            )
            if frame.getchannel("A").getbbox() is None:
                raise RuntimeError(
                    f"Empty frame: {spec['character']} {animation} {column_index}"
                )
            frames.append(frame)

        frames = normalize_frames(frames, lock_character_scale=keep_effects)
        manifest["characters"][spec["character"]]["animations"][animation] = (
            save_animation(spec["character"], animation, frames)
        )


def split_expanded_atlas(character: str, path: Path, manifest: dict) -> None:
    image = Image.open(path).convert("RGBA")
    columns = 6
    rows = 4
    cell_width = image.width // columns
    cell_height = image.height // rows
    sequences = (
        ("powerup", (0, 1)),
        (
            "signature_throw" if character == "emmy" else "signature_lunge",
            (2, 3),
        ),
    )

    for animation, sequence_rows in sequences:
        frames: list[Image.Image] = []
        for row_index in sequence_rows:
            for column_index in range(columns):
                left = column_index * cell_width
                top = row_index * cell_height
                right = image.width if column_index == columns - 1 else left + cell_width
                bottom = image.height if row_index == rows - 1 else top + cell_height
                frame = clean_cell(
                    image.crop((left, top, right, bottom)),
                    keep_effects=True,
                )
                if frame.getchannel("A").getbbox() is None:
                    raise RuntimeError(
                        f"Empty expanded frame: {character} {animation} "
                        f"{row_index}:{column_index}"
                    )
                frames.append(frame)

        frames = normalize_frames(frames, lock_character_scale=True)
        manifest["characters"][character]["animations"][animation] = (
            save_animation(character, animation, frames)
        )


def derive_opie_reactions(manifest: dict) -> None:
    source_dir = (
        OUTPUT_ROOT / "opie" / "animations" / "hit_knockdown_recover"
    )
    source_frames = [
        Image.open(source_dir / f"frame-{index:02d}.png").convert("RGBA")
        for index in range(6)
    ]
    derived = {
        "hit_reaction": [source_frames[index] for index in (0, 1, 5)],
        "knockdown_recover": source_frames,
        "ko": [source_frames[index] for index in (0, 1, 2, 3)],
    }
    for animation, frames in derived.items():
        manifest["characters"]["opie"]["animations"][animation] = save_animation(
            "opie", animation, normalize_frames(frames)
        )


def checkerboard(size: tuple[int, int], tile: int = 16) -> Image.Image:
    board = Image.new("RGBA", size, (232, 232, 232, 255))
    draw = ImageDraw.Draw(board)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle(
                    (x, y, min(x + tile, size[0]), min(y + tile, size[1])),
                    fill=(202, 202, 202, 255),
                )
    return board


def create_preview(character: str, animations: dict) -> Path:
    names = list(animations)
    columns = 4
    cell_width = 300
    cell_height = 260
    rows = (len(names) + columns - 1) // columns
    preview = checkerboard((columns * cell_width, rows * cell_height), 20)
    draw = ImageDraw.Draw(preview)
    font = ImageFont.load_default()

    for index, name in enumerate(names):
        column = index % columns
        row = index // columns
        frame_path = PROJECT_ROOT / "public" / animations[name]["frames"][0].lstrip("/")
        frame = Image.open(frame_path).convert("RGBA")
        frame.thumbnail((cell_width - 30, cell_height - 42), Image.Resampling.LANCZOS)
        x = column * cell_width + (cell_width - frame.width) // 2
        y = row * cell_height + 24 + (cell_height - 42 - frame.height) // 2
        preview.alpha_composite(frame, (x, y))
        draw.rectangle(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width - 1,
                (row + 1) * cell_height - 1,
            ),
            outline=(92, 92, 92, 255),
            width=1,
        )
        draw.text(
            (column * cell_width + 8, row * cell_height + 7),
            name,
            fill=(20, 20, 20, 255),
            font=font,
        )

    preview_path = OUTPUT_ROOT / f"preview-{character}.png"
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview.save(preview_path)
    return preview_path


def validate_transparency() -> dict:
    results = {}
    for path in sorted(OUTPUT_ROOT.glob("*/animations/*/frame-*.png")):
        image = Image.open(path).convert("RGBA")
        alpha = image.getchannel("A")
        corners = (
            alpha.getpixel((0, 0)),
            alpha.getpixel((image.width - 1, 0)),
            alpha.getpixel((0, image.height - 1)),
            alpha.getpixel((image.width - 1, image.height - 1)),
        )
        if max(corners) != 0:
            raise RuntimeError(f"Opaque corner remains in {path}: {corners}")
        if alpha.getbbox() is None:
            raise RuntimeError(f"No visible sprite pixels in {path}")
        results[path.as_posix()] = {
            "size": [image.width, image.height],
            "corners": list(corners),
        }
    return results


def main() -> None:
    manifest = {
        "version": 1,
        "inputWindowMs": 300,
        "controls": {
            "movement": ["ArrowLeft", "ArrowRight"],
            "jump": "A",
            "punch": "S",
            "kick": "Z",
            "power": "X",
            "jumpPunch": "AS",
            "jumpKick": "AZ",
        },
        "characters": {
            "emmy": {
                "displayName": "Emmy",
                "regularLook": "short bob, dog shirt",
                "powerLook": "pink BJJ gi",
                "energyColor": "pink",
                "defaultFacing": "right",
                "animations": {},
            },
            "opie": {
                "displayName": "Opie",
                "regularLook": "tied-back hair, sunglasses, pink shirt",
                "powerLook": "white fencing suit",
                "energyColor": "blue",
                "defaultFacing": "right",
                "mirrorAtRoundStart": True,
                "animations": {},
            },
        },
    }

    for spec in ATLAS_SPECS:
        split_atlas(spec, manifest)
    for character, path in EXPANDED_ATLASES.items():
        split_expanded_atlas(character, path, manifest)
    derive_opie_reactions(manifest)

    for character, data in manifest["characters"].items():
        preview_path = create_preview(character, data["animations"])
        data["preview"] = rel_url(preview_path)

    validation = validate_transparency()
    manifest["validation"] = {
        "transparentFrameCount": len(validation),
        "allFrameCornersTransparent": True,
    }

    manifest_path = OUTPUT_ROOT / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {manifest_path}")
    print(f"Validated {len(validation)} transparent frames")


if __name__ == "__main__":
    main()
