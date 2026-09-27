/**
 * Generate a heightfield for the Cobbs Creek valley past Cedar Park,
 * Philadelphia - a tight ~6 km window centred on that neighbourhood.
 *
 * Fetches real elevation from AWS Terrain Tiles (Mapzen "terrarium"),
 * resamples the relevant tiles into a single square grid, and writes a
 * committed TypeScript module that the runtime imports synchronously.
 *
 * Usage:  npx tsx scripts/generate-cobbs-creek-dem.ts
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
 * Reference point: the Cedar Park neighbourhood of Southwest/West
 * Philadelphia (bounded roughly by Larchwood Avenue to the north,
 * Kingsessing Avenue to the south, 46th Street to the east and 52nd Street
 * to the west, with the Cedar Park park and former "Cedar Park" trolley stop
 * around 51st Street). The neighbourhood sits on the drainage divide between
 * the Cobbs Creek valley to its west and the Schuylkill valley to its east,
 * so the window below is centred on it and reaches far enough west to hold
 * the Cobbs Creek channel.
 */
const CENTER = { longitude: -75.2225, latitude: 39.9482 } as const;

/**
 * Cobbs Creek (Lenape "Karakung", "the place of the wild geese") runs 11.8 mi
 * (19 km) from its source in Montgomery County (40.0150 N, 75.3256 W, about
 * 115 m) south and then south-east past the west edge of Cedar Park to its
 * confluence with Darby Creek at Darby (39.9064 N, 75.2531 W, about sea
 * level). Its tributary next to Cedar Park, Naylors Run, cuts through the
 * same valley a little further north.
 *
 * The window is deliberately tight: about 6 km corner to corner, centred on
 * Cedar Park, so it frames just the stretch of valley that runs past the
 * neighbourhood. Both ends of the creek (the source and the Darby confluence)
 * sit outside it and the channel runs off the north-west and south edges -
 * that is cheaper and more honest than widening the window to chase the whole
 * 19 km main stem. Cedar Park itself is the inter-valley ridge at the centre
 * of the window, with the Cobbs Creek channel crossing the western quarter,
 * so the relief is a genuine valley rather than a synthetic bowl.
 *
 * Half-spans keep grid cells square on the ground: a degree of longitude is
 * cos(39.95 deg), about 0.767, of a degree of latitude, so the 0.072 deg
 * east-west span matches the 0.0552 deg north-south one at about 6.1 km.
 */
const BBOX = {
  west: CENTER.longitude - 0.036,
  east: CENTER.longitude + 0.036,
  south: CENTER.latitude - 0.0276,
  north: CENTER.latitude + 0.0276,
} as const;

/**
 * Known points along the Cobbs Creek valley inside the window, used as sanity
 * checks. The source is excluded: it is a spring on high ground outside the
 * window, and an elevation reference (about 115 m) rather than a low point.
 */
const VALLEY_CHECK_POINTS = [
  {
    name: "Naylors Run above Cedar Park",
    longitude: -75.2524,
    latitude: 39.9508,
  },
  {
    name: "Cobbs Creek beside Cedar Park",
    longitude: -75.244,
    latitude: 39.948,
  },
  {
    name: "Cobbs Creek at Island Avenue",
    longitude: -75.2412,
    latitude: 39.9307,
  },
] as const;

/**
 * Offsets (degrees) sampled around each check point. Cobbs Creek is narrower
 * than one grid cell in places and a couple of the recorded points are
 * culverts, so a single cell is not enough to prove the valley is there.
 * About 350 m each way at this latitude - a tenth of the window width.
 */
const CHECK_OFFSETS = [-0.004, -0.002, 0, 0.002, 0.004] as const;

/** How far below the central ridge the valley floor has to fall to count. */
const MINIMUM_VALLEY_DROP_METRES = 5;

/** Elevation source: Mapzen/AWS Terrain Tiles, "terrarium" RGB-encoded meters. */
const TILE_BASE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

/**
 * Tile zoom: 14 covers this ~6 km window with ~9 source tiles at ~28 m per
 * pixel, matching the source's real resolution; zooming in further would only
 * repeat the same ~30 m source detail.
 */
const TILE_ZOOM = 14;

/**
 * Output grid resolution (cells along each axis), unchanged from the wider
 * window: ~12 m cells oversample the ~30 m source, which keeps a distinct
 * sample for every texel of the 512-texel displacement map and water grid.
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

/**
 * Fetch and decode one terrain tile, retrying a few times because the tile
 * endpoint occasionally drops a connection. The whole grid needs every tile,
 * so a single flaky read must not abort the generation.
 */
const FETCH_ATTEMPTS = 3;

