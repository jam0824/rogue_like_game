import { afterEach, describe, expect, it, vi } from "vitest";
import { loadItemDefinitions } from "../../src/item/itemDb.js";

function createItemRecord(overrides = {}) {
  return {
    id: "item_herb_01",
    name_key: "name_item_herb_01",
    description_key: "desc_item_herb_01",
    icon_file_name: "item_herb_01.png",
    se_key_use_item: "se_key_small_heal",
    category: "consumable",
    sub_type: "heal",
    max_stack: 20,
    usable_in_quickslot: true,
    use_params: {
      heal_tier: "small",
    },
    ...overrides,
  };
}

function createHtmlResponse(html) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "text/html" : null;
      },
    },
    async text() {
      return html;
    },
    async json() {
      throw new Error("JSON not expected for HTML response");
    },
  };
}

function createJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    async text() {
      return JSON.stringify(payload);
    },
    async json() {
      return payload;
    },
  };
}

function createDirectoryListing(fileNames) {
  return fileNames.map((fileName) => `<a href="${fileName}">${fileName}</a>`).join("\n");
}

function setupFetchMock({ fileNames, recordsByFileName }) {
  const listing = createDirectoryListing(fileNames);
  const fetchMock = vi.fn(async (input) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");

    if (url.includes("/db/item_db/") && !url.includes(".json")) {
      return createHtmlResponse(listing);
    }

    const fileNameMatch = url.match(/\/([^/?#]+\.json)(?:[?#]|$)/);
    const fileName = fileNameMatch?.[1];
    if (fileName && recordsByFileName[fileName]) {
      return createJsonResponse(recordsByFileName[fileName]);
    }

    return {
      ok: false,
      status: 404,
      headers: { get: () => "application/json" },
      async text() {
        return "";
      },
      async json() {
        return {};
      },
    };
  });

  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("itemDb", () => {
  it("loadItemDefinitions は se_key_use_item を seKeyUseItem に正規化する", async () => {
    setupFetchMock({
      fileNames: ["item_herb_01.json"],
      recordsByFileName: {
        "item_herb_01.json": createItemRecord({ se_key_use_item: " se_key_small_heal " }),
      },
    });

    const definitions = await loadItemDefinitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0].id).toBe("item_herb_01");
    expect(definitions[0].seKeyUseItem).toBe("se_key_small_heal");
  });

  it("se_key_use_item が未定義なら空文字にする", async () => {
    const record = createItemRecord();
    delete record.se_key_use_item;

    setupFetchMock({
      fileNames: ["item_herb_01.json"],
      recordsByFileName: {
        "item_herb_01.json": record,
      },
    });

    const definitions = await loadItemDefinitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0].seKeyUseItem).toBe("");
  });
});
