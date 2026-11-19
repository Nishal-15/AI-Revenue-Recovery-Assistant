import { useMemo, useState } from "react";
import { CalendarCheck2, Check } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import { Gauge } from "../../components/Gauge";
import { WhatsAppLink } from "../../components/WhatsAppLink";
import { Button, EmptyState, ErrorBanner, ListSkeleton, Pill, cx } from "../../components/ui";
import { useRecoveryContext } from "../../data/context";
import { useConfirmAppointment, useConfirmations } from "../../data/useConfirmations";
import type { Tone } from "../../domain/leaks";
import type { UpcomingAppointment } from "../../domain/types";
import { calendarDaysBetween, formatMoney, formatTime, toDateKey } from "../../lib/format";

const DUE_SOON_MS = 24 * 3_600_000;
const DAYS_SHOWN = 4;

type Day = { key: string; date: Date; appointments: UpcomingAppointment[] };

/** Today plus the next few days, including days with no appointments, so the strip never jumps. */
const buildDays = (appointments: UpcomingAppointment[], now: Date): Day[] =>
  Array.from({ length: DAYS_SHOWN }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const key = toDateKey(date);
    return { key, date, appointments: appointments.filter((a) => toDateKey(new Date(a.startsAt)) === key) };
  });

const dayName = (date: Date, now: Date): string => {
  const offset = calendarDaysBetween(now, date);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return date.toLocaleDateString("en-IN", { weekday: "short" });
};

const confirmationPill = (appointment: UpcomingAppointment, now: number): { label: string; tone: Tone } => {
  if (appointment.status === "confirmed") return { label: "Confirmed", tone: "recovered" };
  if (new Date(appointment.startsAt).getTime() - now < DUE_SOON_MS) return { label: "Due soon", tone: "missed" };
  return { label: "Not confirmed", tone: "risk" };
};

