# Pré-cadastro público

Este diretório contém a experiência pública autenticada da pré-matrícula da issue #271.

## Regras essenciais

- O token público é usado somente para abrir e reivindicar o convite.
- Após a reivindicação, o fluxo continua em `/pre-cadastro`, sem token na URL.
- Dados pessoais são persistidos na identidade canônica do aluno e nunca em `localStorage` ou query string.
- O salvamento é incremental, versionado e exige a seleção explícita do dependente quando uma conta possui mais de um vínculo.
- Responsáveis legais precisam comprovar o vínculo com dados previamente cadastrados; a simples posse do link ou o preenchimento de campos textuais não concede autorização.
- A conclusão registra o consentimento vigente e não ativa matrícula, contrato, cobrança, plano, agenda ou liberação para treino.

## Validação

Mudanças neste diretório devem executar o workflow visual da issue #271 em desktop, tablet e mobile, além dos gates gerais de type-check, lint, testes, build, arquitetura, catálogo de acesso e documentação.
