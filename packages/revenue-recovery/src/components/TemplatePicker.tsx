import { useId } from "react";
import type { MessageTemplate } from "../domain/outreach";
import { previewTemplate } from "../domain/outreach";

type TemplatePickerProps = {
  templates: MessageTemplate[];
  value: string;
  onChange: (templateId: string) => void;
  /** Values known in the browser (e.g. first name); the engine fills the rest when it sends. */
  previewValues?: Record<string, string>;
};

export const TemplatePicker = ({ templates, value, onChange, previewValues }: TemplatePickerProps) => {
  const selectId = useId();
  const selected = templates.find((template) => template.id === value);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="text-xs font-medium text-rr-ink-soft">
        WhatsApp template
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-rr-line-strong bg-rr-surface px-2.5 text-[13px] outline-none focus:border-rr-primary"
      >
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
      {selected && (
        <div className="rounded-xl border border-rr-line bg-rr-bg px-3 py-2.5">
          <p className="text-[13px] whitespace-pre-line text-rr-ink">{previewTemplate(selected, previewValues)}</p>
          {selected.buttons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.buttons.map((label) => (
                <span
                  key={label}
                  className="rounded-md border border-rr-line-strong bg-rr-surface px-2 py-0.5 text-xs font-medium text-rr-primary-strong"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
