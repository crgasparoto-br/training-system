import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function CollaboratorSection({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-lg font-semibold text-foreground">{title}</span>
          {description ? <span className="mt-1 block text-sm font-normal text-muted-foreground">{description}</span> : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border px-5 pb-5 pt-5">{children}</div>
    </details>
  );
}

export function ReadonlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm text-foreground">{value?.trim() || 'Não informado'}</p>
    </div>
  );
}
