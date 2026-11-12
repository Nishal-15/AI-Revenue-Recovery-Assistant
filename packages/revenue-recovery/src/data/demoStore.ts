import type { OverdueFollowup, RecoveryItemPatch, UpcomingAppointment, WorklistItem } from "../domain/types";
import { buildDemoAppointments, buildDemoFollowups } from "./demoSchedule";
import { buildDemoWorklist } from "./demoWorklist";
import { applyItemPatch } from "./recoveryItemPatch";

// In-memory stand-in for the database so actions work in demo mode. Mutations write here,
// queries re-read it; everything resets on page reload.
type DemoState = {
  items: WorklistItem[];
  appointments: UpcomingAppointment[];
  followups: OverdueFollowup[];
};

let state: DemoState | null = null;

const getState = (): DemoState => {
  if (!state) {
    const now = Date.now();
    state = {
      items: buildDemoWorklist(now),
      appointments: buildDemoAppointments(now),
      followups: buildDemoFollowups(now),
    };
  }
  return state;
};

/** Feels like a network round trip, so loading and optimistic states are visible in demos. */
const LATENCY_MS = 250;
const simulateLatency = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

export const demoStore = {
  listItems: async (): Promise<WorklistItem[]> => {
    await simulateLatency();
    return getState().items.map((item) => ({ ...item }));
  },

  updateItem: async (id: string, patch: RecoveryItemPatch): Promise<void> => {
    await simulateLatency();
    const current = getState();
    if (!current.items.some((item) => item.id === id)) throw new Error("That item no longer exists.");
    current.items = current.items.map((item) => (item.id === id ? applyItemPatch(item, patch) : item));
  },

  listAppointments: async (): Promise<UpcomingAppointment[]> => {
    await simulateLatency();
    return getState().appointments.map((appointment) => ({ ...appointment }));
  },

  confirmAppointment: async (id: string): Promise<void> => {
    await simulateLatency();
    const current = getState();
    current.appointments = current.appointments.map((appointment) =>
      appointment.id === id ? { ...appointment, status: "confirmed" } : appointment,
    );
  },

  listFollowups: async (): Promise<OverdueFollowup[]> => {
    await simulateLatency();
    return getState().followups.map((followup) => ({ ...followup }));
  },
};
