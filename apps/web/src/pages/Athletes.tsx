import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { athleteService, type Athlete } from '../services/athlete.service';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Plus, Search, Edit, Trash2, Eye, User } from 'lucide-react';

export function Athletes() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadAthletes();
  }, [page]);

  const loadAthletes = async () => {
    setLoading(true);
    try {
      const data = await athleteService.list(page, 10);
      setAthletes(data.athletes);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Erro ao carregar atletas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.length < 2) {
      loadAthletes();
      return;
    }

    setLoading(true);
    try {
      const data = await athleteService.search(searchQuery);
      setAthletes(data);
    } catch (error) {
      console.error('Erro ao buscar atletas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar este atleta?')) {
      return;
    }

    try {
      await athleteService.delete(id);
      loadAthletes();
    } catch (error) {
      console.error('Erro ao deletar atleta:', error);
      alert('Erro ao deletar atleta');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Atletas</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie seus atletas e acompanhe seu progresso
          </p>
        </div>
        <Link to="/athletes/new">
          <Button>
            <Plus size={20} />
            Novo Atleta
          </Button>
        </Link>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Buscar atleta por nome..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch}>
              <Search size={20} />
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Athletes List */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-muted-foreground">Carregando atletas...</p>
          </CardContent>
        </Card>
      ) : athletes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Nenhum atleta encontrado</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'Tente buscar com outros termos' : 'Comece adicionando seu primeiro atleta'}
            </p>
            {!searchQuery && (
              <Link to="/athletes/new">
                <Button>
                  <Plus size={20} />
                  Adicionar Atleta
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {athletes.map((athlete) => {
            const bmi = athleteService.calculateBMI(athlete.weight, athlete.height);
            const bmiClass = athleteService.getBMIClassification(bmi);

            return (
              <Card key={athlete.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{athlete.user.profile.name}</CardTitle>
                        <CardDescription>{athlete.age} anos</CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Peso:</span>
                      <p className="font-medium">{athlete.weight} kg</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Altura:</span>
                      <p className="font-medium">{athlete.height} cm</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">IMC:</span>
                      <p className="font-medium">{bmi.toFixed(1)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">VO2 Max:</span>
                      <p className="font-medium">{athlete.vo2Max}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t flex gap-2">
                    <Link to={`/athletes/${athlete.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Eye size={16} />
                        Ver
                      </Button>
                    </Link>
                    <Link to={`/athletes/${athlete.id}/edit`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Edit size={16} />
                        Editar
                      </Button>
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(athlete.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
              >
                Próxima
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
