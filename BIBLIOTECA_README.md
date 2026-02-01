# 📚 Sistema de Biblioteca e Montagem de Treinos

## ✅ O Que Foi Implementado

### Fase 1: Banco de Dados ✅
- ✅ 6 novas tabelas criadas
- ✅ 3 novos enums (LoadType, MovementType, CountingType)
- ✅ Relacionamentos configurados
- ✅ Índices otimizados

### Fase 2: Services (Backend) ✅
- ✅ Library Service - CRUD completo de exercícios
- ✅ Workout Service - Montagem e execução de treinos
- ✅ Atualização automática de progresso do aluno

---

## 📊 Estrutura das Tabelas

### 1. ExerciseLibrary
Catálogo global de exercícios disponíveis.

**Campos:**
- `name` - Nome do exercício
- `videoUrl` - Link do YouTube
- `loadType` - H, C, E, A, P, O
- `movementType` - U, I, O
- `countingType` - I, T, R
- `category` - MOBILIDADE, RESISTIDO, CICLICO
- `muscleGroup` - Abdominal, Quadríceps, etc
- `notes` - Observações

### 2. StudentExerciseProgress
Histórico de cargas do aluno por exercício.

**Campos:**
- `athleteId` - ID do aluno
- `exerciseId` - ID do exercício
- `lastLoad` - Última carga usada
- `maxLoad` - Carga máxima já levantada
- `lastUpdated` - Data da última atualização

### 3. WorkoutTemplate
Planejamento semanal de treinos.

**Campos:**
- `planId` - ID do plano
- `mesocycleNumber` - Número do mesociclo
- `weekNumber` - Número da semana (1-4)
- `weekStartDate` - Data de início da semana
- Dados do Cíclico (frequency, volume, etc)
- Dados do Resistido (loadPercentage, repZone, etc)
- Observações e metas

### 4. WorkoutDay
Treino específico de um dia da semana.

**Campos:**
- `templateId` - ID do template
- `dayOfWeek` - 1=Segunda, 7=Domingo
- `workoutDate` - Data do treino
- `sessionDurationMin` - Duração total
- `location` - Esteira, Pista, etc
- `method` - IEXT, IINT
- Intensidades e parâmetros
- PSR (Percepção Subjetiva de Recuperação)

### 5. WorkoutExercise
Exercício específico dentro de um treino.

**Campos:**
- `workoutDayId` - ID do dia
- `exerciseId` - ID do exercício da biblioteca
- `section` - MOBILIDADE, AQUECIMENTO, ATIVACAO, TECNICO, SESSAO
- `exerciseOrder` - Ordem dentro da seção
- `system` - BI-SET, TRI-SET, CIRCUITO
- `sets`, `reps`, `intervalSec`
- `load` - Carga sugerida

### 6. WorkoutExecution
Registro da execução real pelo aluno.

**Campos:**
- `workoutExerciseId` - ID do exercício planejado
- `athleteId` - ID do aluno
- `executionDate` - Data da execução
- `setsCompleted`, `repsCompleted`, `loadUsed`
- `difficultyRating` - 1-10
- `repsInReserve` - Repetições em reserva
- `notes` - Observações

---

## 🚀 Como Testar

### 1. Atualizar Código
```powershell
cd C:\Users\PC01\OneDrive\Projetos\corrida-training-system
git pull origin main
```

### 2. Aplicar Migration
```powershell
cd apps\api
pnpm prisma migrate dev
```

Isso vai criar as 6 tabelas no seu banco de dados.

### 3. Gerar Prisma Client
```powershell
pnpm prisma generate
```

### 4. Testar Services (Opcional)

Você pode criar um arquivo de teste para verificar os services:

```typescript
// apps/api/src/test-library.ts
import { libraryService } from './modules/library/library.service';

async function test() {
  // Criar exercício
  const exercise = await libraryService.createExercise({
    name: 'Agachamento',
    videoUrl: 'https://youtube.com/watch?v=...',
    loadType: 'H',
    movementType: 'O',
    countingType: 'R',
    category: 'RESISTIDO',
    muscleGroup: 'Quadríceps',
  });

  console.log('Exercício criado:', exercise);

  // Listar exercícios
  const exercises = await libraryService.listExercises({
    search: 'Agachamento',
  });

  console.log('Exercícios encontrados:', exercises);
}

test();
```

Executar:
```powershell
npx tsx src/test-library.ts
```

---

## 📋 Próximos Passos

### Fase 3: Tela de Biblioteca (Pendente)
- [ ] Criar componente React de lista
- [ ] Criar formulário de cadastro/edição
- [ ] Criar modal de detalhes
- [ ] Integrar com API
- [ ] **Script de importação da planilha**

### Fase 4: Tela de Montagem (Pendente)
- [ ] Integrar com Periodização
- [ ] Interface de montagem semanal
- [ ] Seleção de exercícios da biblioteca
- [ ] Configuração de parâmetros

### Fase 5: Visualização de Semanas (Pendente)
- [ ] Layout dias lado a lado
- [ ] Filtros de mesociclo/semana
- [ ] Edição rápida de cargas
- [ ] Registro de execução

---

## 🎯 Funcionalidades Implementadas

### ✅ Library Service
- Criar, listar, atualizar e deletar exercícios
- Filtros por busca, categoria, tipo
- Gerenciar progresso do aluno por exercício

### ✅ Workout Service
- Criar templates semanais
- Criar dias de treino
- Adicionar/remover/reordenar exercícios
- Registrar execuções
- **Atualização automática de progresso** quando aluno executa

### ✅ Integrações
- Relacionamento com TrainingPlan
- Relacionamento com Athlete
- Relacionamento com ExerciseLibrary

---

## 📝 Notas Importantes

1. **Progresso Automático**: Quando um aluno registra uma execução com carga, o sistema atualiza automaticamente `lastLoad` e `maxLoad` na tabela `StudentExerciseProgress`.

2. **Soft Delete**: Não implementado ainda. Se deletar um exercício da biblioteca, ele será removido permanentemente (CASCADE).

3. **Validações**: As validações de negócio devem ser implementadas nas rotas da API (controllers).

4. **Autenticação**: Os services não verificam permissões. Isso deve ser feito nas rotas.

---

## 🐛 Possíveis Problemas

### Erro: "Environment variable not found: DATABASE_URL"
**Solução:** Certifique-se de que o arquivo `.env` existe em `apps/api/` com:
```
DATABASE_URL="postgresql://user:password@localhost:5432/corrida_db"
```

### Erro: "Prisma Client not found"
**Solução:** Execute `pnpm prisma generate` novamente.

### Erro: "Table already exists"
**Solução:** Se já executou a migration antes, pode ignorar. Ou execute `pnpm prisma migrate reset` para resetar o banco (⚠️ CUIDADO: apaga todos os dados).

---

## 📞 Suporte

Se encontrar algum problema:
1. Verifique os logs do Prisma
2. Confirme que o banco está rodando
3. Teste os services isoladamente
4. Me avise para ajustar! 🚀
