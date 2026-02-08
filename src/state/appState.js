export function createAppState(initialSeed) {
  return {
    seed: String(initialSeed),
    dungeon: null,
    validation: null,
    error: null,
  };
}

export function setDungeonState(state, payload) {
  state.seed = String(payload.seed);
  state.dungeon = payload.dungeon;
  state.validation = payload.validation;
  state.error = null;
}

export function setErrorState(state, seed, error) {
  state.seed = String(seed);
  state.dungeon = null;
  state.validation = null;
  state.error = error instanceof Error ? error.message : String(error);
}
