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

### Método — limitações conhecidas

- O polling do probe roda a ~212 Hz (`setTimeout` do Chrome trava em 4 ms), então a resolução da
  medida de intervalo é ~4,7 ms. A taxa real está entre 42 e 67 Hz; não dá para estreitar mais
  sem outro mecanismo de polling, e nenhuma decisão depende dessa precisão.
- `timestamp` e valor mudam juntos neste dispositivo, então as duas leituras não se distinguem.
  Em pedaleira com load cell o comportamento pode diferir — vale remedir.
