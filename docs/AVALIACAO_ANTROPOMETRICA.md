# Avaliação Antropométrica

A Avaliação Antropométrica fica em Avaliação Física > Antropometria e mantém histórico persistente por aluno.

- Cada avaliação recebe código sequencial gerado no backend no formato `ANTR-001`, `ANTR-002`, `ANTR-003`.
- O código pertence à avaliação, não ao segmento.
- Uma nova avaliação copia medidas da avaliação anterior conforme a configuração do segmento e preserva integralmente o histórico antigo.
- Segmentos principais, opcionais e personalizados são cadastrados em `AnthropometrySegment`.
- A tela compara avaliações lado a lado, mantendo a avaliação mais recente editável e as anteriores em leitura.
- A ajuda técnica por segmento usa descrição, imagem por sexo do aluno, vídeo tutorial e dica de fórmula/regra auxiliar.

Modelos principais:

- `AnthropometryAssessment`
- `AnthropometryAssessmentValue`
- `AnthropometryObservation`
- `AnthropometrySegment`

Rotas principais:

- `GET /api/v1/anthropometry/segments`
- `POST /api/v1/anthropometry/segments`
- `PUT /api/v1/anthropometry/segments/:id`
- `GET /api/v1/anthropometry/alunos/:alunoId/assessments`
- `POST /api/v1/anthropometry/alunos/:alunoId/assessments`
- `PUT /api/v1/anthropometry/assessments/:id`
- `PUT /api/v1/anthropometry/assessments/:id/values`
- `PUT /api/v1/anthropometry/assessments/:id/observations`
- `GET /api/v1/anthropometry/alunos/:alunoId/compare`
