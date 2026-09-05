#!/usr/bin/env python3
"""
tools/preprocess_krishna.py

Offline Asset Preprocessing Pipeline for Krishna Particle Experience.
Analyzes source images in public/assets/krishna/ and generates optimized,
validated binary particle datasets (.bin) and metadata (.json) in public/generated/particles/.

Guarantees 100% complete spatial coverage across the full source composition.
"""

import os
import sys
import math
import struct
import json
from pathlib import Path
from PIL import Image
import numpy as np

# Optional OpenCV fallback
try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


MAGIC = b"KPRT"
VERSION = 1
DEFAULT_PARTICLE_COUNT = 80000


def compute_luminance(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def compute_sobel_edges(lum: np.ndarray) -> np.ndarray:
    h, w = lum.shape
    if HAS_CV2:
        lum_u8 = (lum * 255).astype(np.uint8)
        gx = cv2.Sobel(lum_u8, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(lum_u8, cv2.CV_32F, 0, 1, ksize=3)
        mag = np.hypot(gx, gy)
        max_v = np.max(mag)
        return mag / max_v if max_v > 0 else mag
    else:
        # Classical Sobel in pure NumPy
        gx = np.zeros_like(lum)
        gy = np.zeros_like(lum)

        padded = np.pad(lum, 1, mode='edge')
        
        # Sobel X
        gx = (
            -padded[0:-2, 0:-2] + padded[0:-2, 2:] +
            -2 * padded[1:-1, 0:-2] + 2 * padded[1:-1, 2:] +
            -padded[2:, 0:-2] + padded[2:, 2:]
        )
        # Sobel Y
        gy = (
            -padded[0:-2, 0:-2] - 2 * padded[0:-2, 1:-1] - padded[0:-2, 2:] +
            padded[2:, 0:-2] + 2 * padded[2:, 1:-1] + padded[2:, 2:]
        )
        mag = np.hypot(gx, gy)
        max_v = np.max(mag)
        return mag / max_v if max_v > 0 else mag


def compute_local_variance(lum: np.ndarray) -> np.ndarray:
    h, w = lum.shape
    padded = np.pad(lum, 1, mode='edge')
    var = np.zeros_like(lum)
    for dy in range(3):
        for dx in range(3):
            if dy == 1 and dx == 1:
                continue
            var += np.abs(padded[dy:dy+h, dx:dx+w] - lum)
    return var / 8.0


def hash2(ix: int, iy: int, seed: int = 9001) -> float:
    h = (ix * 374761393) ^ (iy * 668265263) ^ seed
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967296.0


def build_scatter(col: int, row: int, cols: int, rows: int, rng: np.random.Generator) -> tuple:
    nx = (col / max(1, cols)) * 2 - 1
    ny = (row / max(1, rows)) * 2 - 1
    dist = math.hypot(nx, ny)

    angle = math.atan2(ny, nx) + rng.uniform(0.5, 1.5) * math.pi
    spread = rng.uniform(20.0, 45.0)
    
    sx = math.cos(angle) * spread * (1.2 + rng.uniform(0, 1.0))
    sy = math.sin(angle) * spread * (1.2 + rng.uniform(0, 1.0))
    sz = -rng.uniform(15.0, 40.0) - dist * 15.0
    return (sx, sy, sz)


def process_krishna_image(image_path: Path, output_dir: Path, target_count: int = DEFAULT_PARTICLE_COUNT) -> dict:
    asset_id = image_path.stem
    print(f"[Preprocess] Processing asset: {asset_id} ({image_path.name})...")

    img = Image.open(image_path).convert("RGBA")
    orig_w, orig_h = img.size
    aspect = orig_w / float(orig_h)

    # Max analysis resolution for high feature resolution
    max_dim = 1536
    scale = min(1.0, max_dim / float(max(orig_w, orig_h)))
    analysis_w = int(round(orig_w * scale))
    analysis_h = int(round(orig_h * scale))

    img_resized = img.resize((analysis_w, analysis_h), Image.Resampling.LANCZOS)
    arr = np.array(img_resized, dtype=np.float32) / 255.0

    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]
    a = arr[:, :, 3]

    lum = compute_luminance(r, g, b)
    edges = compute_sobel_edges(lum)
    local_var = compute_local_variance(lum)

    # Gold & Blue color feature masks
    is_gold = (lum > 0.15) & (r > 0.32) & (g > 0.20) & (r > b * 0.9)
    is_blue = (lum > 0.08) & (b > 0.20) & (b > r * 0.95)

    # Multi-feature Subject Importance Field
    importance_map = (
        0.40 +
        edges * 0.70 +
        local_var * 1.2 +
        is_gold.astype(np.float32) * 0.40 +
        is_blue.astype(np.float32) * 0.30 +
        (lum > 0.6).astype(np.float32) * 0.20
    )
    # Background thinning ONLY for pure dark near-zero alpha/lum areas
    dark_mask = (lum < 0.02) & (edges < 0.08) & (~is_gold) & (~is_blue)
    importance_map[dark_mask] *= 0.25
    importance_map = np.clip(importance_map * a, 0.05, 1.0)

    # --- GUARANTEED 100% SPATIAL COVERAGE ALLOCATION ---
    # Divide analysis image into 32x32 spatial cells
    grid_cols = 32
    grid_rows = 32
    cell_w = analysis_w / grid_cols
    cell_h = analysis_h / grid_rows

    cell_stats = []
    active_cells = 0

    for cy in range(grid_rows):
        y0 = int(cy * cell_h)
        y1 = int((cy + 1) * cell_h)
        for cx in range(grid_cols):
            x0 = int(cx * cell_w)
            x1 = int((cx + 1) * cell_w)
            cell_alpha = a[y0:y1, x0:x1]
            cell_imp = importance_map[y0:y1, x0:x1]
            
            if np.max(cell_alpha) > 0.01:
                active_cells += 1
                avg_imp = float(np.mean(cell_imp))
                cell_stats.append({
                    'cx': cx, 'cy': cy,
                    'x0': x0, 'x1': x1, 'y0': y0, 'y1': y1,
                    'imp': avg_imp,
                })

    if active_cells == 0:
        raise ValueError(f"No active non-transparent pixels found in {image_path.name}")

    # 1) Base allocation: 25% of target count spread equally among all active cells
    base_particles_per_cell = max(1, int(math.floor((target_count * 0.25) / active_cells)))
    allocated_base = base_particles_per_cell * active_cells
    remaining_budget = target_count - allocated_base

    # 2) Importance-proportional allocation for the remaining 75% budget
    total_imp = sum(c['imp'] for c in cell_stats)
    for c in cell_stats:
        prop = (c['imp'] / total_imp) if total_imp > 0 else (1.0 / active_cells)
        c['count'] = base_particles_per_cell + int(round(prop * remaining_budget))

    # Adjust total to match target_count exactly
    current_total = sum(c['count'] for c in cell_stats)
    diff = target_count - current_total
    if diff != 0:
        cell_stats.sort(key=lambda c: c['imp'], reverse=True)
        idx = 0
        step = 1 if diff > 0 else -1
        for _ in range(abs(diff)):
            cell_stats[idx % len(cell_stats)]['count'] += step
            idx += 1

    # --- SAMPLING PARTICLES FROM ALLOCATED CELLS ---
    rng = np.random.default_rng(42)

    targets = np.zeros((target_count, 3), dtype=np.float32)
    colors = np.zeros((target_count, 3), dtype=np.float32)
    sizes = np.zeros(target_count, dtype=np.float32)
    importances = np.zeros(target_count, dtype=np.float32)
    luminances = np.zeros(target_count, dtype=np.float32)
    edgelist = np.zeros(target_count, dtype=np.float32)
    scatters = np.zeros((target_count, 3), dtype=np.float32)
    delays = np.zeros((target_count, 2), dtype=np.float32)
    seeds = np.zeros(target_count, dtype=np.float32)

    # Standardized unit bounding box coordinates (height = 1.0, width = aspect)
    world_h = 1.0
    world_w = aspect

    p_idx = 0
    for c in cell_stats:
        num = c['count']
        if num <= 0:
            continue
        
        x0, x1 = c['x0'], c['x1']
        y0, y1 = c['y0'], c['y1']
        
        # Sub-cell pixel grid within cell
        cell_imp_crop = importance_map[y0:y1, x0:x1]
        probs = cell_imp_crop.flatten()
        prob_sum = np.sum(probs)
        if prob_sum > 0:
            probs /= prob_sum
        else:
            probs = np.ones_like(probs) / float(len(probs))

        # Sample pixel indices
        pixel_indices = rng.choice(len(probs), size=num, replace=True, p=probs)

        # Calculate cell particle density for adaptive sizing
        cell_area_frac = (c['x1'] - c['x0']) * (c['y1'] - c['y0']) / float(analysis_w * analysis_h)
        density = num / max(1e-5, cell_area_frac * target_count)
        adaptive_size = float(np.clip(1.30 / math.sqrt(max(0.3, density)), 0.95, 2.20))

        for pix in pixel_indices:
            py = y0 + (pix // (x1 - x0))
            px = x0 + (pix % (x1 - x0))

            # Add stratified sub-pixel jitter
            u = (px + rng.uniform(0.1, 0.9)) / float(analysis_w)
            v = (py + rng.uniform(0.1, 0.9)) / float(analysis_h)

            x = (u - 0.5) * world_w
            y = (0.5 - v) * world_h
            
            l_val = float(lum[py, px])
            e_val = float(edges[py, px])
            imp_val = float(importance_map[py, px])

            z = (0.5 - l_val) * 0.08 + e_val * 0.05

            r_val = float(r[py, px])
            g_val = float(g[py, px])
            b_val = float(b[py, px])

            # Scatter vector
            col_idx = int(u * grid_cols)
            row_idx = int(v * grid_rows)
            sx, sy, sz = build_scatter(col_idx, row_idx, grid_cols, grid_rows, rng)

            reg_hash = hash2(col_idx // 2, row_idx // 2)
            local_seed = float(rng.uniform(0, 1))

            normalized_imp = min(1.0, imp_val * 1.5)
            delay_out = min(2.4, (1.0 - normalized_imp) * 1.8 + reg_hash * 0.7 + local_seed * 0.3)
            delay_in = min(2.8, (1.0 - normalized_imp) * 1.4 + (1.0 - e_val) * 0.5 + local_seed * 0.25)

            p_sz = (0.95 + l_val * 0.20 + e_val * 0.15) if (imp_val > 0.35 or e_val > 0.25) else adaptive_size

            targets[p_idx] = [x, y, z]
            colors[p_idx] = [r_val, g_val, b_val]
            sizes[p_idx] = p_sz
            importances[p_idx] = imp_val
            luminances[p_idx] = l_val
            edgelist[p_idx] = e_val
            scatters[p_idx] = [sx, sy, sz]
            delays[p_idx] = [delay_out, delay_in]
            seeds[p_idx] = local_seed

            p_idx += 1

    # --- VALIDATION SYSTEM ---
    min_x, max_x = float(np.min(targets[:, 0])), float(np.max(targets[:, 0]))
    min_y, max_y = float(np.min(targets[:, 1])), float(np.max(targets[:, 1]))
    min_z, max_z = float(np.min(targets[:, 2])), float(np.max(targets[:, 2]))
    
    target_aspect = (max_x - min_x) / float(max(1e-5, max_y - min_y))
    aspect_error = abs(target_aspect - aspect) / aspect

    # Coverage verification across 4 quadrants
    tl = np.sum((targets[:, 0] < 0) & (targets[:, 1] > 0))
    tr = np.sum((targets[:, 0] > 0) & (targets[:, 1] > 0))
    bl = np.sum((targets[:, 0] < 0) & (targets[:, 1] < 0))
    br = np.sum((targets[:, 0] > 0) & (targets[:, 1] < 0))
    center = np.sum((np.abs(targets[:, 0]) < world_w * 0.25) & (np.abs(targets[:, 1]) < world_h * 0.25))

    coverage_score = float((min(tl, tr, bl, br) / (target_count / 4.0)))

    print(f"[Preprocess] Validation for '{asset_id}':")
    print(f"  Count: {target_count}")
    print(f"  Source Aspect: {aspect:.4f} | Target Bounds Aspect: {target_aspect:.4f} (Error: {aspect_error*100:.2f}%)")
    print(f"  X Bounds: [{min_x:.3f}, {max_x:.3f}] | Y Bounds: [{min_y:.3f}, {max_y:.3f}]")
    print(f"  Quadrant Distribution: TL={tl}, TR={tr}, BL={bl}, BR={br}, Center={center}")

    if aspect_error > 0.15:
        print(f"  [WARNING] Aspect ratio error exceeds threshold for {asset_id}!")
    if min(tl, tr, bl, br) == 0:
        raise ValueError(f"CRITICAL VALIDATION FAILURE: Missing complete quadrant coverage in {asset_id}!")

    # --- SAVE BINARY (.bin) AND METADATA (.json) ---
    output_dir.mkdir(parents=True, exist_ok=True)
    bin_path = output_dir / f"{asset_id}.bin"
    json_path = output_dir / f"{asset_id}.json"

    # Header packing: 64 bytes
    header = struct.pack(
        "<4sIIIIfffffff",
        MAGIC,
        VERSION,
        target_count,
        orig_w,
        orig_h,
        float(aspect),
        min_x, max_x,
        min_y, max_y,
        min_z, max_z,
        coverage_score
    )
    # Pad header to 64 bytes
    header = header.ljust(64, b'\x00')

    # Contiguous float32 buffer payload
    payload = np.hstack([
        targets,                     # N * 3
        colors,                      # N * 3
        sizes[:, np.newaxis],        # N * 1
        importances[:, np.newaxis],  # N * 1
        luminances[:, np.newaxis],   # N * 1
        edgelist[:, np.newaxis],     # N * 1
        scatters,                    # N * 3
        delays,                      # N * 2
        seeds[:, np.newaxis]         # N * 1
    ]).astype(np.float32).tobytes()

    with open(bin_path, "wb") as f:
        f.write(header)
        f.write(payload)

    meta = {
        "id": asset_id,
        "file": image_path.name,
        "binFile": f"{asset_id}.bin",
        "particleCount": target_count,
        "width": orig_w,
        "height": orig_h,
        "aspect": float(aspect),
        "bounds": {
            "minX": min_x, "maxX": max_x,
            "minY": min_y, "maxY": max_y,
            "minZ": min_z, "maxZ": max_z,
        },
        "coverageScore": coverage_score,
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"[Preprocess] Successfully wrote binary dataset: {bin_path} ({len(header) + len(payload)} bytes)\n")
    return meta


def main():
    root_dir = Path(__file__).resolve().parent.parent
    assets_dir = root_dir / "krishna-particle-studio" / "public" / "assets" / "krishna"
    if not assets_dir.exists():
        assets_dir = root_dir / "public" / "assets" / "krishna"
    
    output_dir = root_dir / "krishna-particle-studio" / "public" / "generated" / "particles"
    if not output_dir.parent.exists():
        output_dir = root_dir / "public" / "generated" / "particles"

    if not assets_dir.exists():
        print(f"[Error] Source directory missing: {assets_dir}")
        sys.exit(1)

    image_exts = {".png", ".jpg", ".jpeg", ".webp"}
    images = [p for p in sorted(assets_dir.iterdir()) if p.suffix.lower() in image_exts]

    if not images:
        print(f"[Error] No Krishna images found in {assets_dir}")
        sys.exit(1)

    print(f"--- Starting Krishna Particle Preprocessing Pipeline ({len(images)} assets) ---")
    manifest = []
    for img_path in images:
        meta = process_krishna_image(img_path, output_dir)
        manifest.append(meta)

    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"--- Preprocessing Complete! Manifest saved to {manifest_path} ---")


if __name__ == "__main__":
    main()
