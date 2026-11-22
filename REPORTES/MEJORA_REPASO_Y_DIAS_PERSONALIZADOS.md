# INFORME DE IMPLEMENTACIÓN: INTERVALOS FIELES EN REPASO, BOTÓN "ELEGIR DÍAS" Y ALINEACIÓN DE AJUSTES

**Fecha:** 22 de noviembre de 2026  
**Proyecto:** Flashmente (`flashcards-app`)  
**Alcance:** Motor FSRS (`src/lib/fsrs/scheduler.ts`), Almacén de Tarjetas (`src/stores/useCardStore.ts`), Vistas de Estudio (`src/app/(dashboard)/study/[deckId]/page.tsx` y `src/app/(dashboard)/study/combined/page.tsx`) y Ajustes (`src/app/(dashboard)/settings/page.tsx`).  
**Garantías respetadas:** Modo Docente 100% intacto, Guía de Repaso y PDF intactos, cero coste extra en tokens de IA, cero cambios de esquema SQL en Supabase.

---

## 1. Diagnóstico y Solución a la Reaparición Prematura de Tarjetas

### 1.1. Corte de día a las `04:00 AM` local y salvaguarda de descanso nocturno (18h mínimas)
- **Problema previo:** `isCardDueForStudy()` consideraba elegibles todas las tarjetas cuyo `due` cayera antes de las `23:59:59.999` del día local actual (`dueDate <= endOfToday`). Al mismo tiempo, `applyShortTermGraduationSafeguards()` programaba los intervalos de `1d` sumando exactamente `+24h` desde el instante de repaso (`now.getTime() + 86400000`). Si un alumno estudiaba a las `22:30` y pulsaba `3 = Bien (1d)`, el `due` quedaba fijado a las `22:30` del día siguiente; al abrir la app a las `08:30` de la mañana siguiente, como `22:30 <= 23:59:59.999`, la tarjeta reaparecía tras solo **10 horas** de descanso.
- **Solución implementada en `src/lib/fsrs/scheduler.ts`:**
  1. **`getScheduledDayAnchor(now, addDays)`:** Todos los intervalos expresados en días (`>= 1d`) se anclan ahora al inicio de jornada de estudio (`04:00:00.000 AM` hora local) de la fecha objetivo (`now + addDays`), aplicando además un suelo mínimo de descanso real de `(safeDays * 24 - 6)` horas (mínimo **18 horas** reales para `1d`).
  2. **Guardia de descanso en `isCardDueForStudy()`:**
     - Si una tarjeta ya ha vencido (`due <= now`), entra inmediatamente (preservando al 100% los pasos intradía de `10m` y `3h`).
     - Si una tarjeta en `State.Review` vence más tarde dentro del día de hoy (`now < due <= endOfToday`), solo se adelanta a la sesión matutina si han transcurrido **al menos 18 horas** desde su `last_review` (`elapsedSinceLastReviewMs >= 18 * 60 * 60 * 1000`). Así se impide que una tarjeta repasada por la noche reaparezca a primera hora de la mañana siguiente.

### 1.2. Control de reinserción tras `1 = Otra vez` en la sesión activa
- **Problema previo:** En `/study/[deckId]` y `/study/combined`, al pulsar `1 = Otra vez (10m)`, `handleRate` ejecutaba incondicionalmente `setQueue((prev) => [...prev, result.updatedCard])`. Cuando quedaban 1–3 tarjetas en la cola, la tarjeta fallada volvía a salir en pantalla apenas **10–30 segundos después**, contradiciendo el intervalo de `10m` y generando bucles si se fallaba de nuevo.
- **Solución implementada en `/study/[deckId]/page.tsx` y `/study/combined/page.tsx`:**
  - Se calcula el colchón de tarjetas restantes por delante en la cola (`remainingAhead = queue.length - 1 - currentIndex`) y el número de reinserciones previas de esa tarjeta en la sesión (`requeuedCardIds[currentCard.id] || 0`).
  - La tarjeta fallada solo se reencola al final de la cola en memoria si existe un colchón suficiente (`remainingAhead >= 4`) y no ha sido ya reencolada en la misma sesión (`priorRequeues < 1`). En colas cortas o tras un segundo fallo, su intervalo persistido de `10m` en Supabase gobierna cuándo vuelve a estar vencida.

