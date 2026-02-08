export function createAppState(initialSeed) {
  return {
    seed: String(initialSeed),
    dungeon: null,
    validation: null,
    player: null,
    enemies: [],
    backdrop: null,
    error: null,
  };
}

export function setDungeonState(state, payload) {
  state.seed = String(payload.seed);
  state.dungeon = payload.dungeon;
  state.validation = payload.validation;
  state.player = payload.player ?? null;
  state.enemies = payload.enemies ?? [];
  state.backdrop = payload.backdrop ?? null;
  state.error = null;
}

export function setErrorState(state, seed, error) {
  state.seed = String(seed);
  state.dungeon = null;
  state.validation = null;
  state.player = null;
  state.enemies = [];
  state.backdrop = null;
  state.error = error instanceof Error ? error.message : String(error);
}
