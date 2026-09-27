/**
 * Generate a heightfield for the Wissahickon Creek watershed.
 *
 * Fetches real elevation from AWS Terrain Tiles (Mapzen "terrarium" tiles),
 * resamples the relevant tiles into a single square grid, and writes a
 * committed TypeScript module that the runtime imports synchronously.
 *
 * Usage:  npx tsx scripts/generate-wissahickon-dem.ts
 *
 * Only Node built-ins are used (node:zlib for PNG inflation), so there are no
 * new project dependencies. Run this from the project root.
 */

import { writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Geographic selection
// ---------------------------------------------------------------------------

/**
 * Bounding box chosen to contain the entire main stem of Wissahickon Creek,
 * from the north-west headwaters down to the confluence with the Schuylkill
 * in the south-east. A single channel running across the frame reads as a
 * creek valley rather than a generic bowl.
 *
 * This box is four times the area of the original window (each linear
 * dimension doubled) so that more of the catchment is on the map, including
 * room around the Schuylkill confluence rather than the mouth sitting on the
 * south edge. The centre is unchanged, so the whole creek stays inside and
 * every previously-covered point is still covered, with margin on all sides.
 */
const BBOX = {
  west: -75.3,
  east: -75.16,
  south: 39.98,
  north: 40.14,
} as const;

/** Elevation source: Mapzen/AWS Terrain Tiles, "terrarium" RGB-encoded meters. */
const TILE_BASE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

/** Tile zoom: 14 spans the whole (now 4x larger) bbox from a manageable set of tiles while retaining creek detail. */
const TILE_ZOOM = 14;

/**
 * Output grid resolution (cells along each axis). Doubled 256 -> 512 in step
 * with the quadrupled area, so each grid cell keeps covering the same slice
 * of real ground and the creek channel stays resolved rather than blurring as
 * the window widens.
 */
const GRID_RESOLUTION = 512;

/** Elevation encoding precision retained in the committed file: tenths of a metre. */
const DECIMETRES_PER_METRE = 10;

// ---------------------------------------------------------------------------
// Slippy-map tile math
// ---------------------------------------------------------------------------

type TileAddress = { x: number; y: number };

/** Longitude to fractional tile column at the given zoom. */
const longitudeToTileX = (longitude: number, zoom: number): number =>
  ((longitude + 180) / 360) * 2 ** zoom;

/** Latitude to fractional tile row at the given zoom (row 0 is the north pole). */
const latitudeToTileY = (latitude: number, zoom: number): number => {
  const radians = (latitude * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) *
    2 ** zoom
  );
};

/** Tile address (integer column/row) that contains a fractional position. */
const toTileAddress = (
  fractionalX: number,
  fractionalY: number,
): TileAddress => ({
  x: Math.floor(fractionalX),
  y: Math.floor(fractionalY),
});

/**
 * Map a geographic coordinate to a fractional pixel within the tile grid that
 * covers the bbox, so that grid cell (col, row) can locate its source pixel.
 */
const geoToFractionalPixel = (
  longitude: number,
  latitude: number,
): { fractionalX: number; fractionalY: number } => ({
  fractionalX: longitudeToTileX(longitude, TILE_ZOOM),
  fractionalY: latitudeToTileY(latitude, TILE_ZOOM),
});

const tileUrl = (address: TileAddress): string =>
  `${TILE_BASE}/${TILE_ZOOM}/${address.x}/${address.y}.png`;

// ---------------------------------------------------------------------------
// Dependency-free PNG decoding (terrain tiles are non-interlaced truecolor)
// ---------------------------------------------------------------------------

type DecodedPng = {
  width: number;
  height: number;
  channels: number;
  data: Buffer;
};

const inflateIdat = (
  buffer: Buffer,
): {
  width: number;
  height: number;
  channels: number;
  idat: Buffer[];
} => {
  if (buffer.readUInt32BE(0) !== 0x89504e47) {
    throw new Error("Not a PNG file");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  if (interlace !== 0) {
    throw new Error("Interlaced PNGs are not supported");
  }
  if (bitDepth !== 8) {
    throw new Error(`Unsupported bit depth: ${bitDepth}`);
  }
  if (colorType !== 0 && colorType !== 2) {
    throw new Error(`Unsupported color type: ${colorType}`);
  }

  const channels = colorType === 0 ? 1 : 3;
  return { width, height, channels, idat };
};

const decodePng = (buffer: Buffer): DecodedPng => {
  const { width, height, channels, idat } = inflateIdat(buffer);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  let pointer = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[pointer];
    pointer += 1;
    const row = raw.subarray(pointer, pointer + stride);
    pointer += stride;

    const current = out.subarray(y * stride, (y + 1) * stride);
    const previous =
      y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);

    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? current[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;

      let value = row[x];
      switch (filter) {
        case 0:
          break;
        case 1:
          value = (value + a) & 0xff;
          break;
        case 2:
          value = (value + b) & 0xff;
          break;
        case 3:
          value = (value + ((a + b) >> 1)) & 0xff;
          break;
        case 4: {
          const p = Math.abs(b - c);
          const q = Math.abs(a - c);
          const r = Math.abs(a + b - 2 * c);
          const predicted = p <= q && p <= r ? a : q <= r ? b : c;
          value = (value + predicted) & 0xff;
          break;
        }
        default:
          throw new Error(`Unknown PNG filter: ${filter}`);
      }

      current[x] = value;
    }
  }

  return { width, height, channels, data: out };
};

