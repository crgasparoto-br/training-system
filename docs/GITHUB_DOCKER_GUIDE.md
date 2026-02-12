# 🚀 GitHub CLI & Docker Compose - Guia Completo

## 📊 Resumo das Suas Informações GitHub

### ✅ Autenticação GitHub CLI

Você está **autenticado** com sucesso no GitHub!

**Conta:** crgasparoto-br  
**Nome:** Claudinei Rogerio Gasparoto  
**Email:** crgasparoto@gmail.com  
**Repositórios Públicos:** 1  
**Conta criada:** 18 de Janeiro de 2026

---

## 🛠️ Capacidades do GitHub CLI (gh)

O GitHub CLI está **instalado e configurado**. Aqui está o que você pode fazer:

### 1️⃣ **Gerenciar Repositórios**

```bash
# Listar seus repositórios
gh repo list

# Criar novo repositório
gh repo create nome-do-repo --private --description "Descrição"

# Clonar repositório
gh repo clone usuario/repo

# Ver informações do repositório
gh repo view

# Deletar repositório
gh repo delete usuario/repo
```

### 2️⃣ **Trabalhar com Issues**

```bash
# Listar issues
gh issue list

# Criar nova issue
gh issue create --title "Título" --body "Descrição"

# Ver issue específica
gh issue view 123

# Fechar issue
gh issue close 123

# Reabrir issue
gh issue reopen 123
```

### 3️⃣ **Gerenciar Pull Requests**

```bash
# Listar PRs
gh pr list

# Criar PR
gh pr create --title "Título" --body "Descrição"

# Ver PR
gh pr view 123

# Fazer merge de PR
gh pr merge 123

# Checkout de PR
gh pr checkout 123
```

### 4️⃣ **Trabalhar com Gists**

```bash
# Criar gist
gh gist create arquivo.txt

# Listar gists
gh gist list

# Ver gist
gh gist view ID
```

### 5️⃣ **GitHub Actions**

```bash
# Listar workflows
gh workflow list

# Ver runs de workflow
gh run list

# Ver logs de run
gh run view 123

# Reexecutar workflow
gh run rerun 123
```

### 6️⃣ **Releases**

```bash
# Listar releases
gh release list

# Criar release
gh release create v1.0.0 --title "Release 1.0.0" --notes "Notas"

# Ver release
gh release view v1.0.0

# Fazer upload de assets
gh release upload v1.0.0 arquivo.zip
```

### 7️⃣ **API do GitHub**

```bash
# Fazer requisições à API
gh api user
gh api repos/:owner/:repo
gh api /repos/:owner/:repo/issues

# Com autenticação automática
gh api graphql -f query='query { viewer { login } }'
```

### 8️⃣ **Secrets e Variáveis**

```bash
# Listar secrets
gh secret list

# Criar secret
gh secret set SECRET_NAME

# Deletar secret
gh secret delete SECRET_NAME
```

---

## 🐳 Instalação do Docker Compose

Você tem **Docker** instalado, mas precisa do **Docker Compose**. Aqui estão as opções:

### Opção 1: Docker Compose Plugin (Recomendado)

```bash
# Instalar Docker Compose Plugin
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Verificar instalação
docker compose version
```

**Uso:**
```bash
docker compose up -d
docker compose down
docker compose ps
```

### Opção 2: Docker Compose Standalone

```bash
# Baixar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Dar permissão de execução
sudo chmod +x /usr/local/bin/docker-compose

# Verificar instalação
docker-compose --version
```

**Uso:**
```bash
docker-compose up -d
docker-compose down
docker-compose ps
```

### Opção 3: Instalar via pip (Python)

```bash
# Instalar via pip
sudo pip3 install docker-compose

# Verificar instalação
docker-compose --version
```

---

## 🚀 Criar Repositório GitHub para Seu Projeto

Vou criar um repositório privado para o **Training System**:

```bash
cd /home/ubuntu/training_system

# Inicializar Git
git init

# Adicionar arquivos
git add .

# Commit inicial
git commit -m "Initial commit: Fase 1 - Fundação completa"

# Criar repositório no GitHub (privado)
gh repo create training_system \
  --private \
  --description "Sistema SaaS de gestão de treinos de corrida" \
  --source=. \
  --push
```

---

## 📋 Comandos Úteis do GitHub CLI

### Verificar Status
```bash
gh auth status
gh repo view
```

### Configurar Git
```bash
git config --global user.name "Claudinei Rogerio Gasparoto"
git config --global user.email "crgasparoto@gmail.com"
```

### Workflow Típico
```bash
# 1. Criar branch
git checkout -b feature/nova-funcionalidade

# 2. Fazer mudanças
git add .
git commit -m "feat: adicionar nova funcionalidade"

# 3. Push
git push origin feature/nova-funcionalidade

# 4. Criar PR via CLI
gh pr create --title "Nova Funcionalidade" --body "Descrição detalhada"

# 5. Merge (quando aprovado)
gh pr merge --squash
```

---

## 🔐 Segurança

### Adicionar .gitignore

Já existe um `.gitignore` no projeto, mas certifique-se de incluir:

```gitignore
# Secrets
.env
.env.local
.env.*.local

# Dependências
node_modules/

# Build
dist/
build/

# Database
*.sqlite
*.sqlite3

# Logs
*.log
```

### Nunca Commitar:
- ❌ Senhas
- ❌ Tokens de API
- ❌ Chaves privadas
- ❌ Arquivos `.env`

---

## 📊 Exemplo de Uso Completo

### 1. Criar Repositório
```bash
cd /home/ubuntu/training_system
gh repo create training_system --private --source=. --push
```

### 2. Trabalhar com Branches
```bash
git checkout -b develop
git push -u origin develop
```

### 3. Criar Issue
```bash
gh issue create \
  --title "Implementar módulo de atletas" \
  --body "Criar CRUD completo para gestão de atletas" \
  --label "enhancement"
```

### 4. Criar PR
```bash
gh pr create \
  --title "feat: módulo de autenticação" \
  --body "Implementação completa de JWT auth" \
  --base main \
  --head feature/auth
```

### 5. Ver Status
```bash
gh pr status
gh issue list
gh repo view
```

---

## 🎯 Próximos Passos

1. **Instalar Docker Compose**
   ```bash
   sudo apt-get install docker-compose-plugin
   ```

2. **Criar Repositório GitHub**
   ```bash
   cd /home/ubuntu/training_system
   gh repo create training_system --private --source=. --push
   ```

3. **Configurar CI/CD** (Opcional)
   - GitHub Actions
   - Testes automáticos
   - Deploy automático

---

## 📚 Recursos Adicionais

- **GitHub CLI Docs**: https://cli.github.com/manual/
- **Docker Compose Docs**: https://docs.docker.com/compose/
- **Git Docs**: https://git-scm.com/doc

---

## ✅ Checklist

- [x] GitHub CLI instalado
- [x] Autenticado no GitHub
- [x] Conta: crgasparoto-br
- [ ] Docker Compose instalado
- [ ] Repositório criado no GitHub
- [ ] Git configurado localmente
- [ ] Primeiro commit feito

---

**Pronto para começar! 🚀**
