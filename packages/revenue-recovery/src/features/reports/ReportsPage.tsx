import { Suspense, lazy, useState, type ReactNode } from "react";
import { Download, FileBarChart2, Info } from "lucide-react";
import { Button, Card, CardHeader, EmptyState, ErrorBanner, ListSkeleton, Pill, SegmentedControl, cx } from "../../components/ui";
import { useRecoveryContext } from "../../data/context";
import { useReport } from "../../data/useReport";
import { LEAK_META, TONE_CLASSES } from "../../domain/leaks";
import type { MessageFunnel, RecoveredBooking, ReportPeriod, ReportSummary } from "../../domain/reports";
import { BOOKING_RULE_LABELS, PERIOD_LABELS } from "../../domain/reports";
import { downloadCsv, toCsv } from "../../lib/csv";
import { formatDate, formatMoney, formatPercent } from "../../lib/format";

const PERIODS: ReportPeriod[] = ["this_month", "last_month", "last_90_days"];

// The 3D "coming back" animation loads separately so the numbers never wait for it.
const RecoveryFlow = lazy(() => import("../../components/three/RecoveryFlow"));

export const ReportsPage = () => {
  const { currency } = useRecoveryContext();
  const [period, setPeriod] = useState<ReportPeriod>("this_month");
  const report = useReport(period);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Show results for"
          value={period}
          onChange={setPeriod}
          options={PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }))}
        />
        <Button
          variant="outline"
          disabled={!report.data || report.data.bookings.length === 0}
          onClick={() => report.data && exportBookings(report.data.bookings, period, currency)}
        >
          <Download size={15} />
          Download list (Excel)
        </Button>
      </div>

      {report.isPending ? (
        <ListSkeleton label="Loading report" />
      ) : report.isError ? (
        <ErrorBanner message={report.error.message} />
      ) : (
        <ReportBody report={report.data} currency={currency} period={period} />
      )}
    </div>
  );
};

const PERIOD_SENTENCE = {
  this_month: "this month",
  last_month: "last month",
  last_90_days: "in the last 90 days",
} as const satisfies Record<ReportPeriod, string>;

const ReportBody = ({ report, currency, period }: { report: ReportSummary; currency: string; period: ReportPeriod }) => (
  <>
    <section className="grid grid-cols-1 items-center gap-2 overflow-hidden rounded-[1.75rem] bg-rr-surface shadow-rr-lift lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="p-6 sm:p-8">
        <h2 className="font-rr-display text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl">
          {formatMoney(report.recoveredValue, currency)} came back {PERIOD_SENTENCE[period]}.
        </h2>
        <p className="mt-3 max-w-md text-lg text-pretty text-rr-ink-soft">
          From {report.recoveredBookings} patients who booked or kept their appointment after you followed up.
        </p>
      </div>
      <div className="h-52 lg:h-72" aria-hidden>
        <Suspense fallback={null}>
          <RecoveryFlow />
        </Suspense>
      </div>
    </section>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Stat label="Bookings won back" value={String(report.recoveredBookings)}>
        {report.newBookings} new bookings and {report.savedAppointments} kept appointments
      </Stat>
      <Stat label="Success rate" value={formatPercent(report.recoveryRate)}>
        {report.itemsRecovered} booked, {report.itemsLost} not coming
      </Stat>
      <Stat label="Done for you" value={String(report.autoResolved)}>
        patients confirmed themselves on WhatsApp
      </Stat>
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <LeakTable report={report} currency={currency} />
      <Funnel messages={report.messages} />
    </div>

    <BookingsTable bookings={report.bookings} currency={currency} />

    <p className="flex items-start gap-2 px-1 text-xs text-rr-ink-faint">
      <Info size={14} className="mt-px shrink-0" />
      A booking counts as won back when the patient books soon after your message or call, or confirms an appointment
      after a reminder. If they cancel or don't turn up, it is taken off again by itself.
    </p>
  </>
);

const Stat = ({ label, value, tone, children }: { label: string; value: string; tone?: string; children: ReactNode }) => (
  <Card className="p-5">
    <p className="text-sm text-rr-ink-soft">{label}</p>
    <p className={cx("rr-tabular mt-1 font-rr-display text-3xl font-bold tracking-tight", tone)}>{value}</p>
    <p className="mt-1 text-xs text-rr-ink-faint">{children}</p>
  </Card>
);

