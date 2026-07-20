# Módulo de contratos

O módulo administra modelos, documentos eletrônicos, assinatura pública, auditoria e vigência para duas partes contratadas:

- `STUDENT`: aluno;
- `COLLABORATOR`: colaborador.

A parte é explícita no documento e no vínculo de vigência. Aluno e colaborador permanecem entidades distintas; a infraestrutura de contrato é compartilhada.

## Fluxo básico

1. Acesse `Configurações > Contratos`.
2. Crie ou edite um modelo e defina a aplicabilidade: **Aluno**, **Colaborador** ou **Aluno e colaborador**.
3. Use a prévia preenchida para validar conteúdo e variáveis sem criar documento.
4. Na edição individual do aluno ou do colaborador, gere um contrato candidato.
5. Gere o PDF e prepare o link público de assinatura.
6. Compartilhe manualmente `/assinatura/contrato/:token` com a parte contratada.
7. A assinatura eletrônica decide quando o candidato pode entrar em vigor.

## Aplicabilidade dos modelos

Cada `ContractTemplate` possui `applicability`:

| Valor | Uso permitido |
| --- | --- |
| `STUDENT` | somente contratos de aluno |
| `COLLABORATOR` | somente contratos de colaborador |
| `BOTH` | contratos de ambos os tipos |

Modelos existentes recebem `STUDENT` na migração para manter o comportamento anterior.

A compatibilidade é validada ao:

- criar ou editar modelo;
- adicionar ou editar cláusula;
- ativar modelo;
- gerar prévia;
- gerar documento real.

Um modelo `BOTH` aceita somente variáveis comuns, como `empresa.*` e `contrato.*`. Variáveis `aluno.*`, `responsavel.*`, `professor.*`, `servico.*` e `colaborador.*` são específicas e não podem ser usadas em modelo compartilhado.

A tela de configuração permite filtrar modelos pela aplicabilidade. A lista de variáveis acompanha a seleção e a prévia de um modelo `BOTH` pode ser executada com aluno ou colaborador.

## Partes, documentos e vínculos

`GeneratedContract` armazena o documento eletrônico compartilhado e identifica exatamente uma parte:

- `partyType = STUDENT` e `alunoId` preenchido; ou
- `partyType = COLLABORATOR` e `collaboratorId` preenchido.

A constraint `GeneratedContract_exactly_one_party_check` impede documento sem parte ou com duas partes simultâneas.

Os vínculos de vigência são separados:

- `StudentContract` para aluno;
- `CollaboratorContract` para colaborador.

O documento, o vínculo, o modelo, a parte e o tenant devem formar uma combinação válida. Triggers de banco rejeitam referências cruzadas entre tenants, partes ou modelos.

## Snapshot e imutabilidade

Na geração, `dataSnapshot` registra:

```json
{
  "party": {
    "type": "STUDENT ou COLLABORATOR",
    "id": "identificador da parte"
  },
  "values": {
    "...": "contexto usado na renderização"
  }
}
```

O sistema também persiste:

- versão do modelo;
- HTML renderizado;
- hash do documento;
- trilha de auditoria;
- PDF, quando solicitado.

Documento assinado não é editado, reenviado nem cancelado pela rotina comum. Alterações posteriores exigem novo contrato ou aditivo.

## Variáveis do aluno

As variáveis existentes permanecem disponíveis em modelos `STUDENT`, incluindo:

- `{{aluno.nome}}`, `{{aluno.cpf}}`, `{{aluno.rg}}` e `{{aluno.enderecoCompleto}}`;
- `{{responsavel.nome}}`, `{{responsavel.cpf}}` e `{{responsavel.email}}`;
- `{{professor.nome}}` e `{{professor.cref}}`;
- `{{servico.*}}` para dados do catálogo comercial.

Quando a geração não informa professor, o contexto utiliza o professor responsável vinculado ao aluno.

## Variáveis do colaborador

Modelos `COLLABORATOR` podem usar:

