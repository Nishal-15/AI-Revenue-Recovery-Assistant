import type { DashboardSummary } from "../domain/types";

const hoursFromNow = (hours: number): string => new Date(Date.now() + hours * 3_600_000).toISOString();

const weeksAgo = (weeks: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - weeks * 7);
  return date.toISOString().slice(0, 10);
};

export const buildDemoSummary = (currency: string): DashboardSummary => ({
  currency,
  recoveredValue: 248_500,
  recoveredPreviousValue: 191_200,
  recoveredBookings: 37,
  atRiskValue: 412_800,
  recoveryRate: 0.42,
  leaks: {
    missed_enquiry: { openCount: 14, atRiskValue: 96_000 },
    overdue_followup: { openCount: 9, atRiskValue: 54_500 },
    unconfirmed_appointment: { openCount: 21, atRiskValue: 118_300 },
    lapsed_patient: { openCount: 32, atRiskValue: 144_000 },
  },
  weekly: [
    { weekStart: weeksAgo(7), recoveredValue: 28_400 },
    { weekStart: weeksAgo(6), recoveredValue: 35_100 },
    { weekStart: weeksAgo(5), recoveredValue: 31_800 },
    { weekStart: weeksAgo(4), recoveredValue: 44_600 },
    { weekStart: weeksAgo(3), recoveredValue: 52_300 },
    { weekStart: weeksAgo(2), recoveredValue: 49_900 },
    { weekStart: weeksAgo(1), recoveredValue: 63_200 },
    { weekStart: weeksAgo(0), recoveredValue: 71_500 },
  ],
  topItems: [
    {
      id: "demo-1",
      leakType: "unconfirmed_appointment",
      patientName: "Ananya Rao",
      reason: "Implant consult tomorrow 10:30, no reply to 2 reminders",
      estimatedValue: 45_000,
      priorityScore: 92,
      dueAt: hoursFromNow(5),
    },
    {
      id: "demo-2",
      leakType: "lapsed_patient",
      patientName: "Vikram Shah",
      reason: "Crown after root canal planned 6 weeks ago, not booked",
      estimatedValue: 18_000,
      priorityScore: 87,
      dueAt: hoursFromNow(-24 * 12),
    },
    {
      id: "demo-3",
      leakType: "missed_enquiry",
      patientName: "Meera Iyer",
      reason: "WhatsApp enquiry about aligners, unanswered for 3 h",
      estimatedValue: 65_000,
      priorityScore: 84,
      dueAt: hoursFromNow(-3),
    },
    {
      id: "demo-4",
      leakType: "overdue_followup",
      patientName: "Rahul Menon",
      reason: "Callback promised after treatment quote",
      estimatedValue: 12_500,
      priorityScore: 71,
      dueAt: hoursFromNow(-30),
    },
    {
      id: "demo-5",
      leakType: "lapsed_patient",
      patientName: "Fatima Khan",
      reason: "6-month hygiene recall overdue by 3 weeks",
      estimatedValue: 2_500,
      priorityScore: 58,
      dueAt: hoursFromNow(-24 * 21),
    },
  ],
});
