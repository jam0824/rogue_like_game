import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFormationDefinitions } from "../../src/weapon/formationDb.js";

function createFormationRecord(overrides = {}) {
  return {
    id: "formation_id_circle01",
    type: "circle",
    name_key: "formation_name_circle",
    description_key: "formation_desc_circle",
    radius_base: 2.2,
    angular_speed_base: 3.0,
    phase_style: "even",
    bias_strength_mul: 1.1,
    bias_response_mul: 1.0,
    params: {
      center_mode: "biased_center",
    },
    ui: {
      icon_file_name: "ui/icon/icon_formation/icon_formation_circle_01.png",
      sort_order: 10,
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

    if (url.includes("/db/formation_db/") && !url.includes(".json")) {
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
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("formationDb", () => {
  it("loadFormationDefinitions が ui.icon_file_name を ui.iconFileName に正規化する", async () => {
    setupFetchMock({
      fileNames: ["formation_circle_01.json"],
      recordsByFileName: {
        "formation_circle_01.json": createFormationRecord(),
      },
    });

    const formations = await loadFormationDefinitions();

    expect(formations).toHaveLength(1);
    expect(formations[0]).toMatchObject({
      id: "formation_id_circle01",
      ui: {
        iconFileName: "ui/icon/icon_formation/icon_formation_circle_01.png",
        sortOrder: 10,
      },
    });
  });

  it("ui.icon_file_name が欠落している場合はエラーになる", async () => {
    const invalid = createFormationRecord({
      ui: {
        sort_order: 10,
      },
    });

    setupFetchMock({
      fileNames: ["formation_circle_01.json"],
      recordsByFileName: {
        "formation_circle_01.json": invalid,
      },
    });

    await expect(loadFormationDefinitions()).rejects.toThrow("invalid ui.icon_file_name");
  });

  it("type=stop は radius/angular_speed が 0 でも読み込める", async () => {
    setupFetchMock({
      fileNames: ["formation_stop_01.json"],
      recordsByFileName: {
        "formation_stop_01.json": createFormationRecord({
          id: "formation_id_stop01",
          type: "stop",
          radius_base: 0,
          angular_speed_base: 0,
          bias_strength_mul: 0,
          bias_response_mul: 0,
          params: {
            weapon_visible: false,
          },
          ui: {
            icon_file_name: "graphic/ui/icon/icon_formation/icon_formation_stop_01.png",
            sort_order: 70,
          },
        }),
      },
    });

    const formations = await loadFormationDefinitions();
    expect(formations).toHaveLength(1);
    expect(formations[0]).toMatchObject({
      id: "formation_id_stop01",
      type: "stop",
      radiusBase: 0,
      angularSpeedBase: 0,
    });
  });
});