- `{{colaborador.nome}}`;
- `{{colaborador.cpf}}`;
- `{{colaborador.rg}}`;
- `{{colaborador.enderecoCompleto}}`;
- `{{colaborador.email}}`;
- `{{colaborador.telefone}}`;
- `{{colaborador.funcao}}`;
- `{{colaborador.cref}}`;
- `{{colaborador.resumoProfissional}}`;
- `{{colaborador.documentoEmpresa}}`;
- `{{colaborador.gestorResponsavel}}`;
- `{{colaborador.dataAdmissao}}`;
- `{{colaborador.dataDesligamento}}`;
- `{{colaborador.situacao}}`.

O contexto é montado exclusivamente com dados do colaborador pertencente ao tenant autenticado.

## Variáveis comuns

Modelos de qualquer aplicabilidade podem usar:

- `{{empresa.razaoSocial}}`;
- `{{empresa.cnpj}}`;
- `{{empresa.cref}}`;
- `{{empresa.endereco}}`;
- `{{contrato.valorMensal}}`;
- `{{contrato.valorMensalExtenso}}`;
- `{{contrato.diaVencimento}}`;
- `{{contrato.horarios}}`;
- `{{contrato.dataInicio}}`;
- `{{contrato.dataAssinatura}}`.

Tokens desconhecidos ou valores necessários não resolvidos impedem prévia e geração, evitando documento incompleto.

## Contrato vigente e candidato

A interface separa:

- **Contrato vigente**: vínculo atualmente válido;
- **Candidato**: documento em preparação, envio, assinatura ou espera pelo início planejado;
- **Histórico**: vínculos encerrados, cancelados, expirados, recusados ou legados.

Criar, enviar, visualizar, cancelar, recusar ou expirar um candidato não encerra o vigente.

Somente documento `SIGNED` pode entrar em vigor.

## Data efetiva e substituição

A data efetiva é a maior entre:

- data/hora da assinatura eletrônica;
- data de início planejada.

Consequências:

- não existe vigência retroativa anterior à assinatura;
- sem início futuro, a vigência começa na assinatura;
- com início futuro, o documento fica assinado e o vínculo aguarda em `pending_signature`;
- o agendador processa vínculos assinados cujo início chegou;
- na mesma transação, o vínculo anterior é encerrado, o novo é ativado e o ponteiro da parte é atualizado.

Os ponteiros são:

- `Aluno.currentStudentContractId`;
- `Educator.currentCollaboratorContractId`.

Índices parciais únicos garantem no máximo um vínculo `active` por aluno e por colaborador. A transação bloqueia a linha da parte antes da substituição para impedir corrida entre ativações concorrentes.

O agendador pode ser desativado com `CONTRACT_LIFECYCLE_SCHEDULER_ENABLED=false`. O intervalo é configurado por `CONTRACT_LIFECYCLE_SCHEDULER_INTERVAL_MINUTES`.

## Ciclo do aluno

O aluno mantém o fluxo existente na aba **Financeiro** e em `/alunos/:id/contracts`:

1. selecionar modelo compatível;
2. abrir prévia;
3. gerar candidato;
4. gerar PDF;
5. preparar link;
6. assinar ou recusar;
7. ativar imediatamente ou na data planejada.

Modelos exclusivos de colaborador não aparecem nas opções do aluno.

## Ciclo do colaborador

A página individual de edição do colaborador contém **Controle contratual**:

- contrato vigente;
- candidatos;
- histórico;
- registros legados;
- seleção de modelo compatível;
- prévia;
- geração;
- PDF;
- link de assinatura;
- cancelamento do candidato;
- processamento da vigência.

As escritas exigem a permissão administrativa de contrato do colaborador e respeitam o escopo `self`, `managed` ou `contract` da tela de cadastro. A consulta também exige acesso ao colaborador dentro do tenant.

O antigo checkbox e upload editáveis do cadastro não são mais a fonte de verdade. O histórico legado aparece somente para consulta.

## Envio e link público

Ao preparar o envio:

