import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { CheckRow, Field, INPUT, TEXTAREA, addMonths, toLocalInputValue, tomorrowAt } from "../../components/Form";
import { useRecoveryContext } from "../../data/context";
import {
  useAddAppointment,
  useAddCallback,
  useAddFollowup,
  useAddPatient,
  useLogEnquiry,
  useUpdatePatient,
  type EnquirySource,
  type NewAppointment,
  type NewFollowup,
  type Patient,
} from "../../data/usePatients";
import type { FollowupKind } from "../../domain/types";

type FormProps = { open: boolean; onClose: () => void };

const moneyLabel = (currency: string) => `Expected value (${currency})`;
const toNumber = (value: string) => Math.max(0, Number(value.replace(/[^\d.]/g, "")) || 0);

// --- reusable field groups ------------------------------------------------------------------

type AppointmentDraft = { when: string; treatment: string; value: string };
const newAppointmentDraft = (): AppointmentDraft => ({ when: toLocalInputValue(tomorrowAt(10)), treatment: "", value: "" });
const toAppointment = (draft: AppointmentDraft): NewAppointment => ({
  startsAt: new Date(draft.when),
  treatment: draft.treatment,
  estimatedValue: toNumber(draft.value),
});

const AppointmentFields = ({ draft, onChange }: { draft: AppointmentDraft; onChange: (draft: AppointmentDraft) => void }) => {
  const { currency } = useRecoveryContext();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Date and time">
        {(id) => (
          <input id={id} type="datetime-local" required value={draft.when} onChange={(e) => onChange({ ...draft, when: e.target.value })} className={INPUT} />
        )}
      </Field>
      <Field label="Treatment" optional>
        {(id) => (
          <input id={id} value={draft.treatment} placeholder="e.g. Cleaning, Root canal" onChange={(e) => onChange({ ...draft, treatment: e.target.value })} className={INPUT} />
        )}
      </Field>
      <Field label={moneyLabel(currency)} optional hint="Used to show what reminders win back." className="sm:col-span-2">
        {(id) => (
          <input id={id} inputMode="numeric" value={draft.value} placeholder="e.g. 2500" onChange={(e) => onChange({ ...draft, value: e.target.value })} className={INPUT} />
        )}
      </Field>
    </div>
  );
};

type FollowupDraft = { kind: FollowupKind; procedure: string; dueOn: string; value: string };
const newFollowupDraft = (): FollowupDraft => ({ kind: "treatment_step", procedure: "", dueOn: addMonths(1), value: "" });
const toFollowup = (draft: FollowupDraft): NewFollowup => ({
  kind: draft.kind,
  procedure: draft.procedure,
  dueOn: draft.dueOn,
  estimatedValue: toNumber(draft.value),
});

const FollowupFields = ({ draft, onChange }: { draft: FollowupDraft; onChange: (draft: FollowupDraft) => void }) => {
  const { currency } = useRecoveryContext();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="What comes next">
        {(id) => (
          <select
            id={id}
            value={draft.kind}
            onChange={(e) => {
              const kind = e.target.value as FollowupKind;
              onChange({ ...draft, kind, dueOn: addMonths(kind === "recall" ? 6 : 1) });
            }}
            className={INPUT}
          >
            <option value="treatment_step">Next step of treatment</option>
            <option value="recall">Regular check-up</option>
          </select>
        )}
      </Field>
      <Field label="Should come back by">
        {(id) => (
          <input id={id} type="date" required value={draft.dueOn} onChange={(e) => onChange({ ...draft, dueOn: e.target.value })} className={INPUT} />
        )}
      </Field>
      <Field label="Treatment">
        {(id) => (
          <input
            id={id}
            required
            value={draft.procedure}
            placeholder={draft.kind === "recall" ? "e.g. 6-month check-up" : "e.g. Crown after root canal"}
            onChange={(e) => onChange({ ...draft, procedure: e.target.value })}
            className={INPUT}
          />
        )}
      </Field>
      <Field label={moneyLabel(currency)} optional>
        {(id) => (
          <input id={id} inputMode="numeric" value={draft.value} placeholder="e.g. 8000" onChange={(e) => onChange({ ...draft, value: e.target.value })} className={INPUT} />
        )}
      </Field>
    </div>
  );
};

