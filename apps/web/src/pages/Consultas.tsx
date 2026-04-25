import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';

export function Consultas() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Consultas</h1>
        <p className="text-sm text-muted-foreground">Acesse consultas e acompanhe os dados consolidados desta área.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Página em preparação</CardTitle>
          <CardDescription>
            O menu de Consultas já está disponível. Os conteúdos desta área podem ser adicionados a partir daqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Use esta rota como base para incluir filtros, listagens e resultados de consulta.</p>
        </CardContent>
      </Card>
    </section>
  );
}