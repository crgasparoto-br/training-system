# 📘 Documentação de Desenvolvimento – Sistema Acesso

Este documento descreve como o **Sistema Acesso** será desenvolvido e integrado ao projeto `training-system`. A Acesso é uma empresa de consultoria em saúde e performance humana. Para oferecer um serviço completo, o sistema deve gerenciar cadastros, treinos, avaliações, agendamentos, nutrição, finanças e integração com aplicativos de mercado.

## 🎯 Objetivo Geral

Construir uma solução SaaS que centralize a **gestão de negócio** para academias e estúdios de treinamento. O Sistema Acesso deverá substituir o sistema legado, reunindo em um único ambiente:

- **Cadastro e acompanhamento de alunos** – dados pessoais, histórico de saúde, planos contratados e resultados de avaliações.
- **Prescrição e execução de treinos** – fichas individualizadas, biblioteca de exercícios e acompanhamento de progresso.
- **Agendamento e controle de recursos** – disponibilidade de salas, equipamentos e agenda de professores.
- **Acompanhamento nutricional** – metas de ingestão alimentar e sincronização com a solução `controle_calorias`.
- **Gestão financeira** – controle de planos, cobranças, fluxo de caixa e indicadores de negócio.
- **App de treino e integrações** – aplicativo mobile para registrar treinos e integração com Strava, Garmin e outros.

## 🧱 Módulos Principais

### 1. Cadastro e Avaliação de Alunos

Este módulo gerencia as informações de alunos e colaboradores.

- **Dados Básicos:** nome, CPF, e-mail, telefone, endereço, data de nascimento e meios de pagamento.
- **Informações de Saúde:** histórico médico, lesões, alergias, medicamentos, atestados e datas de validade.
- **Avaliações Físicas:** suportar diferentes tipos de avaliação: anamnese, antropometria, neuromotora, cardiorrespiratória, postural e nutricional. Os modelos de avaliação e campos extras serão definidos pelo professor Leandro.
- **Controle de Planos:** planos contratados, vigência, histórico de pagamentos e status: ativo, em atraso, expirado.

**Novos endpoints e entidades** devem ser adicionados em `apps/api/src/modules` para cadastrar, atualizar e consultar alunos, avaliações e colaboradores. Na camada web (`apps/web/src/pages`), serão criadas telas para cadastro e edição, com validação de formulários e exibição de histórico de avaliações.

### 2. Prescrição de Treinos

Permite que professores criem fichas de treino personalizadas para cada aluno com base nos resultados das avaliações.

- **Biblioteca de Exercícios:** catálogo com descrição, categoria, grupos musculares, vídeos de demonstração e equipamentos necessários.
- **Fichas e Programas:** criação e edição de planos semanais/mensais, ajustando séries, repetições, cargas, intervalos e periodicidade conforme objetivos: hipertrofia, resistência, corrida, entre outros.
- **Histórico de Execução:** registro dos treinos realizados, permitindo comparar o previsto versus executado e ajustar estímulos conforme a evolução.
- **Modelos e Recomendações:** oferecer modelos pré-definidos para diferentes perfis e níveis de alunos, com possibilidade de personalização.

Implementar APIs REST para criar, atualizar e listar treinos. Na camada mobile (`apps/mobile/src`), o app de execução consumirá esses endpoints para exibir a ficha diária e registrar a conclusão de cada sessão.

### 3. Agendamento e Gestão de Recursos

Este módulo controla a disponibilidade de salas, estúdios, equipamentos e a agenda dos professores.

- **Integração com agenda_profissional:** utilizar a API da solução de agendamento para criar, editar e cancelar reservas. Suportar reservas online, lista de espera, personalização de horários e sincronização com agendas pessoais.
- **Painel de Agenda:** dashboard para gestores visualizarem reservas, escalarem instrutores e evitarem conflitos de horário. Incluir filtros por sala, professor, data e status.
- **Preferências dos Instrutores:** permitir que cada professor indique horários preferenciais, folgas e limites de carga de trabalho.
- **Controle de Lotação:** definir limites de ocupação de salas e impedir reservas além da capacidade.

O back-end deve expor rotas para gerenciar recursos e reservas, enquanto o front-end web e mobile deve oferecer telas intuitivas de calendário. Reutilize componentes de calendário já existentes quando possível.

### 4. Acompanhamento Nutricional

Integrado ao módulo `controle_calorias`, este componente permite registrar a ingestão alimentar e acompanhar metas nutricionais definidas por nutricionistas.