// --- add / edit patient ---------------------------------------------------------------------

export const AddPatientDialog = ({ open, onClose, onAdded }: FormProps & { onAdded?: () => void }) => {
  const add = useAddPatient();
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", notes: "", whatsappConsent: false });
  const [withAppointment, setWithAppointment] = useState(false);
  const [withFollowup, setWithFollowup] = useState(false);
  const [appointment, setAppointment] = useState(newAppointmentDraft);
  const [followup, setFollowup] = useState(newFollowupDraft);

  const close = () => {
    add.reset();
    onClose();
  };

  const submit = () =>
    add.mutate(
      {
        ...form,
        appointment: withAppointment ? toAppointment(appointment) : null,
        followup: withFollowup ? toFollowup(followup) : null,
      },
      {
        onSuccess: () => {
          setForm({ fullName: "", phone: "", email: "", notes: "", whatsappConsent: false });
          setWithAppointment(false);
          setWithFollowup(false);
          setAppointment(newAppointmentDraft());
          setFollowup(newFollowupDraft());
          onAdded?.();
          close();
        },
      },
    );

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title="Add a patient"
      description="Reminders start by themselves once they have an appointment or a next visit."
      submitLabel="Add patient"
      onSubmit={submit}
      busy={add.isPending}
      error={add.error?.message}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          {(id) => <input id={id} required autoFocus value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={INPUT} />}
        </Field>
        <Field label="WhatsApp number" hint="10-digit Indian numbers get +91 added.">
          {(id) => (
            <input id={id} type="tel" required value={form.phone} placeholder="+91 98765 43210" onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} />
          )}
        </Field>
        <Field label="Email" optional>
          {(id) => <input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} />}
        </Field>
        <Field label="Notes" optional>
          {(id) => <input id={id} value={form.notes} placeholder="e.g. Prefers evenings" onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT} />}
        </Field>
      </div>

      <CheckRow
        checked={form.whatsappConsent}
        onChange={(whatsappConsent) => setForm({ ...form, whatsappConsent })}
        title="The patient agreed to get WhatsApp reminders"
        detail={form.whatsappConsent ? "They can reply STOP at any time." : "Tick only if the patient said yes. Until then, no WhatsApp messages go to this number."}
      />

      <CheckRow checked={withAppointment} onChange={setWithAppointment} title="Book an appointment" detail="They'll be asked to confirm 2 days and 1 day before." />
      {withAppointment && <AppointmentFields draft={appointment} onChange={setAppointment} />}

      <CheckRow checked={withFollowup} onChange={setWithFollowup} title="Plan their next visit" detail="If it isn't booked on time, they get a gentle reminder." />
      {withFollowup && <FollowupFields draft={followup} onChange={setFollowup} />}
    </Dialog>
  );
};

export const EditPatientDialog = ({ open, onClose, patient }: FormProps & { patient: Patient }) => {
  const update = useUpdatePatient();
  const [form, setForm] = useState({
    fullName: patient.fullName,
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    notes: patient.notes ?? "",
  });
  const close = () => {
    update.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Edit patient"
      submitLabel="Save"
      onSubmit={() => update.mutate({ id: patient.id, ...form }, { onSuccess: close })}
      busy={update.isPending}
      error={update.error?.message}
    >
      <Field label="Full name">
        {(id) => <input id={id} required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={INPUT} />}
      </Field>
      <Field label="WhatsApp number">
        {(id) => <input id={id} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} />}
      </Field>
      <Field label="Email" optional>
        {(id) => <input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} />}
      </Field>
      <Field label="Notes" optional>
        {(id) => <textarea id={id} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={TEXTAREA} />}
      </Field>
    </Dialog>
  );
};

// --- per-patient additions ------------------------------------------------------------------

