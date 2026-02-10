export function createAppState(initialSeed) {
  return {
    seed: String(initialSeed),
    isPaused: false,
    debugPlayerDamagePreviewOnly: false,
    dungeon: null,
    validation: null,
    playerState: null,
    player: null,
    enemies: [],
    weapons: [],
    damagePopups: [],
    backdrop: null,
    error: null,
  };
}

export function setDungeonState(state, payload) {
  state.seed = String(payload.seed);
  state.isPaused = false;
  state.debugPlayerDamagePreviewOnly = payload.debugPlayerDamagePreviewOnly ?? state.debugPlayerDamagePreviewOnly ?? false;
  state.dungeon = payload.dungeon;
  state.validation = payload.validation;
  state.playerState = payload.playerState ?? state.playerState ?? null;
  state.player = payload.player ?? null;
  state.enemies = payload.enemies ?? [];
  state.weapons = payload.weapons ?? [];
  state.damagePopups = payload.damagePopups ?? [];
  state.backdrop = payload.backdrop ?? null;
  state.error = null;
}

export function setErrorState(state, seed, error) {
  state.seed = String(seed);
  state.isPaused = false;
  state.debugPlayerDamagePreviewOnly = state.debugPlayerDamagePreviewOnly ?? false;
  state.dungeon = null;
  state.validation = null;
  state.player = null;
  state.enemies = [];
  state.weapons = [];
  state.damagePopups = [];
  state.backdrop = null;
  state.error = error instanceof Error ? error.message : String(error);
}
