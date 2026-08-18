# Punta Taco — Escopo

> Instrumento de treino de aplicação de pedal para sim racing: curva-alvo na timeline,
> traço realizado sobreposto, e métrica que diz exatamente onde a aplicação foi grosseira.

**Status:** escopo v2 — fechado. Tecnologia ainda não definida.

---

## 1. Identidade

| | |
|---|---|
| Nome | **Punta Taco** |
| Domínio | `puntataco.natan.tec.br` (principal), `trailbrake.natan.tec.br` (redirect, pesca busca em inglês) |
| Público primário | Sim racing brasileiro / LatAm |
| Motto | *smooth is fast* |
| Tom | Instrumento de treino sério. Não é arcade. |

Sobre o nome: "punta taco" é vocabulário de quem é do meio — brasileiro reconhece na hora, e o
termo atravessa Itália, Espanha e LatAm. Marca única, não duas: dois domínios apontando para o
mesmo app é grátis, duas marcas racham comunidade e boca a boca.

## 2. Premissas travadas

| Decisão | Valor |
|---|---|
| Input | Pedaleira USB (load cell ou potenciômetro), via HID |
| Público | Sim racing / performance |
| Core loop | Traçar a curva-alvo (alvo sempre visível no MVP) |
| Plataforma | Web desktop apenas |
| Diferencial | Progressão e profundidade de métrica |

## 3. Tese

Sim racer treina pedal *dentro* do sim, onde o feedback é indireto (tempo de volta, travou ou
não) e vem misturado com traçado, câmbio e setup. Aqui o pedal é isolado: uma curva-alvo, um
traço realizado, e números que apontam o erro. Ciclo de repetição de segundos, não de voltas.

## 4. Concorrência e diferenciação

Existe um app direto: **trailbraking.uk** ("Trail Braking Trainer") — web, grátis, alvo móvel,
banda de tolerância, scoring, pedaleira USB. Cobre boa parte do que seria o M1. *(Avaliado por
busca, não analisado a fundo — pendente.)*

Onde ganhamos:

1. **Progressão.** O concorrente mede; não dá motivo para voltar amanhã. Rating, licença e
   graduação por consistência são a diferenciação principal.
2. **Profundidade de métrica.** Jerk RMS, R² da liberação, contagem de chatter, desvio-padrão
   entre repetições — não só erro de traçado.
3. **Calibração e diagnóstico de hardware.** Sem isso toda métrica é chute.
4. **Público BR/LatAm.** Ranking nacional, vocabulário e drills em português. Dá para ser top 10
   do Brasil muito antes de ser top 10 do mundo.

"Alvo móvel com pontuação" não é diferencial — isso já existe.

## 5. Não-objetivos

- **Nenhuma mecânica de rhythm game**: sem combo, sem multiplicador, sem drill sincronizado com
  música, sem screen shake ou feedback comemorativo. O produto é bancada de medição, não arcade.
- Não é simulador de pista: sem carro, sem pneu, sem tempo de volta.
- Não lê telemetria de iRacing/ACC/AC (browser não alcança — exigiria helper nativo).
- Sem modelo físico de travamento/patinada na v1 (M3).
- Sem mobile, sem touch, sem gamepad.
- Sem XP, sem níveis cosméticos, sem medalha decorativa.

## 6. Features

### 6.1 Input e calibração — fundação, nada funciona sem isso

- Detecção e seleção de dispositivo; mapeamento manual de eixo → pedal (freio, acelerador).
- Calibração: mínimo, máximo, deadzone, inversão de eixo. Salva em perfil nomeado.
- Curva de resposta do hardware: linear (potenciômetro/curso) vs. não-linear (load cell/força).
  Normalização interna sempre 0–100% do range calibrado.
- Diagnóstico de hardware: taxa de amostragem efetiva medida, ruído do eixo em repouso, resolução
  útil em bits. Hardware ruim gera aviso, não métrica falsa.

### 6.2 Motor de execução

- Loop de amostragem com passo fixo (acumulador), independente da taxa de render.
- Gravação da série temporal `(t, brake, throttle)` de cada tentativa.
- Filtragem (Savitzky-Golay ou equivalente) antes de derivar — derivada crua a 60Hz é ruído.
- Timeline horizontal, tempo correndo da direita para a esquerda, playhead fixo a ~2/3 da tela.
  Convenção de telemetria: x = tempo.
- Look-ahead configurável: quanto do futuro você vê antes de agir.

### 6.3 Curvas-alvo e drills

- Drill declarativo em JSON: sequência de segmentos (`ramp`, `hold`, `release`, `idle`) com
  duração, valor destino e tolerância própria por segmento.
- Biblioteca inicial — formas derivadas de telemetria real, não curvas arbitrárias:
  1. **Threshold braking** — subida rápida a 95% sem overshoot, platô, soltar.
  2. **Trail braking** — pico e liberação linear longa até zero.
  3. **Release de raio decrescente** — liberação em dois estágios.
  4. **Modulação de saída** — acelerador progressivo de 0 a 100% sem tranco.
  5. **Transição** — soltar freio e entrar no acelerador sem overlap e sem lacuna.