/** Decode a terrarium pixel to metres: elevation = R*256 + G + B/256 - 32768. */
const terrariumPixelToMetres = (
  png: DecodedPng,
  pixel: number,
): number | null => {
  const alpha = png.channels === 1 ? 255 : png.data[pixel * png.channels + 3];
  if (alpha === 0) {
    return null;
  }
  const base = pixel * png.channels;
  const r = png.data[base];
  const g = png.data[base + 1];
  const b = png.data[base + 2];
  return r * 256 + g + b / 256 - 32768;
};

// ---------------------------------------------------------------------------
// Tile fetching (with a small cache so repeated addresses hit once)
// ---------------------------------------------------------------------------

const tileCache = new Map<string, DecodedPng>();

const fetchTile = async (address: TileAddress): Promise<DecodedPng> => {
  const key = `${address.x}/${address.y}`;
  const cached = tileCache.get(key);
  if (cached) {
    return cached;
  }

  const response = await fetch(tileUrl(address));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${tileUrl(address)}: ${response.status}`);
  }
  const decoded = decodePng(Buffer.from(await response.arrayBuffer()));
  tileCache.set(key, decoded);
  return decoded;
};

/**
 * Sample a single grid cell: return the elevation (metres) at the geographic
 * centre of that cell, or null where the source has no coverage.
 */
const sampleCell = async (
  column: number,
  row: number,
): Promise<number | null> => {
  const longitude =
    BBOX.west + ((column + 0.5) / GRID_RESOLUTION) * (BBOX.east - BBOX.west);
  const latitude =
    BBOX.north - ((row + 0.5) / GRID_RESOLUTION) * (BBOX.north - BBOX.south);

  const { fractionalX, fractionalY } = geoToFractionalPixel(
    longitude,
    latitude,
  );
  const address = toTileAddress(fractionalX, fractionalY);
  const png = await fetchTile(address);

  const pixelX = Math.floor((fractionalX - address.x) * png.width);
  const pixelY = Math.floor((fractionalY - address.y) * png.height);

  const clampedX = Math.min(png.width - 1, Math.max(0, pixelX));
  const clampedY = Math.min(png.height - 1, Math.max(0, pixelY));

  return terrariumPixelToMetres(png, clampedY * png.width + clampedX);
};

// ---------------------------------------------------------------------------
// Grid assembly
// ---------------------------------------------------------------------------

const buildHeightGrid = async (): Promise<Int16Array> => {
  const grid = new Int16Array(GRID_RESOLUTION * GRID_RESOLUTION);

  // Fill row by row, fetching/decoding each source tile lazily through the cache.
  for (let row = 0; row < GRID_RESOLUTION; row += 1) {
    for (let column = 0; column < GRID_RESOLUTION; column += 1) {
      const metres = await sampleCell(column, row);
      const decimetres =
        metres === null ? 0 : Math.round(metres * DECIMETRES_PER_METRE);
      grid[row * GRID_RESOLUTION + column] = decimetres;
    }
  }

  return grid;
};

const summarize = (grid: Int16Array): { min: number; max: number } => {
  let min = Infinity;
  let max = -Infinity;
  for (const value of grid) {
    const metres = value / DECIMETRES_PER_METRE;
    if (metres < min) min = metres;
    if (metres > max) max = metres;
  }
  return { min, max };
};

// ---------------------------------------------------------------------------
// Emit the committed data module
// ---------------------------------------------------------------------------

const toBase64 = (grid: Int16Array): string =>
  Buffer.from(grid.buffer, grid.byteOffset, grid.byteLength).toString("base64");

const emitModule = (path: string, grid: Int16Array): void => {
  const { min, max } = summarize(grid);

  const module = `/**
 * GENERATED by scripts/generate-wissahickon-dem.ts — do not edit by hand.
 *
 * Source: AWS Terrain Tiles (Mapzen "terrarium"), zoom ${TILE_ZOOM}.
 * Coverage: Wissahickon Creek watershed, ${BBOX.south}..${BBOX.north} N,
 * ${BBOX.west}..${BBOX.east} W. Elevation grid of ${GRID_RESOLUTION}x${GRID_RESOLUTION}
 * stored as tenths-of-a-metre Int16 (decode: value / ${DECIMETRES_PER_METRE}).
 * Measured relief in this window: ${min.toFixed(1)}m to ${max.toFixed(1)}m.
 */

export const wissahickon = {
  resolution: ${GRID_RESOLUTION},
  bounds: { west: ${BBOX.west}, east: ${BBOX.east}, south: ${BBOX.south}, north: ${BBOX.north} },
  heightScale: ${DECIMETRES_PER_METRE},
  data: "${toBase64(grid)}",
};
`;

  writeFileSync(path, module, "utf8");
};

const main = async (): Promise<void> => {
  const grid = await buildHeightGrid();
  const path = "src/terrain/wissahickonHeightField.ts";
  emitModule(path, grid);
  const { min, max } = summarize(grid);
  console.log(
    `Wrote ${path}: ${GRID_RESOLUTION}x${GRID_RESOLUTION}, relief ${min.toFixed(1)}m..${max.toFixed(1)}m`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
