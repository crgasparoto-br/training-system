# Pré-cadastro público

Este diretório contém a experiência pública autenticada da pré-matrícula da issue #271.

## Regras essenciais

- O token público é usado somente para abrir e reivindicar o convite.
- Após a reivindicação, o fluxo continua em `/pre-cadastro`, sem token na URL.
- Dados pessoais são persistidos na identidade canônica do aluno e nunca em `localStorage` ou query string.
- O salvamento é incremental, versionado e exige a seleção explícita do dependente quando uma conta possui mais de um vínculo.
- Cada operação autenticada informa o `alunoId` selecionado; leitura, primeiro salvamento, preservação de duplicidade e conclusão bloqueiam primeiro o onboarding e revalidam conta, tenant, papel, idade canônica e autorização antes de ler ou gravar dados pessoais.
- O convite de responsável cria um vínculo `PENDING`; a declaração apenas solicita acesso e nenhum dado pessoal do menor é carregado antes da validação independente pela academia.
- O acesso como responsável somente é aceito quando a data de nascimento canônica caracteriza menoridade e a autorização está `ACTIVE`, validada por uma conta administrativa diferente.
- Perda de autoridade depois do preflight não pode produzir resposta sensível, transição de lifecycle, revisão, evento ou timestamp residual; a operação deve falhar por inteiro.
- Quando o primeiro salvamento encontra CPF duplicado, a transição para `PRE_REGISTRATION_IN_PROGRESS`, o rascunho seguro, a revisão administrativa, a versão e os eventos são preservados na mesma transação.
- Cada etapa envia somente seus próprios campos; o backend usa uma união discriminada e rejeita mass assignment entre etapas.
- Alterações administrativas na identidade canônica incrementam a versão do onboarding e invalidam formulários públicos desatualizados.
- O rascunho temporário de aba é isolado pela combinação `userId + alunoId`, não contém CPF, data de nascimento ou CPF do responsável e é removido na troca de conta, logout ou negação autoritativa de acesso.
- Falhas temporárias de rede não removem o rascunho local; somente negação confirmada (`NOT_FOUND` ou autorização revogada) o invalida.
- A conclusão registra o consentimento vigente e não ativa matrícula, contrato, cobrança, plano, agenda ou liberação para treino.
- Anamnese e PAR-Q são apresentados como módulos opcionais independentes e encaminhados para suas etapas específicas.

## Validação

Mudanças neste diretório devem executar o workflow visual da issue #271 em desktop de baixa altura, desktop amplo e mobile, incluindo landing, seleção de processo, solicitação e espera de validação do responsável, validação administrativa, formulário, conclusão e encaminhamento para módulos opcionais, além dos gates gerais de type-check, lint, testes, build, arquitetura, catálogo de acesso e documentação.

Mudanças de autorização devem incluir cenários discriminantes em que a revogação vence o lock antes de `getSession`, primeiro salvamento ou preservação de duplicidade, comprovando ausência de PII e de mutações residuais.

Mudanças no rascunho de aba devem distinguir troca de usuário, logout e negação autoritativa de falhas temporárias, preservando dados somente quando a mesma conta ainda puder retomar o processo com segurança.
