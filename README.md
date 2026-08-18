# Punta Taco

> Instrumento de treino de aplicação de pedal para sim racing: curva-alvo na timeline,
> traço realizado sobreposto, e métrica que diz exatamente onde a aplicação foi grosseira.

**smooth is fast**

Sim racer treina pedal *dentro* do sim, onde o feedback é indireto (tempo de volta, travou ou
não) e vem misturado com traçado, câmbio e setup. Aqui o pedal é isolado: uma curva-alvo, um
traço realizado, e números que apontam o erro. Ciclo de repetição de segundos, não de voltas.

**Status:** M0 — validando a captura de hardware. Escopo completo em [`escopo.md`](escopo.md).

---

## Rodando local

Não há build. A Gamepad API exige contexto seguro, e `localhost` conta — `file://` não.

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080` no Chrome ou Edge.

## Probe de hardware (M0)

`/probe/` mede, na sua pedaleira, o que decide a viabilidade da métrica central:

| Teste | Responde |
|---|---|
| Taxa efetiva | a leitura está presa ao refresh do monitor ou é independente dele? |
| Ruído em repouso | quanto de deadzone o hardware exige |
| Resolução | quantos bits úteis o eixo entrega — o limitante real do jerk |

O veredito combina os três e diz se o gate do M0 passa. Resultado sai como JSON copiável.

## Princípios técnicos

- **Compatibilidade acima de precisão.** Gamepad API como caminho principal — G29, MOZA SRP Lite
  e PXN funcionam sem trabalho por dispositivo. Assume monitor 60Hz como piso.
- **Sem build step.** ES modules servidos como estão; TypeScript entra como verificador via JSDoc
  (`npm run typecheck`), nunca como etapa de deploy. O site continua funcionando sem toolchain.
- **Sem dependência em runtime.** Nada de framework, nada de CDN. O que roda é o que está no repo.
- **Zero backend até o M2.** Rating, licença, aprovação e fantasma são 100% locais (IndexedDB).

## Roadmap

- [ ] **M0** — captura de input, calibração, traço ao vivo, diagnóstico de hardware *(gate)*
- [ ] **M1** — MVP local: 5 drills, métricas completas, rating, fantasma próprio, histórico
- [ ] **M2** — progressão: licença, drill do dia, ranking BR e global, editor de drill
- [ ] **M3** — consequência: modelo de aderência, travamento, o alvo deixa de ser explícito
- [ ] **M4** — telemetria importada, compartilhamento de drills

## Não-objetivos

Sem mecânica de rhythm game (combo, multiplicador, screen shake). Não é simulador de pista.
Não lê telemetria de iRacing/ACC no browser. Sem mobile, sem gamepad, sem XP cosmético.
O produto é bancada de medição, não arcade.

## Licença

MIT
