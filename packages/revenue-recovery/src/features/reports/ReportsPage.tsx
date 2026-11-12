import { useState, type ReactNode } from "react";
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

export const ReportsPage = () => {
  const { currency } = useRecoveryContext();
  const [period, setPeriod] = useState<ReportPeriod>("this_month");
  const report = useReport(period);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <SegmentedControl
          label="Report period"
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
          Export bookings (CSV)
        </Button>
      </Card>

      {report.isPending ? (
        <ListSkeleton label="Loading report" />
      ) : report.isError ? (
        <ErrorBanner message={report.error.message} />
      ) : (
        <ReportBody report={report.data} currency={currency} />
      )}
    </div>
  );
};

const ReportBody = ({ report, currency }: { report: ReportSummary; currency: string }) => (
  <>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Revenue recovered" value={formatMoney(report.recoveredValue, currency)} tone="text-rr-recovered-ink">
        from {report.recoveredBookings} bookings
      </Stat>
      <Stat label="Bookings recovered" value={String(report.recoveredBookings)}>
        {report.newBookings} new · {report.savedAppointments} saved appointments
      </Stat>
      <Stat label="Recovery rate" value={formatPercent(report.recoveryRate)}>
        {report.itemsRecovered} recovered · {report.itemsLost} lost
      </Stat>
      <Stat label="Handled without staff" value={String(report.autoResolved)}>
        confirmed on WhatsApp · {report.messages.aiRead} replies read by AI
      </Stat>
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <LeakTable report={report} currency={currency} />
      <Funnel messages={report.messages} />
    </div>

    <BookingsTable bookings={report.bookings} currency={currency} />

    <p className="flex items-start gap-2 px-1 text-xs text-rr-ink-faint">
      <Info size={14} className="mt-px shrink-0" />
      A booking counts as recovered when the patient books within the attribution window (Settings) after a WhatsApp
      message or a staff follow-up, or when an at-risk appointment is confirmed after a reminder. Bookings later
      cancelled or missed are removed automatically.
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
      <CardHeader title="By leak type" subtitle="What was found, and what came back" />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm sm:min-w-[560px]">
          <thead>
            <tr className="border-b border-rr-line text-xs text-rr-ink-faint">
              <th scope="col" className="px-5 py-2 font-medium">Leak</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Found</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Recovered</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Lost</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Bookings</th>
              <th scope="col" className="px-5 py-2 text-right font-medium">Revenue</th>
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
        title="WhatsApp funnel"
        subtitle={`${messages.automated} of ${messages.sent} sent automatically · ${messages.received} messages received`}
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
          {messages.failed} could not be delivered. Open the WhatsApp inbox to see why.
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
    <CardHeader title="Recovered bookings" subtitle="Each booking and what brought it back" />
    {bookings.length === 0 ? (
      <EmptyState icon={<FileBarChart2 size={22} />} title="No recovered bookings in this period yet" />
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
                {meta ? meta.label : "Other outreach"}
                {" · "}
                {booking.templateName ? `${booking.automated ? "Automated" : "Staff sent"} “${booking.templateName}”` : "Staff follow-up"}
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
    ["Booked on", "Patient", "Treatment", "Appointment", "How", "Leak type", "Message", `Value (${currency})`],
    bookings.map((booking) => [
      booking.bookedAt.slice(0, 10),
      booking.patientName,
      booking.treatment,
      booking.startsAt.slice(0, 16).replace("T", " "),
      BOOKING_RULE_LABELS[booking.rule],
      booking.leakType ? LEAK_META[booking.leakType].label : "Other outreach",
      booking.templateName ?? "Staff follow-up",
      booking.value,
    ]),
  );
  downloadCsv(`recovered-bookings-${period.replace(/_/g, "-")}.csv`, csv);
};