1. o documento passa para `SENT`;
2. um token aleatório é criado;
3. somente o hash do token é armazenado;
4. a validade padrão é 30 dias;
5. o vínculo passa a `pending_signature`;
6. a auditoria registra ator, parte, IP e User Agent.

Gerar novo link invalida o endereço anterior. O sistema não envia mensagem automaticamente; a equipe compartilha o endereço pelo canal escolhido.

A página pública usa linguagem neutra para aluno e colaborador. Ela permite:

- aceitar e assinar;
- recusar com motivo opcional;
- consultar o documento;
- visualizar o resultado da assinatura e a data efetiva.

## Assinatura

Na assinatura:

1. a parte informa nome, CPF e e-mail opcional;
2. o token é reivindicado de forma atômica;
3. são registrados nome, CPF normalizado, e-mail, IP, User Agent, data/hora e hash;
4. o documento passa para `SIGNED`;
5. o vínculo correto é localizado pelo `partyType`;
6. a entrada em vigor ocorre imediatamente ou fica programada;
7. o token é removido.

A mesma assinatura pública atende os dois tipos sem criar tabelas, rotas ou evidências paralelas.

## Recusa, expiração e cancelamento

Esses estados encerram somente o candidato:

- recusa pública invalida o token e registra motivo e auditoria;
- expiração invalida o token quando o prazo termina;
- cancelamento administrativo é permitido apenas antes da assinatura.

O vigente anterior permanece intacto. Documento recusado não pode ser reenviado; deve ser gerado um novo candidato.

O status administrativo `REJECTED` continua derivado do evento de auditoria existente para preservar compatibilidade histórica.

## Legado do colaborador

A migração lê:

- `Educator.hasSignedContract`;
- `Educator.signedContractDocumentUrl`.

O backfill é idempotente por `legacySourceKey` e cria um `CollaboratorContract` com origem:

- `LEGACY_PDF`, quando existe URL de documento;
- `LEGACY_DECLARATION`, quando há somente a declaração anterior.

Registros legados:

- usam status `legacy`;
- não possuem `GeneratedContract`;
- não recebem assinatura, token, hash, IP ou data de aceite fabricados;
- não são considerados vigentes eletrônicos;
- permanecem somente leitura no histórico.

## Segurança e auditoria

A segurança é aplicada em duas camadas:

- aplicação: autenticação, permissão, escopo da tela e filtros de tenant;
- banco: constraints, chaves estrangeiras, índices únicos e triggers de combinação.

Eventos de geração, envio, visualização, assinatura, recusa, cancelamento e vigência são registrados em `ContractAuditLog`.

## APIs principais

Aluno:

- `POST /api/v1/contracts/preview`;
- `POST /api/v1/contracts/generate`;
- `GET /api/v1/contracts/alunos/:alunoId`;
- `POST /api/v1/contracts/documents/:documentId/pdf`;
- `POST /api/v1/contracts/documents/:documentId/send`.

Colaborador:

- `GET /api/v1/contracts/collaborators/:collaboratorId/summary`;
- `POST /api/v1/contracts/collaborators/:collaboratorId/preview`;
- `POST /api/v1/contracts/collaborators/:collaboratorId/generate`;
- `POST /api/v1/contracts/collaborators/:collaboratorId/documents/:documentId/pdf`;
- `POST /api/v1/contracts/collaborators/:collaboratorId/documents/:documentId/send`;
- `POST /api/v1/contracts/collaborators/:collaboratorId/documents/:documentId/cancel`;
- `POST /api/v1/contracts/collaborators/:collaboratorId/links/:linkId/activate`.

Compartilhado:

- `GET /api/v1/contracts/templates` com filtros `partyType` e `applicability`;
- `GET /api/v1/contracts/variables` com os mesmos filtros;
- `GET /api/v1/contracts/public/:token`;
- `POST /api/v1/contracts/public/:token/sign`;
- `POST /api/v1/contracts/public/:token/reject`.

## Provedores externos

`GeneratedContract` mantém `externalProvider` e `externalEnvelopeId` para futura integração com provedores externos. A issue 263 não altera o provedor de assinatura interna.
