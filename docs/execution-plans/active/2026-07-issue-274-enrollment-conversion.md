# Issue 274 — deduplicação, revisão e conversão

## Objetivo

Entregar a conversão do lead/pré-matrícula no mesmo registro canônico, com deduplicação em todos os pontos críticos, decisões auditáveis e confirmação transacional/idempotente.

O candidato válido é sempre o HEAD final da PR registrado no handoff. Este plano não fixa SHA intermediário.

## Escopo implementado

- contrato compartilhado de evidências, decisões e resultado;
- detector único, CPF com dígitos verificadores, telefone canônico com país/DDD, normalização de nomes e mascaramento administrativo;
- guardas antes de criação, registro/claim, edição administrativa, edição pública, revisão e ativação;
- projeção dos candidatos conforme `self`, `managed` ou `contract`, sem identificar registros restritos;
- decisões versionadas, com motivo, ator, fingerprint e expiração;
- conjunto completo de candidatos usado em classificação, fingerprint, autorização e bloqueio, inclusive acima de 25 registros;
- nome + nascimento normalizado com acentos, espaços e partículas portuguesas como revisão obrigatória;
- edição comercial revisável com preflight, confirmação versionada, motivo e auditoria transacional;
- compatibilidade da conta validada contra a identidade final do canônico antes da transferência;
- criação com falso positivo auditada na mesma transação e permitida somente com escopo sobre todos os candidatos;
- consolidação sem exclusão, vínculo estruturado `duplicado → canônico` e bloqueio de reassociação clínica insegura;
- redetecção do canônico após a consolidação, com fingerprint e versão próprios;
- revisão vinculada ao `onboarding.version`, inclusive para falso positivo confirmado durante a criação;
- trigger de invalidação após mudança de identidade, com bloqueio `NOWAIT`;
- transições de descarte, prontidão e ativação centralizadas no domínio de ciclo do aluno;
- ativação serializável do mesmo ID, com revogação de convite;
- tela administrativa específica para os estados concluído e pronto;
- claim sem oráculo público, com rate limit antes da detecção transacional;
- revalidação de bloco, tenant e escopo depois do lock e antes do commit;
- consentimento comparado à versão vigente;
- grafo canônico protegido contra cadeia, ciclo, atualização posterior e concorrência;
- invalidação da revisão por origem, responsável, unidade e observações;
- revisão administrativa completa, confirmação persistente e filtro de convertidos;
- documentação e testes de classificação, normalização, autorização, entrypoints, persistência pública, consolidação real em PostgreSQL e limites downstream.

## Critérios de aceite

- [x] nome isolado não bloqueia;
- [x] CPF/conta incompatível bloqueiam;
- [x] resposta pública não revela candidatos;
- [x] decisão registra ator, motivo, versão persistida, fingerprint e validade;
- [x] decisão exige escopo sobre os cadastros relacionados;
- [x] consolidação não apaga, registra o vínculo canônico e não sobrescreve campo existente automaticamente;
- [x] origem consolidada não reaparece como bloqueio do canônico;
- [x] histórico clínico bloqueia consolidação não assistida;
- [x] alteração de identidade invalida revisão;
- [x] confirmação revalida no commit e é idempotente;
- [x] nenhum domínio posterior é criado automaticamente;
- [x] aluno ativo permanece localizável pelo filtro `Convertido`;
- [x] confirmação e próximas ações sobrevivem a reload da Central do Aluno;
- [x] `pnpm validate` e workflow remoto aprovados no HEAD final registrado no handoff.

## Validação manual

1. Criar dois leads com CPF igual e confirmar bloqueio.
2. Criar semelhança de telefone/e-mail, registrar “pessoas diferentes” e concluir revisão.
3. Repetir o cenário com candidato fora do escopo e confirmar que nenhum dado é exibido e a decisão é recusada.
4. Alterar identificação ou contato pelo pré-cadastro público e confirmar verificação antes da gravação.
5. Alterar individualmente contato, origem, responsável, unidade e observações após revisão e confirmar invalidação.
6. Consolidar duplicado sem dados clínicos e confirmar preservação do registro descartado.
7. Tentar consolidar duplicado com Anamnese/PAR-Q e confirmar pendência sem alteração.
8. Confirmar matrícula duas vezes e observar mesmo ID sem novo evento de conversão.
9. Verificar ausência de contrato, plano, cobrança, professor e agenda.
10. Confirmar que o claim com e sem candidato duplicado não possui resposta pública diferenciada.
11. Revogar permissão ou mudar escopo entre preflight e commit e confirmar rollback.
12. Depois de `A → B`, tentar `B → C` e confirmar rejeição pelo banco.
13. Recarregar a Central do Aluno após ativação e localizar o mesmo ID pelo filtro `Convertido`.
14. Criar 26 candidatos revisáveis e confirmar que todos participam da classificação, fingerprint e autorização.
15. Editar contato compartilhado, confirmar com motivo e repetir após mudar o nome para comprovar invalidação.
16. Tentar transferir conta incompatível ao canônico e confirmar rollback sem desvincular a origem.

## Riscos e pendências

- A reassociação clínica automática permanece bloqueada até existir serviço de domínio específico por prontuário.
- Este plano permanece ativo até auditoria independente do SHA final.
