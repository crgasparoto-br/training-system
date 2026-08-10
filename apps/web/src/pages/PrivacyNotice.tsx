import { ShieldAlert } from 'lucide-react';

export function PrivacyNotice() {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 sm:px-6 sm:py-8">
      <main className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <div
          className="mb-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground"
          role="alert"
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            Texto provisório. O conteúdo definitivo deste aviso de privacidade deve ser
            revisado e substituído pela equipe jurídica antes de uso em produção.
          </span>
        </div>

        <p className="text-sm font-medium text-blue-700">Versão 2026-07</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">Aviso de privacidade</h1>

        <div className="mt-6 space-y-4 text-sm leading-6 text-slate-700">
          <p>
            Este aviso descreve, em linhas gerais, como os dados pessoais informados no
            pré-cadastro e ao longo do relacionamento com a academia são tratados: quais
            dados são coletados, para quais finalidades, por quanto tempo são mantidos e
            quais direitos a pessoa titular pode exercer.
          </p>
          <p>
            [Substituir por: base legal do tratamento, finalidades específicas, hipóteses de
            compartilhamento com terceiros, prazo de retenção, medidas de segurança e canal
            de contato do encarregado de dados (DPO).]
          </p>
        </div>
      </main>
    </div>
  );
}
