from pathlib import Path
import re

layout = Path('apps/web/src/layouts/DashboardLayout.tsx')
layout_text = layout.read_text().replace(
    "<main className={cn('flex-1 py-6 transition-all duration-200'",
    "<main className={cn('min-w-0 flex-1 py-6 transition-all duration-200'",
)
layout.write_text(layout_text)

page = Path('apps/web/src/pages/PreRegistrationAdmin/PreRegistrationAdminList.tsx')
text = page.read_text()
table = '''              <div className="hidden w-full min-w-0 max-w-full overflow-x-auto md:block">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-[23%] px-3 py-3">Pessoa</th>
                      <th className="w-[15%] px-3 py-3">Etapa e convite</th>
                      <th className="w-[14%] px-3 py-3">Progresso</th>
                      <th className="w-[14%] px-3 py-3">Responsável</th>
                      <th className="w-[13%] px-3 py-3">Última atividade</th>
                      <th className="w-[17%] px-3 py-3">Próxima ação</th>
                      <th className="w-[4%] px-2 py-3">
                        <span className="sr-only">Abrir</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.items.map((lead) => (
                      <tr key={lead.id} className="hover:bg-muted/40">
                        <td className="min-w-0 px-3 py-3 align-top">
                          <Link
                            className="block truncate font-medium text-foreground hover:text-primary"
                            to={`/pre-matriculas/${lead.id}`}
                          >
                            {lead.name}
                          </Link>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {contactLine(lead)}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">
                            Origem: {lead.origin}
                          </p>
                          {lead.contacts.masked && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Contato protegido por permissão
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className={statusClass(lead.status)}>
                            {STATUS_LABELS[lead.status]}
                          </span>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Convite: {inviteLabel(lead)}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <ProgressSummary lead={lead} />
                        </td>
                        <td className="px-3 py-3 align-top text-muted-foreground">
                          <span className="line-clamp-3">
                            {lead.responsible?.name || 'Não definido'}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top text-muted-foreground">
                          {formatDate(lead.lastActivityAt)}
                        </td>
                        <td className="min-w-0 px-3 py-3 align-top">
                          <span className="block font-medium text-foreground">
                            {lead.nextAction.label}
                          </span>
                          <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
                            {lead.nextAction.description}
                          </p>
                          {lead.progress.parqRequiresProfessionalReview && (
                            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-warning">
                              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                              Atenção profissional
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-3 align-top">
                          <Link
                            aria-label={`Abrir ${lead.name}`}
                            to={`/pre-matriculas/${lead.id}`}
                          >
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
'''
text, replacements = re.subn(
    r'              <div className="hidden w-full min-w-0 max-w-full overflow-x-auto md:block">.*?              </div>\n',
    table,
    text,
    count=1,
    flags=re.S,
)
if replacements != 1:
    raise SystemExit(f'Expected one table replacement, got {replacements}')
page.write_text(text)