const LeakTable = ({ report, currency }: { report: ReportSummary; currency: string }) => {
  const max = Math.max(...report.byLeak.map((leak) => leak.recoveredValue), 1);
  return (
    <Card className="xl:col-span-3">
      <CardHeader title="By type of follow-up" subtitle="Who needed following up, and who came back" />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm sm:min-w-[560px]">
          <thead>
            <tr className="border-b border-rr-line text-xs text-rr-ink-faint">
              <th scope="col" className="px-5 py-2 font-medium">Type</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Found</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Booked</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Not coming</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Bookings</th>
              <th scope="col" className="px-5 py-2 text-right font-medium">Money</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rr-line">
            {report.byLeak.map((leak) => {
              const meta = LEAK_META[leak.leakType];
              const tone = TONE_CLASSES[meta.tone];
              return (
                <tr key={leak.leakType}>
                  <th scope="row" className="px-5 py-3 font-medium">
                    <span className="flex items-center gap-2">
                      <span className={cx("size-2 shrink-0 rounded-full", tone.bar)} aria-hidden />
                      {meta.label}
                    </span>
                  </th>
                  <td className="rr-tabular hidden px-2 py-3 text-right sm:table-cell">{leak.found}</td>
                  <td className="rr-tabular px-2 py-3 text-right text-rr-recovered-ink">{leak.recovered}</td>
                  <td className="rr-tabular hidden px-2 py-3 text-right text-rr-ink-soft sm:table-cell">{leak.lost}</td>
                  <td className="rr-tabular hidden px-2 py-3 text-right sm:table-cell">{leak.bookings}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-rr-bg sm:block" aria-hidden>
                        <div className={cx("h-full rounded-full", tone.bar)} style={{ width: `${(leak.recoveredValue / max) * 100}%` }} />
                      </div>
                      <span className="rr-tabular font-semibold">{formatMoney(leak.recoveredValue, currency)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const Funnel = ({ messages }: { messages: MessageFunnel }) => {
  const steps = [
    { label: "Sent", value: messages.sent },
    { label: "Delivered", value: messages.delivered },
    { label: "Read", value: messages.read },
    { label: "Replied", value: messages.replied },
  ];
  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="WhatsApp messages"
        subtitle={`${messages.sent} sent (${messages.automated} automatic), ${messages.received} received from patients`}
      />
      <ol className="flex flex-col gap-3 px-5 py-4">
        {steps.map((step) => {
          const share = messages.sent > 0 ? step.value / messages.sent : 0;
          return (
            <li key={step.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{step.label}</span>
                <span className="rr-tabular text-rr-ink-soft">
                  {step.value} <span className="text-xs text-rr-ink-faint">({formatPercent(share)})</span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-rr-bg" aria-hidden>
                <div className="h-full rounded-full bg-rr-primary" style={{ width: `${share * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
      {messages.failed > 0 && (
        <p className="border-t border-rr-line px-5 py-3 text-xs text-rr-missed-ink">
          {messages.failed} could not be delivered. Open Messages to see why.
        </p>
      )}
    </Card>
  );
};

const BOOKINGS_PREVIEW = 12;

const BookingsTable = ({ bookings, currency }: { bookings: RecoveredBooking[]; currency: string }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? bookings : bookings.slice(0, BOOKINGS_PREVIEW);
  return (
  <Card>
    <CardHeader title="Bookings won back" subtitle="Each booking and what brought it back" />
    {bookings.length === 0 ? (
      <EmptyState icon={<FileBarChart2 size={22} />} title="No bookings won back in this period yet" />
    ) : (
      <ul className="mt-3 divide-y divide-rr-line">
        {visible.map((booking) => {
          const meta = booking.leakType ? LEAK_META[booking.leakType] : null;
          return (
            <li key={booking.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3">
              <span className="rr-tabular w-24 shrink-0 text-[13px] text-rr-ink-soft">{formatDate(booking.bookedAt)}</span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-sm font-medium">{booking.patientName}</p>
                <p className="truncate text-[13px] text-rr-ink-soft">{booking.treatment}</p>
              </div>
              <Pill tone={booking.rule === "saved_appointment" ? "info" : "recovered"}>{BOOKING_RULE_LABELS[booking.rule]}</Pill>
              <span className="min-w-0 basis-56 text-xs text-rr-ink-faint sm:basis-64">
                {meta ? meta.label : "Other"}
                {" · "}
                {booking.templateName ? `${booking.automated ? "Automatic reminder" : "Message from staff"}: “${booking.templateName}”` : "Staff follow-up"}
              </span>
              <span className="rr-tabular ml-auto text-sm font-semibold">{formatMoney(booking.value, currency)}</span>
            </li>
          );
        })}
      </ul>
    )}
    {bookings.length > BOOKINGS_PREVIEW && (
      <div className="border-t border-rr-line px-5 py-3 text-center">
        <Button variant="ghost" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${bookings.length} bookings`}
        </Button>
      </div>
    )}
  </Card>
  );
};

const exportBookings = (bookings: RecoveredBooking[], period: ReportPeriod, currency: string): void => {
  const csv = toCsv(
    ["Booked on", "Patient", "Treatment", "Appointment", "How", "Type", "Message", `Value (${currency})`],
    bookings.map((booking) => [
      booking.bookedAt.slice(0, 10),
      booking.patientName,
      booking.treatment,
      booking.startsAt.slice(0, 16).replace("T", " "),
      BOOKING_RULE_LABELS[booking.rule],
      booking.leakType ? LEAK_META[booking.leakType].label : "Other",
      booking.templateName ?? "Call or visit",
      booking.value,
    ]),
  );
  downloadCsv(`recovered-bookings-${period.replace(/_/g, "-")}.csv`, csv);
};
