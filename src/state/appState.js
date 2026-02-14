const DEFAULT_SYSTEM_UI_INVENTORY_CAPACITY = 10;

export function createEmptySystemUiState() {
  return {
    inventory: {
      isWindowOpen: false,
      capacity: DEFAULT_SYSTEM_UI_INVENTORY_CAPACITY,
      items: [],
      selectedItemId: null,
      droppedItems: [],
    },
    statusEffects: {
      buffs: [],
      debuffs: [],
    },
    toastMessage: "",
  };
}

export function createAppState(initialSeed) {
  return {
    seed: String(initialSeed),
    isPaused: false,
    debugPlayerDamagePreviewOnly: true,
    dungeon: null,
    validation: null,
    playerState: null,
    player: null,
    enemies: [],
    weapons: [],
    effects: [],
    damagePopups: [],
    treasureChests: [],
    groundItems: [],
    systemUi: createEmptySystemUiState(),
    backdrop: null,
    error: null,
  };
}

export function setDungeonState(state, payload) {
  state.seed = String(payload.seed);
  state.isPaused = false;
  state.debugPlayerDamagePreviewOnly = payload.debugPlayerDamagePreviewOnly ?? state.debugPlayerDamagePreviewOnly ?? true;
  state.dungeon = payload.dungeon;
  state.validation = payload.validation;
  state.playerState = payload.playerState ?? state.playerState ?? null;
  state.player = payload.player ?? null;
  state.enemies = payload.enemies ?? [];
  state.weapons = payload.weapons ?? [];
  state.effects = payload.effects ?? [];
  state.damagePopups = payload.damagePopups ?? [];
  state.treasureChests = payload.treasureChests ?? [];
  state.groundItems = payload.groundItems ?? [];
  state.systemUi = payload.systemUi ?? createEmptySystemUiState();
  state.backdrop = payload.backdrop ?? null;
  state.error = null;
}

export function setErrorState(state, seed, error) {
  state.seed = String(seed);
  state.isPaused = false;
  state.debugPlayerDamagePreviewOnly = state.debugPlayerDamagePreviewOnly ?? true;
  state.dungeon = null;
  state.validation = null;
  state.player = null;
  state.enemies = [];
  state.weapons = [];
  state.effects = [];
  state.damagePopups = [];
  state.treasureChests = [];
  state.groundItems = [];
  if (!state.systemUi) {
    state.systemUi = createEmptySystemUiState();
  } else {
    const inventory = state.systemUi.inventory ?? createEmptySystemUiState().inventory;
    state.systemUi = {
      ...state.systemUi,
      inventory: {
        ...inventory,
        isWindowOpen: false,
      },
      statusEffects: {
        buffs: Array.isArray(state.systemUi.statusEffects?.buffs) ? state.systemUi.statusEffects.buffs : [],
        debuffs: Array.isArray(state.systemUi.statusEffects?.debuffs) ? state.systemUi.statusEffects.debuffs : [],
      },
      toastMessage: typeof state.systemUi.toastMessage === "string" ? state.systemUi.toastMessage : "",
    };
  }
  state.backdrop = null;
  state.error = error instanceof Error ? error.message : String(error);
}
