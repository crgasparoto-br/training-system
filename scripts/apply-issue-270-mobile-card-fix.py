from pathlib import Path

path = Path('apps/web/src/pages/PreRegistrationAdmin/PreRegistrationAdminList.tsx')
source = path.read_text()
old = 'className="block rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] transition hover:border-primary/40"'
new = 'className="block min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] transition hover:border-primary/40"'
if old not in source:
    raise SystemExit('Lead card class not found')
source = source.replace(old, new, 1)
source = source.replace(
    'className="mt-4 grid grid-cols-2 gap-3 text-xs"',
    'className="mt-4 grid min-w-0 grid-cols-2 gap-3 text-xs"',
    1,
)
source = source.replace(
    'className="mt-1 font-medium text-foreground">\n            {lead.responsible?.name',
    'className="mt-1 break-words font-medium text-foreground">\n            {lead.responsible?.name',
    1,
)
source = source.replace(
    'className="mt-1 font-medium text-foreground">{lead.nextAction.label}',
    'className="mt-1 break-words font-medium text-foreground">{lead.nextAction.label}',
    1,
)
path.write_text(source)