const fetchTile = async (address: TileAddress): Promise<DecodedPng> => {
  const key = `${address.x}/${address.y}`;
  const cached = tileCache.get(key);
  if (cached) {
    return cached;
  }

  let lastErrorMessage = "unknown error";

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(tileUrl(address));
      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${tileUrl(address)}: ${response.status}`,
        );
      }
      const decoded = decodePng(Buffer.from(await response.arrayBuffer()));
      tileCache.set(key, decoded);
      return decoded;
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `  attempt ${attempt}/${FETCH_ATTEMPTS} for ${key} failed: ${lastErrorMessage}`,
      );
    }
  }

  throw new Error(
    `Gave up on ${tileUrl(address)} after ${FETCH_ATTEMPTS} attempts: ${lastErrorMessage}`,
  );
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

/**
 * Sample elevation straight from the source tiles for an arbitrary coordinate,
 * used by the valley sanity checks below.
 */
const sampleCoordinate = async (
  longitude: number,
  latitude: number,
): Promise<number | null> => {
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

/**
 * Lowest elevation within roughly 350 m of a coordinate, sampled straight
 * from the source tiles.
 */
const lowestNear = async (
  longitude: number,
  latitude: number,
): Promise<number | null> => {
  let lowest: number | null = null;

  for (const longitudeOffset of CHECK_OFFSETS) {
    for (const latitudeOffset of CHECK_OFFSETS) {
      const metres = await sampleCoordinate(
        longitude + longitudeOffset,
        latitude + latitudeOffset,
      );
      if (metres === null) {
        continue;
      }
      if (lowest === null || metres < lowest) {
        lowest = metres;
      }
    }
  }

  return lowest;
};

/**
 * Sample the lowest ground near every known valley point so the generated
 * window can be checked to contain the Cobbs Creek valley and not just
 * ridge top.
 */
const checkValleyPoints = async (
  ridgeHeight: number,
): Promise<{ name: string; metres: number | null }[]> => {
  const results: { name: string; metres: number | null }[] = [];

  for (const point of VALLEY_CHECK_POINTS) {
    const metres = await lowestNear(point.longitude, point.latitude);
    results.push({ name: point.name, metres });
  }

  for (const result of results) {
    if (result.metres === null) {
      console.warn(`  ! ${result.name}: no source coverage`);
    } else if (result.metres > ridgeHeight - MINIMUM_VALLEY_DROP_METRES) {
      console.warn(
        `  ! ${result.name}: ${result.metres.toFixed(1)}m is not clearly below the central ridge (${ridgeHeight.toFixed(1)}m)`,
      );
    } else {
      console.log(
        `  ok ${result.name}: ${(ridgeHeight - result.metres).toFixed(1)}m below the central ridge`,
      );
    }
  }

  return results;
};

/**
 * Render the grid as a coarse ASCII relief map (higher = later character) so
 * the valley can be eyeballed without opening the scene.
 */
const renderReliefMap = (grid: Int16Array, columns = 64, rows = 32): string => {
  const ramp = " .:-=+*#%@";
  const { min, max } = summarize(grid);
  const lines: string[] = [];

  for (let row = 0; row < rows; row += 1) {
    let line = "";
    for (let column = 0; column < columns; column += 1) {
      const sourceRow = Math.floor((row / rows) * GRID_RESOLUTION);
      const sourceColumn = Math.floor((column / columns) * GRID_RESOLUTION);
      const metres = grid[sourceRow * GRID_RESOLUTION + sourceColumn] / 10;
      const step = Math.round(
        ((metres - min) / (max - min || 1)) * (ramp.length - 1),
      );
      line += ramp[step];
    }
    lines.push(line);
  }

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Emit the committed data module
// ---------------------------------------------------------------------------

const toBase64 = (grid: Int16Array): string =>
  Buffer.from(grid.buffer, grid.byteOffset, grid.byteLength).toString("base64");

const emitModule = (path: string, grid: Int16Array): void => {
  const { min, max } = summarize(grid);

  const module = `/**
 * GENERATED by scripts/generate-cobbs-creek-dem.ts — do not edit by hand.
 *
 * Source: AWS Terrain Tiles (Mapzen "terrarium"), zoom ${TILE_ZOOM}.
 * Coverage: Cobbs Creek valley past Cedar Park, centred on the neighbourhood
 * of the same name in Philadelphia (${BBOX.south.toFixed(4)}..${BBOX.north.toFixed(4)} N,
 * ${BBOX.west.toFixed(4)}..${BBOX.east.toFixed(4)} W; about 6 km across).
 * Elevation grid of ${GRID_RESOLUTION}x${GRID_RESOLUTION} stored as
 * tenths-of-a-metre Int16 (decode: value / ${DECIMETRES_PER_METRE}).
 * Measured relief in this window: ${min.toFixed(1)}m to ${max.toFixed(1)}m.
 */

export const cobbsCreek = {
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
  const path = "src/terrain/cobbsCreekHeightField.ts";
  emitModule(path, grid);
  const { min, max } = summarize(grid);
  console.log(
    `Wrote ${path}: ${GRID_RESOLUTION}x${GRID_RESOLUTION}, relief ${min.toFixed(1)}m..${max.toFixed(1)}m`,
  );

  // The cell at the centre of the window is the Cedar Park ridge; every
  // mapped grid cell covers about 35 m of ground, so a couple of
  // neighbourhood blocks per cell.
  const centreCell =
    grid[(GRID_RESOLUTION / 2) * GRID_RESOLUTION + GRID_RESOLUTION / 2] /
    DECIMETRES_PER_METRE;
  const valleyChecks = await checkValleyPoints(centreCell);
  const missed = valleyChecks.filter(
    (check) =>
      check.metres === null ||
      check.metres > centreCell - MINIMUM_VALLEY_DROP_METRES,
  );
  if (missed.length > 0) {
    throw new Error(
      `Window misses the Cobbs Creek valley: ${missed.map((check) => check.name).join(", ")}`,
    );
  }
  console.log(renderReliefMap(grid));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