- **Definição de Metas:** o profissional de nutrição define metas diárias de calorias e macronutrientes: proteínas, carboidratos e gorduras por aluno.
- **Registro de Alimentos:** via integração com `controle_calorias`, os alunos registram refeições e lanches. O Sistema Acesso sincroniza esses registros para exibir relatórios e comparar com metas.
- **Relatórios Nutricionais:** gráficos e tabelas mostrando consumo diário, semanal e mensal, percentual de cumprimento das metas e alertas de desequilíbrios nutricionais.
- **Integração com Planos de Treino:** possibilitar correlação entre carga de treino e ingestão calórica, recomendando ajustes quando necessário.

Será necessário configurar credenciais e endpoints de `controle_calorias` no arquivo `.env`. Criar serviços em `apps/api` para orquestrar as chamadas e armazenar dados relevantes no banco.

### 5. Gestão Financeira

Um módulo completo de finanças para garantir a sustentabilidade do negócio.

- **Planos e Cobranças:** cadastro de planos de assinatura, sessões avulsas e pacotes, com regras de cobrança recorrente ou única. Integrar com provedores de pagamento: cartão, boleto e PIX para emissão e conciliação de recebíveis.
- **Fluxo de Caixa:** registrar entradas e saídas, classificando transações por categoria: salários, equipamentos, tributos, serviços, entre outros. Permitir filtro por período e centro de custo.
- **Indicadores de Desempenho:** dashboards exibindo faturamento, ticket médio, inadimplência, custo por aluno e ROI. Gerar relatórios em PDF ou CSV.
- **Previsão e Reserva:** projetar receita futura com base no histórico e sugerir reservas de emergência para períodos de sazonalidade.

Incluir novas migrations Prisma para as tabelas financeiras e serviços na API que façam integrações com gateways de pagamento.

### 6. Relatórios e BI

Agregar dados de treinos, avaliações, nutrição, agenda e finanças em um painel de BI.

- **Relatórios Personalizados:** gerar relatórios por aluno, professor, período ou módulo: treino, nutrição e finanças.
- **Exportação:** permitir exportar dados em CSV/Excel para análises externas.
- **Dashboards:** utilizar bibliotecas de gráficos para exibir métricas de forma visual e interativa.

As rotas de relatórios devem ser protegidas conforme o nível de acesso do usuário: administrador, instrutor, nutricionista ou aluno.

### 7. Aplicativo de Execução e Integrações com Apps de Mercado

Desenvolver um aplicativo mobile voltado para a execução de exercícios e integração com apps de mercado.

- **Registro de Atividades:** o app Acesso permitirá iniciar e concluir treinos, capturando dados como distância, tempo, ritmo, velocidade média, elevação e frequência cardíaca. Suportará GPS em tempo real e sensores externos: cintas e relógios.
- **Integração com Strava e Garmin:** implementar OAuth e webhooks para sincronizar atividades automaticamente. Quando o aluno iniciar um treino em seu relógio Garmin ou importar um treino do Strava, o Sistema Acesso receberá a atividade e atualizará o histórico. Isso assegura que o aluno tenha um histórico completo nas duas plataformas e possa aproveitar recursos sociais enquanto mantém as análises avançadas de métricas.
- **Suporte a Outros Wearables:** estender integrações para Polar, Suunto, Apple Health e Google Fit quando possível.
- **Feedback em Tempo Real:** alertas de ritmo alvo, zonas de frequência cardíaca e recomendações durante o treino.

O módulo mobile deve residir em `apps/mobile`. A integração com APIs externas requer cadastro de apps nos provedores: Strava, Garmin e demais plataformas, além de armazenamento seguro de tokens.

## 👥 Perfis de Usuários

O sistema atenderá diferentes papéis, cada um com permissões específicas:

| Perfil | Responsabilidades |
|-------|------------------|
| **Administrador** | Gerencia cadastros, planos, finanças, recursos e relatórios. Define regras de negócio e configura integrações. |
| **Instrutor/Professor** | Acompanha alunos, prescreve treinos, registra avaliações, gerencia sua agenda. |
| **Nutricionista/Consultor** | Define metas nutricionais, acompanha diário alimentar e emite recomendações. |
| **Aluno** | Acessa planos de treino, agendas disponíveis, registra ingestão alimentar e executa treinos via app. |
| **Colaborador Administrativo** | Responsável por atendimento, cobrança, retenção de clientes e controle de estoque. |

Controle de acessos deve ser implementado via JWT e middleware de autorização no backend.

## 🔗 Integrações e Arquitetura

O **Sistema Acesso** será desenvolvido dentro do monorepo `training-system`, respeitando a estrutura existente. Novos módulos devem seguir os padrões de organização de código, separando responsabilidades em `modules`, `services` e `controllers`. A arquitetura de referência é:

