import { generateDungeon } from "../src/generation/dungeonGenerator.js";
import { validateDungeon } from "../src/generation/layoutValidator.js";
import { resolveWallSymbols } from "../src/tiles/wallSymbolResolver.js";
import { placeDownStairSymbols } from "../src/dungeon/downStairSystem.js";

const TOTAL_SEEDS = 100;
const ALLOWED_SYMBOLS = new Set([null, " ", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "S"]);

function stableSignature(dungeon) {
  return JSON.stringify({
    rooms: dungeon.rooms.map((room) => ({
      id: room.id,
      x: room.x,
      y: room.y,
      w: room.w,
      h: room.h,
      type: room.type,
    })),
    edges: dungeon.graph.edges,
    startRoomId: dungeon.startRoomId,
    stairsRoomId: dungeon.stairsRoomId,
  });
}

function checkSymbols(symbolGrid) {
  for (const row of symbolGrid) {
    for (const symbol of row) {
      if (!ALLOWED_SYMBOLS.has(symbol)) {
        throw new Error(`Unexpected symbol in symbolGrid: ${symbol}`);
      }
    }
  }
}

function countSymbol(symbolGrid, target) {
  let count = 0;
  for (const row of symbolGrid) {
    for (const symbol of row) {
      if (symbol === target) {
        count += 1;
      }
    }
  }
  return count;
}

const failures = [];

for (let i = 0; i < TOTAL_SEEDS; i += 1) {
  const seed = `check-seed-${i}`;

  try {
    const dungeon = generateDungeon({ seed });
    const validation = validateDungeon(dungeon);
    if (!validation.ok) {
      failures.push(`${seed}: validation failed: ${validation.errors.join(", ")}`);
      continue;
    }

    const symbolGrid = resolveWallSymbols(dungeon.floorGrid);
    const stairPlacement = placeDownStairSymbols(symbolGrid, dungeon, dungeon.wallHeightTiles);
    checkSymbols(stairPlacement.symbolGrid);
    const stairCount = countSymbol(stairPlacement.symbolGrid, "S");
    if (!stairPlacement.downStair) {
      failures.push(`${seed}: down stair placement metadata is missing`);
      continue;
    }
    if (stairCount !== 2) {
      failures.push(`${seed}: down stair symbol count must be 2, got ${stairCount}`);
      continue;
    }

    const replay = generateDungeon({ seed });
    if (stableSignature(dungeon) !== stableSignature(replay)) {
      failures.push(`${seed}: non-deterministic generation detected`);
    }
  } catch (error) {
    failures.push(`${seed}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`[check_generation] FAILED ${failures.length}/${TOTAL_SEEDS}`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`[check_generation] PASS ${TOTAL_SEEDS}/${TOTAL_SEEDS}`);
