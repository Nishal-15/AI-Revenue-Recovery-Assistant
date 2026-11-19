import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, ErrorBanner, cx } from "./ui";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** When given, the body is a form and the footer shows Cancel + this label. */
  submitLabel?: string;
  onSubmit?: () => void;
  busy?: boolean;
  error?: string | null;
  wide?: boolean;
};

/** A native <dialog>: focus is trapped, Escape closes it, and the page behind is inert. */
export const Dialog = ({ open, onClose, title, description, children, submitLabel, onSubmit, busy, error, wide }: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className={cx(
        "m-auto max-h-[92vh] w-[calc(100%-2rem)] overflow-hidden rounded-rr-card bg-rr-surface p-0 text-rr-ink shadow-[0_40px_90px_-20px_rgb(0_0_0/0.55)]",
        "backdrop:bg-[rgb(8_26_29/0.72)] backdrop:backdrop-blur-sm",
        wide ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {open && (
        <form onSubmit={submit} className="flex max-h-[92vh] flex-col">
          <header className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-7">
            <div>
              <h2 id={titleId} className="text-2xl font-light tracking-tight">
                {title}
              </h2>
              {description && <p className="mt-1 text-rr-ink-soft">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-10 shrink-0 place-items-center rounded-full text-rr-ink-soft hover:bg-rr-bg"
            >
              <X size={18} aria-hidden />
            </button>
          </header>
          <div className="flex flex-col gap-5 overflow-y-auto px-6 py-6 sm:px-7">{children}</div>
          {(submitLabel || error) && (
            <footer className="flex flex-col gap-3 border-t border-rr-line px-6 py-4 sm:px-7">
              {error && <ErrorBanner message={error} />}
              {submitLabel && (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : submitLabel}
                  </Button>
                </div>
              )}
            </footer>
          )}
        </form>
      )}
    </dialog>
  );
};