export const ConfirmationsPage = () => {
  const { currency } = useRecoveryContext();
  const { data, isPending, isError, error } = useConfirmations();
  const confirm = useConfirmAppointment();
  const today = useMemo(() => new Date(), []);
  const appointments = useMemo(() => data ?? [], [data]);
  const days = useMemo(() => buildDays(appointments, today), [appointments, today]);
  const [selectedKey, setSelectedKey] = useState<string | "all">("all");

  if (isPending) return <ListSkeleton label="Loading upcoming appointments" />;
  if (isError) return <ErrorBanner message={error.message} />;

  const now = Date.now();
  const confirmedCount = appointments.filter((a) => a.status === "confirmed").length;
  const notConfirmed = appointments.filter((a) => a.status !== "confirmed");
  const notConfirmedValue = notConfirmed.reduce((sum, a) => sum + a.estimatedValue, 0);
  const dueSoon = notConfirmed.filter((a) => new Date(a.startsAt).getTime() - now < DUE_SOON_MS).length;
  const share = appointments.length > 0 ? confirmedCount / appointments.length : 0;
  const shown = selectedKey === "all" ? days.filter((day) => day.appointments.length > 0) : days.filter((day) => day.key === selectedKey);

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-labelledby="rr-schedule" className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="rr-schedule" className="text-2xl font-normal text-rr-on-canvas">
            Next {DAYS_SHOWN - 1} days
          </h2>
        </div>

        <div role="group" aria-label="Choose a day" className="flex gap-2 overflow-x-auto pb-1">
          <DayButton active={selectedKey === "all"} onClick={() => setSelectedKey("all")} top="All" bottom={String(appointments.length)} />
          {days.map((day) => {
            const unconfirmed = day.appointments.filter((a) => a.status !== "confirmed").length;
            return (
              <DayButton
                key={day.key}
                active={selectedKey === day.key}
                onClick={() => setSelectedKey(day.key)}
                top={dayName(day.date, today)}
                bottom={String(day.date.getDate())}
                dots={unconfirmed}
                ariaLabel={`${dayName(day.date, today)} ${day.date.getDate()}: ${day.appointments.length} appointments, ${unconfirmed} not confirmed`}
              />
            );
          })}
        </div>

        {confirm.isError && <ErrorBanner message={confirm.error.message} onDismiss={() => confirm.reset()} />}

        {shown.length === 0 || shown.every((day) => day.appointments.length === 0) ? (
          <div className="rounded-rr-card bg-rr-surface">
            <EmptyState icon={<CalendarCheck2 size={22} />} title="No appointments on this day" />
          </div>
        ) : (
          shown.map((day) => (
            <section key={day.key} aria-label={dayName(day.date, today)} className="overflow-hidden rounded-rr-card bg-rr-surface">
              <header className="flex items-baseline justify-between px-5 pt-5 pb-3">
                <h3 className="text-lg font-semibold">
                  {dayName(day.date, today)}, {day.date.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
                </h3>
                <p className="text-sm text-rr-ink-soft">
                  {day.appointments.length} {day.appointments.length === 1 ? "appointment" : "appointments"}
                </p>
              </header>
              <ul className="divide-y divide-rr-line border-t border-rr-line">
                {day.appointments.map((appointment) => {
                  const pill = confirmationPill(appointment, now);
                  return (
                    <li key={appointment.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                      <p className="rr-tabular w-20 shrink-0 text-lg font-light whitespace-nowrap">{formatTime(appointment.startsAt)}</p>
                      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                        <Avatar name={appointment.patientName} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{appointment.patientName}</p>
                          <p className="truncate text-sm text-rr-ink-soft">
                            {appointment.treatment} · {formatMoney(appointment.estimatedValue, currency)}
                          </p>
                        </div>
                      </div>
                      <Pill tone={pill.tone}>{pill.label}</Pill>
                      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                        {appointment.status !== "confirmed" && (
                          <Button variant="outline" className="rounded-full" onClick={() => confirm.mutate(appointment.id)}>
                            <Check size={15} />
                            Mark as confirmed
                          </Button>
                        )}
                        <WhatsAppLink phone={appointment.patientPhone} patientName={appointment.patientName} className="rounded-full" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </section>

      <aside aria-label="Confirmations at a glance" className="flex flex-col gap-4">
        <section className="rounded-rr-card bg-rr-surface p-5">
          <h2 className="text-xl font-normal">Confirmed so far</h2>
          <div className="relative mt-2 flex justify-center">
            <Gauge share={share} />
            <div className="absolute inset-x-0 bottom-0 text-center">
              <p className="rr-tabular text-5xl font-light">
                {confirmedCount}
                <span className="text-2xl text-rr-ink-soft">/{appointments.length}</span>
              </p>
              <p className="text-sm text-rr-ink-soft">appointments confirmed</p>
            </div>
          </div>
        </section>
        <div className="grid grid-cols-2 divide-x divide-rr-canvas-line rounded-rr-card border border-rr-canvas-line bg-rr-glass py-5 text-rr-on-canvas">
          <div className="px-5">
            <p className="rr-tabular text-4xl font-light">{String(dueSoon).padStart(2, "0")}</p>
            <p className="mt-1 text-rr-on-canvas-soft">Due soon, not confirmed</p>
          </div>
          <div className="px-5">
            <p className="rr-tabular text-2xl font-light">{formatMoney(notConfirmedValue, currency)}</p>
            <p className="mt-1 text-rr-on-canvas-soft">Waiting to be confirmed</p>
          </div>
        </div>
        <p className="px-1 text-sm text-rr-on-canvas-soft">
          Patients get a WhatsApp reminder 2 days and 1 day before. Tapping Confirm in WhatsApp marks them here by itself.
        </p>
      </aside>
    </div>
  );
};

const DayButton = ({
  active,
  onClick,
  top,
  bottom,
  dots = 0,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  top: string;
  bottom: string;
  dots?: number;
  ariaLabel?: string;
}) => (
  <button
    type="button"
    aria-pressed={active}
    aria-label={ariaLabel}
    onClick={onClick}
    className={cx(
      "flex min-w-20 shrink-0 flex-col items-center gap-0.5 rounded-2xl px-4 py-3 transition-colors",
      active ? "bg-rr-surface text-rr-ink" : "border border-rr-canvas-line bg-rr-glass text-rr-on-canvas hover:bg-rr-glass-strong",
    )}
  >
    <span className={cx("text-sm", active ? "text-rr-ink-soft" : "text-rr-on-canvas-soft")}>{top}</span>
    <span className="rr-tabular text-2xl font-light">{bottom}</span>
    <span className="flex h-2 gap-1" aria-hidden>
      {Array.from({ length: Math.min(dots, 4) }, (_, index) => (
        <span key={index} className="size-1.5 rounded-full bg-rr-missed" />
      ))}
    </span>
  </button>
);
