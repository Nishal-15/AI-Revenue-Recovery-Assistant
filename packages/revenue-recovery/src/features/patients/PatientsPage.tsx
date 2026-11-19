import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  ClipboardList,
  Mail,
  MessageCirclePlus,
  Pencil,
  PhoneCall,
  Search,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Avatar } from "../../components/Avatar";
import { WhatsAppLink } from "../../components/WhatsAppLink";
import { Button, ErrorBanner, ListSkeleton, Pill, cx } from "../../components/ui";
import { useRecoveryContext } from "../../data/context";
import {
  useCompleteFollowup,
  useDeletePatient,
  usePatients,
  useSetAppointmentStatus,
  type Patient,
  type PatientAppointment,
} from "../../data/usePatients";
import type { Tone } from "../../domain/leaks";
import type { AppointmentStatus } from "../../domain/types";
import { formatDate, formatMoney, formatPhone, formatTime } from "../../lib/format";
import {
  AddPatientDialog,
  AppointmentDialog,
  CallbackDialog,
  EditPatientDialog,
  EnquiryDialog,
  FollowupDialog,
} from "./PatientForms";

type OpenDialog = "add" | "enquiry" | "callback" | "appointment" | "followup" | "edit" | null;

const STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Not confirmed", tone: "risk" },
  confirmed: { label: "Confirmed", tone: "recovered" },
  completed: { label: "Came in", tone: "neutral" },
  no_show: { label: "Didn't come", tone: "missed" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const nextAppointment = (patient: Patient): PatientAppointment | undefined => {
  const now = new Date().toISOString();
  return [...patient.appointments]
    .filter((a) => a.startsAt >= now && (a.status === "scheduled" || a.status === "confirmed"))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
};

const matches = (patient: Patient, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  return patient.fullName.toLowerCase().includes(q) || (digits.length >= 3 && (patient.phone ?? "").includes(digits));
};

export const PatientsPage = () => {
  const patients = usePatients();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);

  const list = useMemo(() => (patients.data ?? []).filter((p) => matches(p, search)), [patients.data, search]);
  const selected = patients.data?.find((p) => p.id === selectedId) ?? null;

  if (patients.isPending) return <ListSkeleton label="Loading patients" />;
  if (patients.isError) return <ErrorBanner message={patients.error.message} />;

  const close = () => setDialog(null);
  const total = patients.data.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xl font-light text-rr-on-canvas-soft">
          {total === 0 ? "Add your first patient to get started." : `${total} ${total === 1 ? "patient" : "patients"} in your clinic.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <GlassButton onClick={() => setDialog("enquiry")} icon={<MessageCirclePlus size={17} aria-hidden />}>
            New enquiry
          </GlassButton>
          <GlassButton onClick={() => setDialog("callback")} icon={<PhoneCall size={17} aria-hidden />}>
            Call back reminder
          </GlassButton>
          <button
            type="button"
            onClick={() => setDialog("add")}
            className="flex h-11 items-center gap-2 rounded-full bg-rr-cta px-5 font-semibold text-rr-on-cta transition-colors hover:bg-rr-cta-hover"
          >
            <UserPlus size={17} aria-hidden /> Add patient
          </button>
        </div>
      </div>

      {total === 0 ? (
        <FirstPatient onAdd={() => setDialog("add")} />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section aria-label="Patients" className={cx("flex min-w-0 flex-col gap-3", selected && "hidden xl:flex")}>
            <label className="flex h-11 items-center gap-2 rounded-full border border-rr-canvas-line bg-rr-glass px-4 text-rr-on-canvas focus-within:border-rr-recovered">
              <Search size={17} className="shrink-0 text-rr-on-canvas-soft" aria-hidden />
              <span className="sr-only">Find a patient</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find by name or number"
                className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-rr-on-canvas-soft"
              />
            </label>
            <ul className="flex flex-col gap-2">
              {list.map((patient) => (
                <li key={patient.id}>
                  <PatientRow patient={patient} active={patient.id === selectedId} onOpen={() => setSelectedId(patient.id)} />
                </li>
              ))}
            </ul>
            {list.length === 0 && <p className="px-2 py-8 text-center text-rr-on-canvas-soft">Nobody matches “{search}”.</p>}
          </section>

          {selected ? (
            <PatientDetail
              key={selected.id}
              patient={selected}
              onBack={() => setSelectedId(null)}
              onDeleted={() => setSelectedId(null)}
              onOpen={setDialog}
            />
          ) : (
            <div className="hidden place-items-center rounded-rr-card border border-dashed border-rr-canvas-line p-10 text-center text-rr-on-canvas-soft xl:grid">
              <div>
                <UsersRound size={28} className="mx-auto" aria-hidden />
                <p className="mt-3">Choose a patient to see their appointments and plans.</p>
              </div>
            </div>
          )}
        </div>
      )}

      <AddPatientDialog open={dialog === "add"} onClose={close} />
      <EnquiryDialog open={dialog === "enquiry"} onClose={close} />
      <CallbackDialog open={dialog === "callback"} onClose={close} patient={selected} />
      {selected && (
        <>
          <AppointmentDialog open={dialog === "appointment"} onClose={close} patient={selected} />
          <FollowupDialog open={dialog === "followup"} onClose={close} patient={selected} />
          <EditPatientDialog key={`edit-${selected.id}-${dialog}`} open={dialog === "edit"} onClose={close} patient={selected} />
        </>
      )}
    </div>
  );
};

const GlassButton = ({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex h-11 items-center gap-2 rounded-full border border-rr-canvas-line bg-rr-glass px-5 text-rr-on-canvas transition-colors hover:bg-rr-glass-strong"
  >
    {icon}
    {children}
  </button>
);

const FirstPatient = ({ onAdd }: { onAdd: () => void }) => (
  <div className="grid place-items-center rounded-rr-card border border-rr-canvas-line bg-rr-glass px-6 py-16 text-center">
    <span className="grid size-14 place-items-center rounded-2xl bg-rr-surface text-rr-primary">
      <UserPlus size={24} aria-hidden />
    </span>
    <h2 className="mt-5 text-2xl font-normal">No patients yet</h2>
    <p className="mt-2 max-w-md text-rr-on-canvas-soft">
      Add a patient with their next appointment or planned treatment. We then watch it and remind them
      for you.
    </p>
    <button type="button" onClick={onAdd} className="mt-6 h-11 rounded-full bg-rr-cta px-6 font-semibold text-rr-on-cta hover:bg-rr-cta-hover">
      Add your first patient
    </button>
  </div>
);

const PatientRow = ({ patient, active, onOpen }: { patient: Patient; active: boolean; onOpen: () => void }) => {
  const next = nextAppointment(patient);
  const openPlans = patient.followups.filter((f) => !f.done).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={cx(
        "flex w-full items-center gap-4 rounded-3xl p-3.5 text-left transition-colors",
        active ? "bg-rr-surface text-rr-ink" : "border border-rr-canvas-line bg-rr-glass hover:bg-rr-glass-strong",
      )}
    >
      <Avatar name={patient.fullName} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{patient.fullName}</span>
        <span className={cx("block truncate text-sm", active ? "text-rr-ink-soft" : "text-rr-on-canvas-soft")}>
          {next
            ? `Next visit ${formatDate(next.startsAt)}, ${formatTime(next.startsAt)}`
            : openPlans > 0
              ? `${openPlans} planned ${openPlans === 1 ? "visit" : "visits"} to book`
              : "No upcoming visit"}
        </span>
      </span>
      {next && <Pill tone={STATUS[next.status].tone}>{STATUS[next.status].label}</Pill>}
    </button>
  );
};

const PatientDetail = ({
  patient,
  onBack,
  onDeleted,
  onOpen,
}: {
  patient: Patient;
  onBack: () => void;
  onDeleted: () => void;
  onOpen: (dialog: OpenDialog) => void;
}) => {
  const { currency } = useRecoveryContext();
  const setStatus = useSetAppointmentStatus();
  const completeFollowup = useCompleteFollowup();
  const remove = useDeletePatient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const now = new Date().toISOString();
  const upcoming = patient.appointments.filter((a) => a.startsAt >= now).reverse();
  const past = patient.appointments.filter((a) => a.startsAt < now).slice(0, 5);
  const plans = patient.followups.filter((f) => !f.done);
  const error = setStatus.error ?? completeFollowup.error ?? remove.error;

  return (
    <section aria-label={patient.fullName} className="flex min-w-0 flex-col gap-5 rounded-rr-card bg-rr-surface p-5 text-rr-ink sm:p-7">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 self-start text-sm font-semibold text-rr-primary-strong xl:hidden">
        <ArrowLeft size={16} aria-hidden /> All patients
      </button>

      <header className="flex flex-wrap items-start gap-4">
        <Avatar name={patient.fullName} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-3xl font-light tracking-tight">{patient.fullName}</h2>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-rr-ink-soft">
            <span>{patient.phone ? formatPhone(patient.phone) : "No phone number"}</span>
            {patient.email && (
              <span className="flex items-center gap-1">
                <Mail size={14} aria-hidden /> {patient.email}
              </span>
            )}
          </p>
          {patient.notes && <p className="mt-2 rounded-xl bg-rr-bg px-3 py-2 text-sm">{patient.notes}</p>}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onOpen("appointment")}>
          <CalendarPlus size={15} aria-hidden /> Book appointment
        </Button>
        <Button variant="outline" onClick={() => onOpen("followup")}>
          <ClipboardList size={15} aria-hidden /> Plan next visit
        </Button>
        <Button variant="outline" onClick={() => onOpen("callback")}>
          <PhoneCall size={15} aria-hidden /> Call back
        </Button>
        <WhatsAppLink phone={patient.phone} patientName={patient.fullName} />
      </div>

      {error && <ErrorBanner message={error.message} />}

      <Block title="Upcoming appointments" empty="Nothing booked.">
        {upcoming.map((appointment) => (
          <AppointmentRow
            key={appointment.id}
            appointment={appointment}
            currency={currency}
            onStatus={(status) => setStatus.mutate({ id: appointment.id, patientId: patient.id, status })}
            busy={setStatus.isPending}
          />
        ))}
      </Block>

      <Block title="Planned next visits" empty="No treatment or check-up planned.">
        {plans.map((plan) => (
          <li key={plan.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-rr-line p-3.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{plan.procedure}</p>
              <p className="text-sm text-rr-ink-soft">
                {plan.kind === "recall" ? "Check-up" : "Next treatment"} due by {formatDate(`${plan.dueOn}T00:00:00`)}
                {plan.estimatedValue > 0 && ` · ${formatMoney(plan.estimatedValue, currency)}`}
              </p>
            </div>
            <Button variant="ghost" onClick={() => completeFollowup.mutate(plan.id)} disabled={completeFollowup.isPending}>
              <Check size={15} aria-hidden /> Done
            </Button>
          </li>
        ))}
      </Block>

      {past.length > 0 && (
        <Block title="Earlier visits" empty="">
          {past.map((appointment) => (
            <AppointmentRow key={appointment.id} appointment={appointment} currency={currency} past onStatus={(status) => setStatus.mutate({ id: appointment.id, patientId: patient.id, status })} busy={setStatus.isPending} />
          ))}
        </Block>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-rr-line pt-4">
        <Button variant="ghost" onClick={() => onOpen("edit")}>
          <Pencil size={15} aria-hidden /> Edit details
        </Button>
        {confirmDelete ? (
          <span className="flex items-center gap-2">
            <span className="text-sm text-rr-ink-soft">Delete {patient.fullName} and their history?</span>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(patient.id, { onSuccess: onDeleted })}>
              Delete
            </Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} aria-hidden /> Delete
          </Button>
        )}
      </footer>
    </section>
  );
};

const Block = ({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) => (
  <div>
    <h3 className="mb-2 text-sm font-semibold tracking-wide text-rr-ink-soft uppercase">{title}</h3>
    {children.length > 0 ? <ul className="flex flex-col gap-2">{children}</ul> : <p className="text-rr-ink-faint">{empty}</p>}
  </div>
);

const AppointmentRow = ({
  appointment,
  currency,
  past,
  onStatus,
  busy,
}: {
  appointment: PatientAppointment;
  currency: string;
  past?: boolean;
  onStatus: (status: AppointmentStatus) => void;
  busy: boolean;
}) => {
  const status = STATUS[appointment.status];
  const open = appointment.status === "scheduled" || appointment.status === "confirmed";
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-rr-line p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {formatDate(appointment.startsAt)}, {formatTime(appointment.startsAt)}
          </p>
          <p className="text-sm text-rr-ink-soft">
            {appointment.treatment ?? "Appointment"}
            {appointment.estimatedValue > 0 && ` · ${formatMoney(appointment.estimatedValue, currency)}`}
          </p>
        </div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>
      {open && (
        <div className="flex flex-wrap gap-1.5">
          {!past && appointment.status === "scheduled" && (
            <SmallAction onClick={() => onStatus("confirmed")} disabled={busy}>
              Patient confirmed
            </SmallAction>
          )}
          <SmallAction onClick={() => onStatus("completed")} disabled={busy}>
            Came in
          </SmallAction>
          {past && (
            <SmallAction onClick={() => onStatus("no_show")} disabled={busy}>
              Didn&apos;t come
            </SmallAction>
          )}
          <SmallAction onClick={() => onStatus("cancelled")} disabled={busy}>
            Cancelled
          </SmallAction>
        </div>
      )}
    </li>
  );
};

const SmallAction = ({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="h-9 rounded-full border border-rr-line-strong px-3.5 text-sm transition-colors hover:border-rr-primary hover:bg-rr-primary-soft disabled:opacity-50"
  >
    {children}
  </button>
);
