# CLAUDE.md — `punta-taco`

> Gerado a partir de `git/_templates/CLAUDE-projeto.md`, adaptado: este projeto é um site
> estático, não uma aplicação containerizada. As seções de Docker, GHCR, Trivy e healthz do
> template não se aplicam — ver "Desvios do padrão da pasta" no fim.

---

## O que é este projeto

Instrumento de treino de aplicação de pedal para sim racing, rodando no browser.

**Por que existe:** sim racer treina pedal dentro do sim, onde o feedback é indireto e vem
misturado com traçado, câmbio e setup. Aqui o pedal é isolado — curva-alvo, traço realizado
sobreposto, e métricas que apontam onde a aplicação foi grosseira. Escopo completo em
[`escopo.md`](escopo.md), que é a fonte de verdade do produto.

**Competências demonstradas:**
- Processamento de sinal em tempo real (amostragem de passo fixo, filtragem, derivadas)
- Integração com hardware via web APIs (Gamepad API, futuramente WebHID)
- CI que cobra política de dependências e verificação de tipos
- Engenharia de sustentação: dependência zero em runtime, sem build step

---

## Stack

- **Linguagem:** JavaScript (ES modules), tipado via JSDoc e verificado com `tsc --noEmit`
- **Render:** Canvas 2D, sem framework
- **Input:** Gamepad API
- **Persistência:** IndexedDB (local); Supabase a partir do M2, só para ranking
- **Hospedagem:** nenhuma por enquanto — fase local (`npm run serve`). Pages volta quando fizer sentido

**Não há build step.** Os arquivos do repo são o site. TypeScript é verificador, nunca etapa de
deploy — se o toolchain quebrar, o site continua no ar. Não introduza bundler, framework ou
dependência de runtime sem discutir antes: isso é decisão de arquitetura, não de conveniência.

---

## Decisões travadas

| Decisão | Valor | Por quê |
|---|---|---|
| Plataforma | Web desktop, Chrome/Edge | zero atrito de instalação — o loop de crescimento é mandar link |
| Input | Gamepad API, não WebHID | G29, MOZA SRP Lite e PXN funcionam sem trabalho por dispositivo |
| Piso de hardware | monitor 60Hz, pedaleira de entrada | prefere-se assumir o pior a excluir quem tem 60Hz |
| Jerk RMS | número relativo ao próprio histórico | resolução baixa impede comparação absoluta entre hardwares |
| Backend | nenhum até o M2 | M1 inteiro é local; ranking é a única peça que exige servidor |
| Repo | público | portfólio; hospedagem grátis continua disponível quando voltar |

---

## Estado atual

**Milestone:** M0 — gate de captura.

**O que já funciona:**
- `/probe/` — mede taxa efetiva, resolução e ruído da pedaleira, e emite veredito do gate

**Próximo passo:**
- Rodar o probe em hardware real (G29, SRP Lite, PXN) e decidir se a métrica central se sustenta

---

## Papel deste agente

Executor, não apenas consultor: traduz o roadmap em entregas reais, em ciclos de
discussão → planejamento → execução → revisão.

### Fluxo padrão
1. **Discussão** — alinhamos a próxima milestone ou tarefa
2. **Planejamento** — o agente propõe as issues (título, descrição, labels) e **aguarda aprovação**
3. **Execução** — branch (`feat/`, `fix/`, `chore/`), commits atômicos em Conventional Commits,
   PR linkando a issue com `Closes #N`
4. **Revisão** — eu reviso e faço o merge
5. **Atualização** — o agente atualiza o estado neste arquivo quando necessário

### Autonomamente
Ler o estado do repo, criar branches, escrever arquivos, commitar, abrir PRs, rodar `typecheck`.

### Pergunta antes
Criar issues em lote (apresenta a lista completa antes), mudar contratos públicos (formato de
drill JSON, schema do IndexedDB, formato de export), qualquer escolha de arquitetura fora do
roadmap — em especial adicionar dependência.