export const AppointmentDialog = ({ open, onClose, patient }: FormProps & { patient: Patient }) => {
  const add = useAddAppointment();
  const [draft, setDraft] = useState(newAppointmentDraft);
  const close = () => {
    add.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Book ${patient.fullName.split(" ")[0]}`}
      description="They'll be asked to confirm on WhatsApp before the day."
      submitLabel="Book appointment"
      onSubmit={() =>
        add.mutate(
          { patientId: patient.id, appointment: toAppointment(draft) },
          {
            onSuccess: () => {
              setDraft(newAppointmentDraft());
              close();
            },
          },
        )
      }
      busy={add.isPending}
      error={add.error?.message}
    >
      <AppointmentFields draft={draft} onChange={setDraft} />
    </Dialog>
  );
};

export const FollowupDialog = ({ open, onClose, patient }: FormProps & { patient: Patient }) => {
  const add = useAddFollowup();
  const [draft, setDraft] = useState(newFollowupDraft);
  const close = () => {
    add.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Plan the next visit"
      description="If it isn't booked by this date, a reminder goes out."
      submitLabel="Save plan"
      onSubmit={() =>
        add.mutate(
          { patientId: patient.id, followup: toFollowup(draft) },
          {
            onSuccess: () => {
              setDraft(newFollowupDraft());
              close();
            },
          },
        )
      }
      busy={add.isPending}
      error={add.error?.message}
    >
      <FollowupFields draft={draft} onChange={setDraft} />
    </Dialog>
  );
};

export const CallbackDialog = ({ open, onClose, patient }: FormProps & { patient: Patient | null }) => {
  const add = useAddCallback();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(() => toLocalInputValue(tomorrowAt(11)));
  const close = () => {
    add.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={patient ? `Call ${patient.fullName.split(" ")[0]} back` : "Call back reminder"}
      description="It appears on Today when it's time, so nobody forgets."
      submitLabel="Save reminder"
      onSubmit={() =>
        add.mutate(
          { patientId: patient?.id ?? null, title: title || "Call back", dueAt: new Date(when) },
          {
            onSuccess: () => {
              setTitle("");
              close();
            },
          },
        )
      }
      busy={add.isPending}
      error={add.error?.message}
    >
      <Field label="What about">
        {(id) => <input id={id} required value={title} placeholder="e.g. Send the implant quote" onChange={(e) => setTitle(e.target.value)} className={INPUT} />}
      </Field>
      <Field label="Call by">
        {(id) => <input id={id} type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className={INPUT} />}
      </Field>
    </Dialog>
  );
};

const SOURCES: { value: EnquirySource; label: string }[] = [
  { value: "phone", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "walk_in", label: "Walked in" },
  { value: "web_form", label: "Website" },
  { value: "other", label: "Other" },
];

export const EnquiryDialog = ({ open, onClose }: FormProps) => {
  const log = useLogEnquiry();
  const [form, setForm] = useState({ contactName: "", contactPhone: "", source: "phone" as EnquirySource, message: "" });
  const close = () => {
    log.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Note a new enquiry"
      description="Someone asked about treatment but hasn't booked. They'll get a friendly follow-up."
      submitLabel="Save enquiry"
      onSubmit={() =>
        log.mutate(form, {
          onSuccess: () => {
            setForm({ contactName: "", contactPhone: "", source: "phone", message: "" });
            close();
          },
        })
      }
      busy={log.isPending}
      error={log.error?.message}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" optional>
          {(id) => <input id={id} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={INPUT} />}
        </Field>
        <Field label="Phone number">
          {(id) => (
            <input id={id} type="tel" required value={form.contactPhone} placeholder="+91 98765 43210" onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className={INPUT} />
          )}
        </Field>
      </div>
      <Field label="How they got in touch">
        {(id) => (
          <select id={id} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as EnquirySource })} className={INPUT}>
            {SOURCES.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="What they asked" optional>
        {(id) => (
          <textarea id={id} value={form.message} placeholder="e.g. Asked about aligners and EMI" onChange={(e) => setForm({ ...form, message: e.target.value })} className={TEXTAREA} />
        )}
      </Field>
    </Dialog>
  );
};