- Cada drill tem critério de aprovação objetivo (ex.: jerk RMS abaixo de X em 8 de 10 repetições).
- Editor visual de drill (M2).

### 6.4 Métricas

O breakdown é o produto; a nota é só a embalagem.

| Métrica | Mede |
|---|---|
| Erro de traçado (RMS / área entre curvas) | fidelidade ao alvo |
| Tempo até o pico + dp/dt inicial | agressividade da pisada |
| Jerk RMS (d²p/dt²) | suavidade — métrica central |
| Contagem de oscilação/chatter | pé nervoso, correção sobre correção |
| Linearidade da liberação (R² vs. rampa) | qualidade do trail braking |
| Overlap freio+acelerador | falta |
| Erro de onset (ms) | timing |
| Desvio-padrão entre repetições | **consistência** — mais valioso que a melhor tentativa |

Faltas (overshoot, overlap, chatter acima do limiar) marcadas na posição exata da timeline, não
apenas somadas na nota.

### 6.5 Progressão

Linguagem que sim racer já respeita — nada inventado:

- **Rating** por drill e agregado, sobe e desce conforme desempenho. Modelo mental de iRating.
- **Classe de licença** (Rookie → D → C → B → A), destravada por consistência sustentada, nunca
  por recorde isolado.
- **Aprovação por drill** contra critério objetivo publicado, não contra curva de outros usuários.
- **Fantasma do próprio recorde** correndo junto ao traço atual.
- **Drill do dia**: mesma curva para todos, mesma data, placar comparável. É o que traz de volta.
- **Ranking BR e global**, separados.

Rating, licença, aprovação e fantasma rodam 100% local. Drill do dia e ranking exigem servidor.

### 6.6 Feedback

- HUD ao vivo: barras verticais de pedal + traço sobre a banda de tolerância do alvo.
- Áudio funcional: pitch mapeado à posição do pedal, para treinar sem olhar a tela — que é a
  condição real dentro do sim. É instrumento de leitura, não efeito sonoro.
- Pós-run: overlay alvo vs. realizado, marcadores de falta, breakdown de métricas.
- Histórico: evolução por drill, recordes, tendência de consistência.

### 6.7 Persistência

- Local (IndexedDB): perfis de calibração, tentativas, recordes, rating.
- Export/import JSON de tentativas e drills — compartilhar drill sem depender de backend.

## 7. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Gamepad API amostra a ~60Hz (atrelado ao rAF) | Banda útil do pé humano é <10Hz; 60Hz basta para forma, mas jerk precisa de filtro. Medir no M0 e decidir se WebHID vale o custo. |
| Calibração ruim invalida toda métrica | Calibração bloqueante antes do primeiro drill; diagnóstico de ruído visível. |
| "Traçar linha" pode não transferir para o carro | Drills derivados de formas reais de telemetria + modo áudio + fade do alvo no M2 (o alvo desaparece conforme você evolui). |
| Load cell mede força, potenciômetro mede curso | Normalizar 0–100% do range calibrado; nunca comparar números absolutos entre perfis de hardware diferentes. |
| Nome promete punta-taco, MVP não tem embreagem | Decidir: trazer heel-toe para o M1 ou aceitar o uso coloquial do termo (trabalho de pé fino em geral). Ver §9. |

## 8. Roadmap

### M0 — Espinha dorsal *(gate, não entrega)*
Captura de input, calibração, traço ao vivo, diagnóstico de hardware.
**Saída:** a leitura do pedal é boa o suficiente para calcular jerk com sentido. Se não for, o
escopo muda aqui — antes de existir qualquer código de jogo.

### M1 — MVP local
Modo Lab + Trace, 5 drills, métricas completas, rating local, aprovação por drill, fantasma
próprio, histórico. Zero backend.
**Saída:** dá para treinar 20 minutos e ver o rating subir.

### M2 — Progressão + backend mínimo
Classe de licença, drill do dia, ranking BR e global, editor de drill, fade do alvo, gráficos de
evolução. Backend enxuto: tabela de placares + drill semeado por data.
Avaliar embreagem/heel-toe aqui, se não entrar no M1.

### M3 — Consequência
Modelo simples de aderência: travou a roda, patinou, feedback de ABS. O alvo deixa de ser
explícito e passa a ser consequência.

### M4 — Telemetria
Ghost por telemetria importada, compartilhamento de drills. Depende de helper nativo.

## 9. Decisões abertas

1. **Embreagem no M1?** O nome cobra punta-taco; o escopo entrega no M2. Resolver antes do M1.
2. **Unidade exibida para load cell**: % do range calibrado ou kgf?
3. **Duração do drill**: 5–8s por tentativa (tela de repetição rápida) ou sequências de ~60s
   (tela de sessão com progresso)? Afeta a UI diretamente.
4. **Nota única (S/A/B/C) ou só breakdown por métrica?**
5. Analisar trailbraking.uk a fundo para a diferenciação sair de fato, não de snippet de busca.