### Nunca
Merge de PR, push direto na `main`, deletar branch remota sem confirmação, mexer em credencial.

---

## Convenções

- **Branches:** `feat/descricao-curta`, `fix/`, `chore/`
- **Commits:** Conventional Commits
- **Labels:** `feature`, `bug`, `ci`, `docs`, `security`, `infra`
- **Idioma:** português em docs, issues e PRs; inglês em código e comentários

---

## Armadilhas específicas deste domínio

- **Gamepad API exige contexto seguro** — `localhost` serve, `file://` não. Rodar com
  `npm run serve`.
- **O browser só expõe o gamepad depois de um input do usuário.** Toda tela que dependa de
  dispositivo precisa lidar com o estado "ainda não apareceu".
- **`navigator.getGamepads()` devolve snapshot** — tem que ser chamado a cada leitura, e
  `gamepad.timestamp` é o que distingue amostra nova de valor repetido.
- **Nunca derive sinal cru.** Filtrar (Savitzky-Golay ou equivalente) antes de derivar; a 60Hz
  a segunda derivada de sinal quantizado é quase só ruído.
- **Nunca exiba precisão que não existe.** A 60Hz o quantum de tempo é ~17ms; erro de onset não
  pode aparecer com uma casa decimal de milissegundo.
- **Load cell mede força, potenciômetro mede curso.** Normalizar sempre em 0–100% do range
  calibrado, e jamais comparar valores absolutos entre perfis de hardware diferentes.

---

## Desvios do padrão da pasta `git/`

O `../CLAUDE.md` assume aplicação containerizada com pipeline lint → SAST → build → scan →
release → GHCR → deploy. Aqui não há imagem, servidor nem runtime próprio, então **Docker,
GHCR, Trivy, healthz e reverse proxy não se aplicam**. O que permanece do padrão: CI no GitHub
Actions, Dependabot, roadmap versionado, budget zero, conventional commits.

## Política de dependências

A preocupação aqui não é toolchain apodrecendo — é cadeia de suprimentos. `event-stream`,
`colors.js` e `node-ipc` foram todos pacote pequeno, mantenedor único, e um dia o pacote virou
outra coisa. As regras abaixo são cobradas pelo workflow `.github/workflows/supply-chain.yml`,
para não erodirem um pacote conveniente por vez.

| Regra | Como é garantida |
|---|---|
| **Zero dependências de runtime**, sempre | CI falha se `dependencies` do `package.json` não estiver vazio |
| Nada de npm chega ao browser | não há bundler; o site importa apenas arquivos deste repo |
| Árvore instalada abaixo de 12 pacotes | CI conta `npm ls --all` e falha acima do teto |
| Install scripts nunca executam | `ignore-scripts=true` no `.npmrc` + `--ignore-scripts` no CI |
| Lockfile versionado | `package-lock.json` no repo, instalação reprodutível |
| Vulnerabilidade conhecida barra o merge | `npm audit --audit-level=moderate` no CI |

**Estado hoje:** uma devDependency, `typescript`, com **zero dependências transitivas**,
publicada pela Microsoft e usada só como verificador no CI.

**Ao considerar um pacote novo**, a pergunta não é "resolve meu problema" — é: quem publica,
quantas transitivas traz, e escrever à mão custaria quanto? Para quase tudo que este projeto
precisa (Savitzky-Golay, RMS, regressão linear) a resposta é algumas dezenas de linhas, e código
próprio que você entende vale mais que dependência que você não lê.

**Subir o teto de pacotes é decisão consciente**, discutida antes — nunca efeito colateral de
`npm install`.

---

## Referências

- Escopo do produto: [`escopo.md`](escopo.md)
- Padrões gerais da pasta: `../CLAUDE.md`
- Concorrente direto a analisar: `trailbraking.uk`