### 1.3. Protección de intervalos FSRS en el botón `"Repasar de nuevo"` al finalizar sesión
- **Problema previo:** Al terminar las tarjetas pendientes del día, el botón `"Repasar de nuevo"` cargaba `setQueue(allCards)` (incluyendo tarjetas ya graduadas con vencimiento a varios días o semanas vista) dentro del flujo normal que llamaba a `recordReview()`, sobrescribiendo en Supabase sus fechas `due` e intervalos reales.
- **Solución implementada en `/study/[deckId]/page.tsx` y `/study/combined/page.tsx`:**
  - El botón de fin de sesión activa ahora el **Modo Práctica Libre** (`isFreePracticeMode = true`), identificado visualmente como `"🛡️ Práctica libre (sin alterar intervalos)"` con insignia en la cabecera superior.
  - En este modo, el alumno puede repasar todas las tarjetas del mazo y usar el Tutor Socrático sin que `handleRate` ni `handleCustomDaysSelect` sobrescriban en Supabase las fechas `due` ni la estabilidad FSRS de tarjetas ya programadas para días futuros.
  - Además, en `/study/combined/page.tsx` se eliminó la segunda llamada redundante a `buildInterleavedCombinedQueue(loaded, deckIds)`, ya que `fetchCardsByDecks(deckIds)` entrega la cola intercalada lista.

---

## 2. Selector Manual `"📅 Elegir días..."` Durante el Repaso

### 2.1. Motor FSRS (`scheduleCustomDaysReviewWithLog`)
- Se añadió y exportó en `src/lib/fsrs/scheduler.ts` la función `scheduleCustomDaysReviewWithLog(card, customDays, reviewDate)`:
  - Sanea `customDays` en el rango `[1, 36500]`.
  - Calcula `due = getScheduledDayAnchor(reviewDate, safeDays)` (anclado a las `04:00 AM` local con salvaguarda de descanso).
  - Asigna `state = State.Review`, incrementa `reps + 1`, preserva `lapses` y ajusta `stability = Math.max(prevStability, safeDays)` para que en el siguiente ciclo FSRS los intervalos proyectados sean coherentes con los días elegidos por el alumno.
  - Genera el `reviewLog` compatible con la tabla `reviews` existente en Supabase (`rating = 3`, `scheduled_days = safeDays`), sin requerir migraciones SQL.

### 2.2. Acción en Store (`recordCustomDaysReview`) e Interfaz en Estudio
- En `src/stores/useCardStore.ts` se incorporó `recordCustomDaysReview(card, days)`, que persiste los nuevos parámetros en `cards`, inserta la fila de historial en `reviews` y actualiza el estado reactivo local.
- En `/study/[deckId]/page.tsx` y `/study/combined/page.tsx`, al revelar la respuesta, junto al botón `"📖 Guía: Aprende a puntuar"` aparece el botón `"📅 Elegir días..."`.
- Al pulsarlo se despliega un panel compacto con botones rápidos **`1d`**, **`2d`**, **`3d`**, **`5d`**, **`7d`**, **`14d`**, **`30d`** y un campo numérico libre (`Fijar`) para programar cualquier número de días a medida con un solo toque.

---

## 3. Alineación con `/settings` y Estabilidad No Regresiva en `Difícil (2)`

1. **Estabilidad no regresiva en `2 = Difícil (Hard)` para tarjetas en `State.Review`:**
   - En `applyShortTermGraduationSafeguards()` (`src/lib/fsrs/scheduler.ts`), cuando una tarjeta ya graduada (`State.Review` con `prevStability >= 1`) se califica con `2 = Difícil`, su estabilidad nunca retrocede por debajo de la estabilidad ya consolidada (`targetDays = Math.max(1, Math.round(Math.max(prevStability, scheduled.card.stability)))`), mientras que `3 = Bien` garantiza `>= prevStability + 1` y `4 = Fácil` garantiza `>= prevStability + 3`.
2. **Desbloqueo del intervalo máximo configurado en `/settings`:**
   - Se eliminó el tope fijo `MAX_REVIEW_INTERVAL_DAYS = 21` que ignoraba `customParams.maximum_interval`. Ahora `applyShortTermGraduationSafeguards()` respeta `userMaxInterval = Math.max(1, Math.round(customParams?.maximum_interval || 365))`.
   - En `src/app/(dashboard)/settings/page.tsx` se añadió el botón rápido **`Examen cercano (21d)`** junto a `1 mes`, `3 meses`, `6 meses` y `1 año`.
3. **Alineación del slider de Retención Deseada (`70% - 97%`):**
   - `sanitizeRequestRetention()` en `src/lib/fsrs/scheduler.ts` y el slider de `/settings` aceptan ahora de forma uniforme el rango **`0.70` a `0.97` (`70% – 97%`)**, evitando que valores altos de retención se recortaran silenciosamente a `0.95`.

---

## 4. Verificación Técnica

- `npx tsc --noEmit`: **0 errores**
- `npx eslint src/ --quiet`: **0 errores**
