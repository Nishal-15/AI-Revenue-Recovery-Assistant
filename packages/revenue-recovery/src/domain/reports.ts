import type { LeakType } from "./types";

export type ReportPeriod = "this_month" | "last_month" | "last_90_days";

export type BookingRule = "new_booking" | "saved_appointment";

export type RecoveredBooking = {
  id: string;
  bookedAt: string;
  value: number;
  rule: BookingRule;
  leakType: LeakType | null;
  patientName: string;
  treatment: string;
  startsAt: string;
  templateName: string | null;
  automated: boolean;
};

export type LeakReport = {
  leakType: LeakType;
  found: number;
  recovered: number;
  lost: number;
  bookings: number;
  recoveredValue: number;
};

export type MessageFunnel = {
  sent: number;
  automated: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  received: number;
  aiRead: number;
};

export type ReportSummary = {
  recoveredValue: number;
  recoveredBookings: number;
  newBookings: number;
  savedAppointments: number;
  itemsFound: number;
  itemsRecovered: number;
  itemsLost: number;
  recoveryRate: number;
  autoResolved: number;
  messages: MessageFunnel;
  byLeak: LeakReport[];
  bookings: RecoveredBooking[];
};

export const PERIOD_LABELS = {
  this_month: "This month",
  last_month: "Last month",
  last_90_days: "Last 90 days",
} as const satisfies Record<ReportPeriod, string>;

/** [from, to) in the viewer's local time, which is the clinic's for front-desk use. */
export const periodRange = (period: ReportPeriod, now: Date = new Date()): { from: Date; to: Date } => {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  switch (period) {
    case "this_month":
      return { from: startOfMonth, to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case "last_month":
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: startOfMonth };
    case "last_90_days": {
      const from = new Date(now);
      from.setDate(from.getDate() - 90);
      return { from, to: now };
    }
  }
};

export const BOOKING_RULE_LABELS = {
  new_booking: "New booking",
  saved_appointment: "Saved appointment",
} as const satisfies Record<BookingRule, string>;
