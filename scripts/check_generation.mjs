import { generateDungeon } from "../src/generation/dungeonGenerator.js";
import { validateDungeon } from "../src/generation/layoutValidator.js";
import { resolveWallSymbols } from "../src/tiles/wallSymbolResolver.js";

const TOTAL_SEEDS = 100;
const ALLOWED_SYMBOLS = new Set([null, " ", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]);

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
    checkSymbols(symbolGrid);

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
