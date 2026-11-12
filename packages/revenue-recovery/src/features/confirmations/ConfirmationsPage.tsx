import { useMemo } from "react";
import { CalendarCheck2, Check } from "lucide-react";
import { WhatsAppLink } from "../../components/WhatsAppLink";
import { Button, Card, EmptyState, ErrorBanner, ListSkeleton, Pill } from "../../components/ui";
import { useRecoveryContext } from "../../data/context";
import { CONFIRMATION_WINDOW_HOURS, useConfirmAppointment, useConfirmations } from "../../data/useConfirmations";
import type { Tone } from "../../domain/leaks";
import type { UpcomingAppointment } from "../../domain/types";
import { formatDayHeading, formatMoney, formatTime, toDateKey } from "../../lib/format";

const DUE_SOON_MS = 24 * 3_600_000;

type DayGroup = { key: string; date: Date; appointments: UpcomingAppointment[] };

const groupByDay = (appointments: UpcomingAppointment[]): DayGroup[] => {
  const groups = new Map<string, DayGroup>();
  for (const appointment of appointments) {
    const date = new Date(appointment.startsAt);
    const key = toDateKey(date);
    const group = groups.get(key) ?? { key, date, appointments: [] };
    group.appointments.push(appointment);
    groups.set(key, group);
  }
  return [...groups.values()];
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

  const appointments = useMemo(() => data ?? [], [data]);
  const groups = useMemo(() => groupByDay(appointments), [appointments]);
  const confirmedCount = appointments.filter((appointment) => appointment.status === "confirmed").length;
  const unconfirmedValue = appointments
    .filter((appointment) => appointment.status !== "confirmed")
    .reduce((sum, appointment) => sum + appointment.estimatedValue, 0);
  const share = appointments.length > 0 ? confirmedCount / appointments.length : 0;

  if (isPending) return <ListSkeleton label="Loading upcoming appointments" />;
  if (isError) return <ErrorBanner message={error.message} />;

  const now = Date.now();

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-rr-ink-soft">Next {CONFIRMATION_WINDOW_HOURS} hours</p>
            <p className="rr-tabular font-rr-display text-2xl font-bold">
              {confirmedCount} of {appointments.length} confirmed
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-rr-ink-faint">Unconfirmed value</p>
            <p className="rr-tabular text-lg font-semibold text-rr-risk-ink">{formatMoney(unconfirmedValue, currency)}</p>
          </div>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-rr-risk-soft"
          role="progressbar"
          aria-label="Appointments confirmed"
          aria-valuemin={0}
          aria-valuemax={appointments.length}
          aria-valuenow={confirmedCount}
        >
          <div className="h-full rounded-full bg-rr-recovered transition-[width] duration-300" style={{ width: `${share * 100}%` }} />
        </div>
      </Card>

      {confirm.isError && <ErrorBanner message={confirm.error.message} onDismiss={() => confirm.reset()} />}

      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarCheck2 size={22} />} title="No appointments in the next 72 hours" />
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.key}>
            <h2 className="border-b border-rr-line px-4 py-3 text-sm font-semibold sm:px-5">
              {formatDayHeading(group.date)}
              <span className="ml-2 font-normal text-rr-ink-faint">{group.appointments.length}</span>
            </h2>
            <ul className="divide-y divide-rr-line">
              {group.appointments.map((appointment) => {
                const pill = confirmationPill(appointment, now);
                return (
                  <li key={appointment.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
                    <p className="rr-tabular w-20 shrink-0 text-sm font-semibold whitespace-nowrap">{formatTime(appointment.startsAt)}</p>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm font-medium">{appointment.patientName}</p>
                      <p className="truncate text-[13px] text-rr-ink-soft">{appointment.treatment}</p>
                    </div>
                    <p className="rr-tabular text-sm font-semibold">{formatMoney(appointment.estimatedValue, currency)}</p>
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                      {appointment.status !== "confirmed" && (
                        <Button variant="outline" onClick={() => confirm.mutate(appointment.id)}>
                          <Check size={15} />
                          Mark confirmed
                        </Button>
                      )}
                      <WhatsAppLink phone={appointment.patientPhone} patientName={appointment.patientName} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
};
