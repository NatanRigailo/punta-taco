# Medições de hardware

Cada pedaleira medida com `/probe/`. Este arquivo é o que sustenta as decisões de amostragem e
filtragem — e, mais adiante, a eventual segmentação do ranking por classe de hardware.

## PXN VD4 — 2026-08-18

Chrome 151, Windows 11, monitor 165Hz. Eixo 3 (freio).

| Medida | Valor |
|---|---|
| Taxa de report | ~46–52 Hz (p50 de 19,3 ms entre reports) |
| Regularidade | p90 e p99 em 2× e 3× do p50 — cadência fixa, sem instabilidade |
| Limitação | dispositivo/driver, não o rAF (que rodava a 165 Hz) |
| Resolução | 8,5–8,7 bits, degrau de ~0,25 % do curso, ~380 níveis |
| Ruído em repouso | zero — um único valor distinto em 5 s |
| Piso de ruído do jerk | ~6,6 curso/s² contra sinal típico de ~60 curso/s² |

**Veredito:** gate do M0 passa. Métricas de forma, chatter, linearidade e consistência são
sólidas. Jerk é utilizável, mas apenas como valor relativo ao histórico do próprio usuário.

### Consequências de projeto

1. **Amostrar em passo fixo de 20 ms, e nunca mais rápido.** O ruído de quantização no jerk
   escala com `degrau / dt²`: a 52 Hz o piso é ~6,6 curso/s², a 165 Hz sobe para ~75 — do
   tamanho do próprio sinal. Oversampling aqui destrói a métrica em vez de melhorá-la.
2. **Janela do filtro dimensionada pelo degrau medido**, não fixa no código.
3. **Granularidade de tempo é ~19 ms.** Erro de onset não pode ser exibido com precisão menor.
4. **Jerk nunca comparado entre perfis de hardware.**

### Efeito do filtro (medido depois, na #11)

O piso de ~6,6 curso/s² acima é o do **sinal cru** — um degrau de quantização aparecendo e
sumindo entre duas amostras. O Savitzky-Golay derruba isso bastante:

| Janela | Ganho de ruído na 2ª derivada | Piso do jerk na PXN |
|---|---|---|
| 5 pontos (100 ms) | 0,534 | 0,96 curso/s² |
| 7 pontos (140 ms) | 0,218 | 0,39 curso/s² |
| 9 pontos (180 ms) | 0,114 | 0,21 curso/s² |

Mas a janela **não** pode crescer à vontade, e o limite é fidelidade, não ruído. Contra um perfil
de jerk mínimo com onset de 250 ms — o formato que movimento humano de fato segue — o erro de
reconstrução da 2ª derivada cresce de forma monotônica:

| Janela | Erro no pico | RMSE |
|---|---|---|
| 5 pontos (100 ms) | −9 % | 6,3 |
| 7 pontos (140 ms) | −5 % | 12,1 |
| 9 pontos (180 ms) | +37 % | 18,1 |
| 11 pontos (220 ms) | +66 % | 22,5 |

Passando de 140 ms a janela vira uma fração grande do próprio evento medido e o ajuste cúbico
deixa de descrevê-lo. Daí o teto de 7 pontos: alargar continuaria melhorando o número de ruído
enquanto destrói o sinal — o que é pior que ruído, porque ainda produz um número de aparência
confiável.

**Para a PXN VD4 a janela escolhida é a mínima, 5 pontos**, com piso de 0,96 contra um sinal de
~60 a 90 curso/s². Margem de quase duas ordens de grandeza.

### Método — limitações conhecidas

- O polling do probe roda a ~212 Hz (`setTimeout` do Chrome trava em 4 ms), então a resolução da
  medida de intervalo é ~4,7 ms. A taxa real está entre 42 e 67 Hz; não dá para estreitar mais
  sem outro mecanismo de polling, e nenhuma decisão depende dessa precisão.
- `timestamp` e valor mudam juntos neste dispositivo, então as duas leituras não se distinguem.
  Em pedaleira com load cell o comportamento pode diferir — vale remedir.
