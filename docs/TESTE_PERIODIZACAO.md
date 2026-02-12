# 🧪 Guia de Teste - Periodização Macrociclo

## 📋 Preparação

### 1. Atualizar Código

```powershell
cd C:\Users\PC01\OneDrive\Projetos\training_system
git pull origin main
```

### 2. Executar Migration

```powershell
cd apps\api
pnpm prisma migrate dev --name add_periodization_models
```

### 3. Executar Seed de Parâmetros

```powershell
cd apps\api
npx tsx prisma/seed-parameters.ts
```

Você deve ver:
```
🌱 Seeding Training Parameters...
✅ Carga Microciclo: 4 parâmetros
✅ Montagem: 5 parâmetros
✅ Método: 12 parâmetros
✅ Divisão do Treino: 5 parâmetros

🎉 Seed completed successfully!
Total: 26 parâmetros criados
```

### 4. Reiniciar API

```powershell
cd apps\api
pnpm dev
```

### 5. Reiniciar Frontend (se necessário)

```powershell
cd apps\web
pnpm dev
```

---

## 🎯 Teste Passo a Passo

### 1. Acessar Plano de Treino

1. Abra http://localhost:5173
2. Faça login
3. Vá para **Planos**
4. Clique em **"Ver"** em um plano existente

### 2. Acessar Periodização

1. Na página de detalhes do plano
2. Clique na aba **"Periodização Macrociclo"**
3. Aguarde carregar (pode demorar alguns segundos)

### 3. Testar Edição Inline

#### Teste 1: Carga Microciclo
1. Clique em uma célula da linha **"Carga Microciclo"**
2. Selecione um valor: **ADP**, **ORD**, **CHO** ou **REG**
3. Aguarde 2 segundos
4. Veja o indicador **"Salvando..."** aparecer
5. Verifique se o valor foi salvo (recarregue a página)

#### Teste 2: Zona Rep.
1. Clique em uma célula da linha **"Zona Rep."**
2. Digite um número: **4**, **6**, **8**, **10**, **12** ou **14**
3. Aguarde 2 segundos
4. Observe que **% Carga TR** é calculado automaticamente:
   - 4 rep → 90%
   - 6 rep → 85%
   - 8 rep → 80%
   - 10 rep → 75%
   - 12 rep → 70%
   - 14 rep → 65%

#### Teste 3: REF e Séries
1. Na mesma coluna onde definiu Carga Microciclo
2. Digite um valor em **REF**: ex: **10**
3. Observe que **Séries Grupo M. Inf.** é calculado:
   - Se Carga = **REG** → REF / 2 (ex: 10 / 2 = 5)
   - Outros → REF (ex: 10)

#### Teste 4: Rep Reserva
1. Observe a linha **"Rep Reserva"**
2. Ela é calculada automaticamente baseado em Carga Microciclo:
   - **CHO** → 0
   - **ADP** → 4
   - **ORD** ou **REG** → 2

#### Teste 5: Dropdowns
1. Teste os dropdowns:
   - **Montagem**: AS, A/AN, CA, CGM, MIS
   - **Método**: SER, BS, TS, SS, CIR, CS, PC, PD, DS, RP, SN, FST-7
   - **Divisão do Treino**: FB, AB, ABC, ABCD, ABCDE
2. Cada um deve salvar automaticamente após 2 segundos

#### Teste 6: Freq. Semanal
1. Digite um número na linha **"Freq. Semanal"**
2. Ex: **3**, **4**, **5**
3. Aguarde auto-save

### 4. Testar Múltiplas Semanas

1. Preencha dados em diferentes mesociclos e semanas
2. Verifique se cada célula salva independentemente
3. Recarregue a página e verifique se os dados persistem

### 5. Testar Cálculos Automáticos

#### Cenário 1: Treino de Adaptação
```
Carga Microciclo: ADP
Zona Rep.: 12
REF: 8

Resultados esperados:
% Carga TR: 70%
Séries Grupo M. Inf.: 8
Rep Reserva: 4
```

#### Cenário 2: Treino de Choque
```
Carga Microciclo: CHO
Zona Rep.: 4
REF: 12

Resultados esperados:
% Carga TR: 90%
Séries Grupo M. Inf.: 12
Rep Reserva: 0
```

#### Cenário 3: Treino Regenerativo
```
Carga Microciclo: REG
Zona Rep.: 14
REF: 10

Resultados esperados:
% Carga TR: 65%
Séries Grupo M. Inf.: 5 (10 / 2)
Rep Reserva: 2
```

---

## ✅ Checklist de Teste

- [ ] Migration executada com sucesso
- [ ] Seed de parâmetros executado
- [ ] API reiniciada
- [ ] Frontend reiniciado
- [ ] Aba "Periodização Macrociclo" aparece
- [ ] Matriz carrega corretamente
- [ ] Dropdowns mostram opções corretas
- [ ] Edição inline funciona
- [ ] Auto-save funciona (2 segundos)
- [ ] Indicador "Salvando..." aparece
- [ ] % Carga TR calcula corretamente
- [ ] Séries Grupo M. Inf. calcula corretamente
- [ ] Rep Reserva calcula corretamente
- [ ] Dados persistem após reload
- [ ] Múltiplas células podem ser editadas
- [ ] Cores dos campos calculados estão corretas:
  - [ ] % Carga TR: azul
  - [ ] Séries: verde
  - [ ] Rep Reserva: amarelo

---

## 🐛 Problemas Comuns

### Erro: "Cannot find module"
**Solução**: Execute `pnpm install` na raiz do projeto

### Erro: "Table does not exist"
**Solução**: Execute a migration novamente

### Erro: "Parameters not found"
**Solução**: Execute o seed de parâmetros

### Dropdowns vazios
**Solução**: Verifique se o seed foi executado corretamente

### Auto-save não funciona
**Solução**: Verifique o console do navegador (F12) para erros

### Cálculos não aparecem
**Solução**: Verifique se os valores de entrada estão corretos

---

## 📊 Dados de Teste Sugeridos

### Mesociclo 1 (Base)
| Semana | Carga | Zona Rep | REF | Montagem | Método | Divisão | Freq |
|--------|-------|----------|-----|----------|--------|---------|------|
| 1 | ADP | 12 | 6 | AS | SER | ABC | 3 |
| 2 | ORD | 10 | 8 | AS | SER | ABC | 3 |
| 3 | ORD | 8 | 10 | AS | BS | ABC | 3 |
| 4 | REG | 14 | 4 | AS | SER | FB | 2 |

### Mesociclo 2 (Build)
| Semana | Carga | Zona Rep | REF | Montagem | Método | Divisão | Freq |
|--------|-------|----------|-----|----------|--------|---------|------|
| 1 | ADP | 10 | 8 | A/AN | TS | ABCD | 4 |
| 2 | ORD | 8 | 10 | A/AN | SS | ABCD | 4 |
| 3 | CHO | 6 | 12 | A/AN | DS | ABCD | 4 |
| 4 | REG | 12 | 6 | AS | SER | AB | 2 |

---

## 🎯 Próximos Passos Após Teste

Se tudo funcionar:
1. ✅ Completar Estímulo Cíclico
2. ✅ Completar Nutrição
3. ✅ Adicionar templates pré-definidos
4. ✅ Implementar importação de planilha

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique o console do navegador (F12)
2. Verifique os logs da API
3. Tire um screenshot do erro
4. Me avise para ajudar!
