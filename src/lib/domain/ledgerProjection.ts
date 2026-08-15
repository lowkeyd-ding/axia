import { applyEvent, EMPTY_PROJECTION_STATE, type EconomicEvent, type ProjectionState } from './events';

export function projectEvents(events: EconomicEvent[], initialState: ProjectionState = EMPTY_PROJECTION_STATE): ProjectionState {
  return events.reduce((state, event) => applyEvent(state, event), initialState);
}