```text
training_system/
├── apps/
│   ├── api/          # Backend Node.js + Express + Prisma
│   ├── web/          # Frontend React: Educador, Administrador, Nutricionista
│   └── mobile/       # Frontend React Native: Aluno
└── packages/
    ├── types/        # Tipos compartilhados: Student, Evaluation, Workout
    └── utils/        # Utilitários e hooks
```

**Integrações:**

- **agenda_profissional:** agendamento de professores e salas via API interna. Adicionar a biblioteca de cliente em `packages/utils` se necessário.
- **controle_calorias:** sincronização de ingestão alimentar e metas nutricionais.
- **Strava/Garmin API:** sincronizar atividades, utilizando OAuth 2.0 e webhooks. Armazenar tokens com segurança: variáveis de ambiente e secret storage.

## 🗂️ Lista de Features Inicial

Para facilitar o planejamento incremental, abaixo está uma lista inicial de features a serem implementadas. Cada item deve se tornar uma task ou user story no backlog:

1. **Cadastros:** criar módulos de Aluno, Professor, Nutricionista e Administrativo: CRUD completo no backend e no frontend.
2. **Avaliações:** definir modelos de avaliação física: anamnese, antropometria etc. e construir formulários dinâmicos para registro e consulta.
3. **Biblioteca de Exercícios:** importar exercícios existentes, com filtros por grupo muscular, categorias e vídeos de demonstração.
4. **Fichas de Treino:** criar entidades para planos e fichas, permitir clonagem de modelos e personalização por aluno.
5. **Agendamento:** integrar agenda_profissional, criar telas de calendário e lógica de reserva e lista de espera.
6. **Nutrição:** sincronizar metas e registros com controle_calorias, criar relatórios e alertas.
7. **Financeiro:** implementar cadastros de planos, integração com gateway de pagamento e dashboards financeiros.
8. **App Mobile:** desenvolver interface de treino, registro de métricas em tempo real, notificações e integração com wearables.
9. **Integrações Strava/Garmin:** implementar fluxos OAuth, importar atividades e manter histórico sincronizado.
10. **Relatórios e BI:** criar dashboards e exportação de dados para gestores e professores.

## 🧭 Práticas de Harness Engineering para este projeto

Para que o Codex e outros agentes consigam trabalhar com segurança e continuidade, o repositório deve ser a fonte única de verdade. As práticas abaixo devem guiar a evolução do `training-system`:

1. **Instruções versionadas:** manter documentos operacionais no repositório, incluindo `README.md`, `docs/`, `feature_list.json` e, quando aplicável, `AGENTS.md`.
2. **Estado persistente:** atualizar `feature_list.json` sempre que uma feature mudar de status: `not-started`, `in-progress`, `blocked` ou `done`.
3. **Escopo controlado:** trabalhar em uma feature por vez, evitando misturar financeiro, agenda, nutrição e mobile no mesmo PR.
4. **Critérios de aceite:** cada feature deve ter definição de pronto, endpoints esperados, telas afetadas e testes mínimos.
5. **Verificação:** antes de considerar uma entrega pronta, rodar o pipeline completo do projeto, preferencialmente `pnpm validate`.
6. **Observabilidade:** registrar decisões relevantes, pendências e próximos passos em documentação ou issues.
7. **Estado limpo:** cada sessão de trabalho deve terminar com commit ou PR revisável, sem arquivos temporários não rastreados.

## ✅ Checklist de Validação por Feature

Antes de concluir qualquer feature do Sistema Acesso, validar:

- [ ] Tipos compartilhados atualizados em `packages/types`, quando necessário.
- [ ] Migration Prisma criada e testada, quando houver alteração de banco.
- [ ] Endpoints documentados e protegidos por autenticação/autorização.
- [ ] Telas web/mobile criadas ou ajustadas.
- [ ] Testes unitários e/ou integração adicionados.
- [ ] Fluxos principais validados manualmente.
- [ ] `pnpm validate` executado sem erros.
- [ ] `feature_list.json` atualizado.

## ✅ Conclusão

Esta documentação de desenvolvimento consolida a visão, requisitos e módulos necessários para implementar o **Sistema Acesso** dentro do `training-system`. Ao seguir esta especificação e as práticas de Harness Engineering: instruções claras, escopo controlado, verificação contínua e persistência de estado, a equipe poderá construir uma solução robusta que centraliza gestão de alunos, treinos, nutrição, agendamento, finanças e integrações externas. Mantenha este documento atualizado conforme decisões são tomadas e funcionalidades evoluem.
