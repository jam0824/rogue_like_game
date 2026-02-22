import { describe, expect, it } from "vitest";
import {
  resolveDungeonBgmSourceOrThrow,
  resolveDungeonEnemyDefinitionsOrThrow,
} from "../../src/dungeon/dungeonRuntimeConfig.js";

describe("dungeonRuntimeConfig", () => {
  it("resolveDungeonBgmSourceOrThrow は bgmKey から音源パスを解決する", () => {
    const bgmSource = resolveDungeonBgmSourceOrThrow(
      {
        id: "dungeon_id_01",
        bgmKey: "bgm_key_dungeon_001",
      },
      {
        bgm_key_dungeon_001: "sounds/bgm/dungeon01.mp3",
      }
    );

    expect(bgmSource).toBe("sounds/bgm/dungeon01.mp3");
  });

  it("resolveDungeonBgmSourceOrThrow は未解決キーでエラー", () => {
    expect(() =>
      resolveDungeonBgmSourceOrThrow(
        {
          id: "dungeon_id_01",
          bgmKey: "bgm_key_missing",
        },
        {
          bgm_key_dungeon_001: "sounds/bgm/dungeon01.mp3",
        }
      )
    ).toThrow("unknown BGM key");
  });

  it("resolveDungeonEnemyDefinitionsOrThrow は enemyDbIds 順に定義を返す", () => {
    const bee = { id: "Bee_01", type: "fly" };
    const mushroom = { id: "BrownMushroom_01", type: "walk" };
    const resolved = resolveDungeonEnemyDefinitionsOrThrow(
      {
        id: "dungeon_id_01",
        enemyDbIds: ["BrownMushroom_01", "Bee_01", "Bee_01"],
      },
      {
        Bee_01: bee,
        BrownMushroom_01: mushroom,
      }
    );

    expect(resolved).toEqual([mushroom, bee, bee]);
  });

  it("resolveDungeonEnemyDefinitionsOrThrow は未解決 enemyDbId でエラー", () => {
    expect(() =>
      resolveDungeonEnemyDefinitionsOrThrow(
        {
          id: "dungeon_id_01",
          enemyDbIds: ["Bee_01", "Unknown_Enemy"],
        },
        {
          Bee_01: { id: "Bee_01" },
        }
      )
    ).toThrow("unknown enemy DB id");
  });

  it("resolveDungeonEnemyDefinitionsOrThrow は enemyDbIds が空配列なら空配列を返す", () => {
    const resolved = resolveDungeonEnemyDefinitionsOrThrow(
      {
        id: "dungeon_id_01",
        enemyDbIds: [],
      },
      {
        Bee_01: { id: "Bee_01" },
      }
    );

    expect(resolved).toEqual([]);
  });
});
