import type { OverdueFollowup, UpcomingAppointment } from "../domain/types";
import { toDateKey } from "../lib/format";

const QUARTER_HOUR_MS = 15 * 60_000;

/** A time `hours` from now, rounded to the quarter hour like a real booking. */
const inHours = (now: number, hours: number): string =>
  new Date(Math.round((now + hours * 3_600_000) / QUARTER_HOUR_MS) * QUARTER_HOUR_MS).toISOString();

/** A clock time on the day `dayOffset` days from today, local time. */
const onDay = (now: number, dayOffset: number, hour: number, minute = 0): string => {
  const date = new Date(now);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

type AppointmentSeed = Omit<UpcomingAppointment, "startsAt"> & { startsAt: (now: number) => string };

const APPOINTMENT_SEEDS: AppointmentSeed[] = [
  {
    id: "demo-appt-1",
    startsAt: (now) => inHours(now, 1.5),
    status: "confirmed",
    treatment: "Scaling and polishing",
    estimatedValue: 2_500,
    patientName: "Gaurav Singh",
    patientPhone: "+91 98110 76543",
  },
  {
    id: "demo-appt-2",
    startsAt: (now) => inHours(now, 3),
    status: "scheduled",
    treatment: "Composite filling",
    estimatedValue: 3_500,
    patientName: "Rekha Iyer",
    patientPhone: "+91 94440 12876",
  },
  {
    id: "demo-appt-3",
    startsAt: (now) => onDay(now, 1, 10, 30),
    status: "scheduled",
    treatment: "Implant consultation",
    estimatedValue: 45_000,
    patientName: "Ananya Rao",
    patientPhone: "+91 98450 12345",
  },
  {
    id: "demo-appt-4",
    startsAt: (now) => onDay(now, 1, 12, 15),
    status: "scheduled",
    treatment: "Crown fitting",
    estimatedValue: 15_000,
    patientName: "Aditya Verma",
    patientPhone: "+91 99870 34512",
  },
  {
    id: "demo-appt-5",
    startsAt: (now) => onDay(now, 1, 14, 0),
    status: "confirmed",
    treatment: "Braces adjustment",
    estimatedValue: 3_000,
    patientName: "Tanvi Bhatt",
    patientPhone: "+91 97730 90112",
  },
  {
    id: "demo-appt-6",
    startsAt: (now) => onDay(now, 1, 16, 0),
    status: "scheduled",
    treatment: "Root canal, sitting 2",
    estimatedValue: 8_000,
    patientName: "Rohan Gupta",
    patientPhone: "+91 98100 65432",
  },
  {
    id: "demo-appt-7",
    startsAt: (now) => onDay(now, 1, 18, 30),
    status: "confirmed",
    treatment: "Teeth whitening",
    estimatedValue: 9_000,
    patientName: "Sneha Kulkarni",
    patientPhone: "+91 98220 61540",
  },
  {
    id: "demo-appt-8",
    startsAt: (now) => onDay(now, 2, 9, 30),
    status: "scheduled",
    treatment: "Scaling and polishing",
    estimatedValue: 2_500,
    patientName: "Nisha Patel",
    patientPhone: "+91 99250 17788",
  },
  {
    id: "demo-appt-9",
    startsAt: (now) => onDay(now, 2, 11, 0),
    status: "confirmed",
    treatment: "Wisdom tooth extraction",
    estimatedValue: 6_500,
    patientName: "Arjun Nair",
    patientPhone: "+91 97440 11223",
  },
  {
    id: "demo-appt-10",
    startsAt: (now) => onDay(now, 2, 12, 30),
    status: "scheduled",
    treatment: "Child check-up",
    estimatedValue: 1_200,
    patientName: "Aarav Mehta",
    patientPhone: null,
  },
];

export const buildDemoAppointments = (now: number = Date.now()): UpcomingAppointment[] =>
  APPOINTMENT_SEEDS.map(({ startsAt, ...appointment }) => ({ ...appointment, startsAt: startsAt(now) }));

type FollowupSeed = Omit<OverdueFollowup, "dueOn" | "lastVisitAt"> & {
  overdueDays: number;
  lastVisitDaysAgo: number | null;
};

const FOLLOWUP_SEEDS: FollowupSeed[] = [
  {
    id: "demo-fu-1",
    kind: "treatment_step",
    procedure: "Crown after root canal",
    estimatedValue: 18_000,
    patientName: "Vikram Shah",
    patientPhone: "+91 98201 44556",
    overdueDays: 12,
    lastVisitDaysAgo: 44,
  },
  {
    id: "demo-fu-2",
    kind: "treatment_step",
    procedure: "Implant stage 2",
    estimatedValue: 35_000,
    patientName: "Suresh Reddy",
    patientPhone: "+91 99490 56781",
    overdueDays: 60,
    lastVisitDaysAgo: 95,
  },
  {
    id: "demo-fu-3",
    kind: "treatment_step",
    procedure: "Braces adjustment",
    estimatedValue: 3_000,
    patientName: "Kavya Menon",
    patientPhone: "+91 95390 44120",
    overdueDays: 35,
    lastVisitDaysAgo: 63,
  },
  {
    id: "demo-fu-4",
    kind: "treatment_step",
    procedure: "Filling, second tooth",
    estimatedValue: 3_500,
    patientName: "Pooja Desai",
    patientPhone: "+91 97690 55012",
    overdueDays: 9,
    lastVisitDaysAgo: 23,
  },
  {
    id: "demo-fu-5",
    kind: "treatment_step",
    procedure: "Root canal, sitting 3",
    estimatedValue: 6_000,
    patientName: "Mohammed Ali",
    patientPhone: "+91 98450 66009",
    overdueDays: 20,
    lastVisitDaysAgo: 34,
  },
  {
    id: "demo-fu-6",
    kind: "recall",
    procedure: "6-month hygiene recall",
    estimatedValue: 2_500,
    patientName: "Fatima Khan",
    patientPhone: "+91 98670 77889",
    overdueDays: 21,
    lastVisitDaysAgo: 204,
  },
  {
    id: "demo-fu-7",
    kind: "recall",
    procedure: "6-month check-up",
    estimatedValue: 1_500,
    patientName: "Divya Krishnan",
    patientPhone: "+91 94430 28761",
    overdueDays: 45,
    lastVisitDaysAgo: 228,
  },
  {
    id: "demo-fu-8",
    kind: "recall",
    procedure: "Annual check-up and X-ray",
    estimatedValue: 2_000,
    patientName: "Ramesh Iyer",
    patientPhone: "+91 98400 51239",
    overdueDays: 90,
    lastVisitDaysAgo: 455,
  },
  {
    id: "demo-fu-9",
    kind: "recall",
    procedure: "Scaling recall",
    estimatedValue: 2_500,
    patientName: "Neha Agarwal",
    patientPhone: "+91 99300 47125",
    overdueDays: 14,
    lastVisitDaysAgo: 197,
  },
  {
    id: "demo-fu-10",
    kind: "recall",
    procedure: "Denture review",
    estimatedValue: 1_800,
    patientName: "Shankar Rao",
    patientPhone: null,
    overdueDays: 120,
    lastVisitDaysAgo: null,
  },
];

const daysAgo = (now: number, days: number): Date => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date;
};

export const buildDemoFollowups = (now: number = Date.now()): OverdueFollowup[] =>
  FOLLOWUP_SEEDS.map(({ overdueDays, lastVisitDaysAgo, ...followup }) => ({
    ...followup,
    dueOn: toDateKey(daysAgo(now, overdueDays)),
    lastVisitAt: lastVisitDaysAgo === null ? null : daysAgo(now, lastVisitDaysAgo).toISOString(),
  }));
