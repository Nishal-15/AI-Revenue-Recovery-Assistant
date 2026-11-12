import type { BookingRule, LeakReport, RecoveredBooking, ReportPeriod, ReportSummary } from "../domain/reports";
import { periodRange } from "../domain/reports";
import { LEAK_TYPES, type LeakType } from "../domain/types";

// Demo report built from one list of bookings, so every total adds up. "This month" matches the
// demo dashboard (₹2,48,500 from 37 bookings, 42% recovery rate).

type Seed = { leakType: LeakType; value: number; treatment: string };

const seedsFor = (leakType: LeakType, values: number[], treatments: string[]): Seed[] =>
  values.map((value, index) => ({ leakType, value, treatment: treatments[index % treatments.length] ?? "Appointment" }));

const BASE: Seed[] = [
  ...seedsFor("missed_enquiry", [12_000, 6_500, 25_000, 8_000, 3_500, 15_000, 10_000, 12_000], [
    "Crown", "Consultation and cleaning", "Implant stage 1", "Root canal", "Extraction", "Aligners consultation", "Whitening", "Bridge",
  ]),
  ...seedsFor("overdue_followup", [12_500, 4_000, 6_000, 3_500, 5_500], [
    "Braces adjustment", "Filling", "Root canal, sitting 2", "Scaling", "Crown fitting",
  ]),
  ...seedsFor("unconfirmed_appointment", [2_500, 3_500, 6_500, 4_000, 2_500, 8_000, 3_000, 9_000, 1_200, 4_500, 2_500, 6_000, 3_500, 4_800, 1_500], [
    "Scaling and polishing", "Composite filling", "Wisdom tooth extraction", "Crown fitting", "Check-up",
  ]),
  ...seedsFor("lapsed_patient", [18_000, 2_500, 6_000, 3_500, 12_000, 2_500, 8_000, 4_500, 5_000], [
    "Crown after root canal", "6-month hygiene recall", "Implant stage 2", "Filling, second tooth", "Bridge",
  ]),
];

const NAMES = [
  "Ananya Rao", "Vikram Shah", "Meera Iyer", "Rahul Menon", "Fatima Khan", "Arjun Nair", "Priya Sharma", "Suresh Reddy",
  "Kavya Menon", "Rohan Gupta", "Sneha Kulkarni", "Aditya Verma", "Pooja Desai", "Mohammed Ali", "Nisha Patel",
  "Tanvi Bhatt", "Gaurav Singh", "Rekha Iyer", "Karan Malhotra", "Divya Nair",
];

/** How each period compares with this month, in bookings and in found / resolved items. */
const SCALE = { this_month: 1, last_month: 0.78, last_90_days: 2.65 } as const satisfies Record<ReportPeriod, number>;

const FOUND = { missed_enquiry: 34, overdue_followup: 18, unconfirmed_appointment: 41, lapsed_patient: 52 } as const;
const RECOVERED = { missed_enquiry: 10, overdue_followup: 6, unconfirmed_appointment: 15, lapsed_patient: 13 } as const;
const LOST = { missed_enquiry: 12, overdue_followup: 7, unconfirmed_appointment: 17, lapsed_patient: 25 } as const;

const ruleFor = (leakType: LeakType): BookingRule =>
  leakType === "unconfirmed_appointment" ? "saved_appointment" : "new_booking";

const buildBookings = (period: ReportPeriod, now: Date): RecoveredBooking[] => {
  const { from, to } = periodRange(period, now);
  const end = Math.min(to.getTime(), now.getTime());
  const count = Math.round(BASE.length * SCALE[period]);
  const span = Math.max(end - from.getTime(), 3_600_000);

  return Array.from({ length: count }, (_, index) => {
    // Stepping by 11 (coprime with the list length) mixes leak types the way real bookings arrive.
    const seed = BASE[(index * 11) % BASE.length];
    if (!seed) throw new Error("empty demo seed list");
    const bookedAt = new Date(from.getTime() + ((index + 0.5) / count) * span);
    return {
      id: `demo-booking-${period}-${index}`,
      bookedAt: bookedAt.toISOString(),
      value: seed.value,
      rule: ruleFor(seed.leakType),
      leakType: seed.leakType,
      patientName: NAMES[(index * 7) % NAMES.length] ?? "Patient",
      treatment: seed.treatment,
      startsAt: new Date(bookedAt.getTime() + 3 * 86_400_000).toISOString(),
      templateName:
        seed.leakType === "overdue_followup"
          ? null
          : { missed_enquiry: "Enquiry follow-up", unconfirmed_appointment: "Appointment confirmation", lapsed_patient: "Follow-up due" }[seed.leakType],
      automated: seed.leakType !== "overdue_followup",
    };
  }).sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));
};

export const buildDemoReport = async (period: ReportPeriod, now: Date = new Date()): Promise<ReportSummary> => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const bookings = buildBookings(period, now);
  const scale = SCALE[period];
  const scaled = (value: number) => Math.round(value * scale);

  const byLeak: LeakReport[] = LEAK_TYPES.map((leakType) => {
    const leakBookings = bookings.filter((booking) => booking.leakType === leakType);
    return {
      leakType,
      found: scaled(FOUND[leakType]),
      recovered: scaled(RECOVERED[leakType]),
      lost: scaled(LOST[leakType]),
      bookings: leakBookings.length,
      recoveredValue: leakBookings.reduce((sum, booking) => sum + booking.value, 0),
    };
  });

  const itemsRecovered = byLeak.reduce((sum, leak) => sum + leak.recovered, 0);
  const itemsLost = byLeak.reduce((sum, leak) => sum + leak.lost, 0);

  return {
    recoveredValue: bookings.reduce((sum, booking) => sum + booking.value, 0),
    recoveredBookings: bookings.length,
    newBookings: bookings.filter((booking) => booking.rule === "new_booking").length,
    savedAppointments: bookings.filter((booking) => booking.rule === "saved_appointment").length,
    itemsFound: byLeak.reduce((sum, leak) => sum + leak.found, 0),
    itemsRecovered,
    itemsLost,
    recoveryRate: itemsRecovered + itemsLost > 0 ? itemsRecovered / (itemsRecovered + itemsLost) : 0,
    autoResolved: scaled(11),
    messages: {
      sent: scaled(412),
      automated: scaled(356),
      delivered: scaled(398),
      read: scaled(341),
      replied: scaled(126),
      failed: scaled(6),
      received: scaled(188),
      aiRead: scaled(97),
    },
    byLeak,
    bookings,
  };
};
