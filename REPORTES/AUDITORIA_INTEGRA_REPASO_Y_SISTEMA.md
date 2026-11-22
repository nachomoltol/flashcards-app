# AUDITORÍA ÍNTEGRA: INTERVALOS DE REPASO, DUPLICADOS, INCONGRUENCIAS DEL SISTEMA Y VIABILIDAD DE INTERVALOS PERSONALIZADOS

**Fecha de auditoría:** 22 de Noviembre de 2026  
**Modo de ejecución:** Estrictamente Solo Lectura (0 modificaciones en código, prompts, esquemas o repositorio)  
**Archivos auditados:**
- `src/lib/fsrs/scheduler.ts` y `src/lib/fsrs/roundRobin.ts`
- `src/lib/cardDeduplication.ts` y `src/lib/cardUtils.ts`
- `src/app/(dashboard)/study/[deckId]/page.tsx` y `src/app/(dashboard)/study/combined/page.tsx`
- `src/app/(dashboard)/panic/[deckId]/page.tsx` y `src/app/(dashboard)/exam/[deckId]/page.tsx`
- `src/app/(dashboard)/decks/[id]/page.tsx` y `src/app/(dashboard)/settings/page.tsx`
- `src/stores/useCardStore.ts`, `src/stores/useDeckStore.ts`, `src/stores/useSettingsStore.ts`
- `src/app/actions/generateCards.ts`, `src/app/actions/generateCardsFromNotes.ts`, `src/app/actions/socraticTutor.ts`

---

## 1. PROGRAMACIÓN DE REPASO Y REAPARICIÓN TEMPRANA DE TARJETAS

La inspección forense del motor de planificación (`src/lib/fsrs/scheduler.ts`) y de las vistas de estudio (`/study/[deckId]` y `/study/combined`) revela **6 causas exactas en el código** por las que las tarjetas vuelven a aparecer mucho antes de lo que el usuario espera:

### 1.1. CAUSA CRÍTICA 1: La "Escalera Hardcodeada con Tope de 21 Días" que aplasta los intervalos y la estabilidad de FSRS (`src/lib/fsrs/scheduler.ts`, líneas 352–443)
- **Qué ocurre en el código:**
  Después de que la librería `ts-fsrs` calcula matemáticamente el intervalo óptimo según la curva de olvido del alumno (`engine.next(fsrsCard, now, rating)` en la línea 521), la función `applyShortTermGraduationSafeguards()` ejecuta un bloque (líneas 354–443) que **sobreescribe por la fuerza tanto los días programados (`scheduled_days` y `due`) como la estabilidad (`stability`)** en función únicamente del contador `reps`:
  - **1.ª vez (`nextReps <= 1`):** `Difícil (2)` = **1 día fijo** | `Correcto (3)` = **2 días fijos** | `Fácil (4)` = **4 días fijos**.
  - **2.ª vez (`nextReps === 2`):** `Difícil (2)` = **2 días fijos** | `Correcto (3)` = **3 a 4 días máx.** | `Fácil (4)` = **5 a 7 días máx.**
  - **3.ª vez (`nextReps === 3`):** `Difícil (2)` = **3 días fijos** | `Correcto (3)` = **6 a 8 días máx.** | `Fácil (4)` = **9 a 12 días máx.**
  - **4.ª vez (`nextReps === 4`):** `Difícil (2)` = **5 días fijos** | `Correcto (3)` = **10 a 14 días máx.** | `Fácil (4)` = **15 a 18 días máx.**
  - **5.ª vez o más (`nextReps >= 5`):** `Difícil (2)` = **5 a 7 días máx.** | `Correcto (3)` = **12 a 18 días máx.** | `Fácil (4)` = **16 a 21 días máx. (Tope absoluto perpetuo de 21 días).**
- **Efectos adversos directos:**
  1. **Compresión artificial de intervalos:** Aunque una tarjeta sea facilísima y el usuario pulse `Correcto (3)` o `Fácil (4)` varias veces seguidas, el sistema **jamás permite que pase de 18 días (en Correcto) o 21 días (en Fácil)**.
  2. **Castigo retroactivo al pulsar `Difícil (2)`:** Si una tarjeta ya iba por un intervalo de 12 o 15 días (porque antes se calificó como `Fácil`) y en la 3.ª o 4.ª revisión el usuario acierta pero pulsa `Difícil (2)`, la escalera hardcodeada le fuerza `maxAllowedDays = 3` o `5` días y **sobrescribe su `stability` a 3 o 5** (línea 432), haciéndola retroceder como si hubiera fallado.
  3. **Corrupción de `nextReps` tras un fallo (`Again = 1`):** En FSRS, cuando el usuario falla una tarjeta (`rating = 1`), la propiedad `reps` **no se reinicia a 0** (sigue valiendo 4, 5, 6..., mientras que `lapses` sube en 1). Cuando esa tarjeta sale de `Relearning`, la escalera lee `nextReps = 5` y salta directamente al tramo de 12–18 días en lugar de graduarse progresivamente tras el olvido.

### 1.2. CAUSA CRÍTICA 2: El recorte de hasta casi 24 horas por el cruce entre `now + N * 24h` y `getEndOfLocalDay(now)` (`scheduler.ts`, líneas 110–145 y 431)
- **Qué ocurre en el código:**
  - Al programar una tarjeta para dentro de `N` días (ej. `1 día` o `2 días`), la línea 431 calcula la fecha sumando múltiplos exactos de 24 horas a la hora actual:
    ```ts
    const adjustedDue = new Date(now.getTime() + targetDays * MS_PER_DAY);
    ```
  - Sin embargo, al comprobar qué tarjetas deben salir hoy, `isCardDueForStudy()` (líneas 139–145) compara la fecha `due` de todas las tarjetas en `State.Review` contra **las `23:59:59.999` de hoy (`getEndOfLocalDay(now)`)**:
    ```ts
    const endOfTodayTime = getEndOfLocalDay(now).getTime(); // Hoy a las 23:59:59.999
    return dueTime <= endOfTodayTime;
    ```
- **Por qué hace que las tarjetas reaparezcan mucho antes de cumplir las 24h o 48h:**
  - Si un estudiante repasa el **lunes a las 22:30 (10:30 PM)** y califica una tarjeta con `1d` (`Difícil`), su `due` queda fijado para el **martes a las 22:30**.
  - Si el estudiante abre la app el **martes a las 08:30 de la mañana (solo 10 horas después)**, `isCardDueForStudy` evalúa `martes 22:30 <= martes 23:59:59.999` -> **`TRUE`**. ¡La tarjeta de "1 día" vuelve a salir **a las 10 horas**!
  - Del mismo modo, una tarjeta calificada con `2d` (`Correcto`) el lunes a las 23:00 vuelve a salir el miércoles a las 08:00 de la mañana (**solo 33 horas después**, poco más de 1 día real).

### 1.3. CAUSA ALTA 3: Reinserción inmediata en la misma sesión al pulsar `1 = Fallo (Again)` sin esperar los 10 minutos (`study/[deckId]/page.tsx`, líneas 221–223)
- **Qué ocurre en el código:**
  El botón `1 = Fallo` muestra en pantalla una píldora con el intervalo **`10m`** (`learning_steps: ['10m']`). Sin embargo, al pulsarlo, `handleRate()` ejecuta inmediatamente:
  ```ts
  if (result && result.isAgain) {
    setQueue((prev) => [...prev, result.updatedCard]);
  }
  ```
- **Consecuencia:** La tarjeta se pega al final del array `queue` de la sesión actual en memoria sin comprobar si han transcurrido los 10 minutos. Si al alumno le quedaban 1, 2 o 3 tarjetas para terminar la cola, la tarjeta fallada **reaparece entre 10 y 40 segundos después** dentro de la misma tanda.

### 1.4. CAUSA ALTA 4: El botón `"Repasar de nuevo"` en la pantalla final carga el 100% del mazo ignorando las fechas FSRS (`study/[deckId]/page.tsx`, línea 644, y `study/combined/page.tsx`, línea 671)
- **Qué ocurre en el código:**
  Cuando el usuario termina las tarjetas pendientes del día y llega a la pantalla de trofeo (*Zero Inbox*), el primer botón que se le ofrece es **"Repasar de nuevo"**, cuyo `onClick` ejecuta:
  ```ts
  onClick={() => {
    setQueue(allCards); // <-- Carga TODAS las tarjetas del mazo sin filtrar por isCardDueForStudy
    setCurrentIndex(0);
    ...
  }}
  ```
- **Consecuencia:** A diferencia del *Modo Pánico* (que repasa en memoria sin tocar FSRS), este botón mete **todas las tarjetas del mazo —incluidas las que acaban de programarse para dentro de 2, 4, 8 o 14 días—** de vuelta en el motor FSRS activo. El usuario vuelve a ver inmediatamente las preguntas que acaba de contestar hace 2 minutos y, al puntuarlas, **machaca y altera sus intervalos y contadores `reps` en Supabase**.

### 1.5. CAUSA MEDIA 5: El paso intradía de `3 horas` en tarjetas nuevas calificadas como `Difícil (2)` + Prioridad `FreshFirst` (`scheduler.ts`, líneas 164–192 y 274–280)
- Cuando una tarjeta nueva se califica como `Difícil (2)`, la línea 277 fija `due = now + 3 horas` y mantiene la tarjeta en `State.Learning (1)`.
- Si el usuario cierra la sesión por la mañana y vuelve a entrar al mazo por la tarde (pasadas 3 horas), `isCardDueForStudy` las detecta como vencidas (`dueTime <= now.getTime()`) y `compareDueReviewsFreshFirst()` (líneas 164–192) **coloca las tarjetas estudiadas hoy/ayer en primera posición de la cola**, por delante de cualquier tarjeta pendiente más antigua o nueva. Para el alumno que entra por la tarde a estudiar tarjetas nuevas, las primeras preguntas que le salen son las mismas que ya vio esa misma mañana.

---

## 2. AUDITORÍA DE PREGUNTAS REPETIDAS O CASI DUPLICADAS EN UN MISMO MAZO

A veces el usuario siente que "le vuelve a salir la misma pregunta antes de tiempo" no porque sea el mismo `card.id`, sino porque **existen 2 o 3 tarjetas distintas en el mazo que preguntan exactamente el mismo hecho con palabras ligeramente diferentes**. La auditoría de `src/lib/cardDeduplication.ts` y `src/app/actions/generateCards.ts` identifica **4 brechas exactas** por las que se cuelan estos cuasi-duplicados:

### 2.1. BRECHA CRÍTICA 1: `hasDistinctEvaluatedSubject` y `hasDistinctEvaluatedFact` se activan con 1 sola palabra diferente (`cardDeduplication.ts`, líneas 219–288)
- **Cómo está programado hoy:**
  Ambas funciones extraen los tokens de `>= 3` letras (que no estén en `STOP_WORDS`) de dos tarjetas A y B, y concluyen que evalúan "sujetos distintos" o "hechos distintos" si:
  ```ts
  return uniqueToA.length >= 1 && uniqueToB.length >= 1;
  ```
- **Por qué falla en la práctica:**
  Basta con que dos preguntas clónicas sobre el mismo hecho usen **un único sinónimo no incluido en `STOP_WORDS`** (ej. Tarjeta A: *"¿Qué hormona estimula la contracción biliar?"* vs. Tarjeta B: *"¿Qué hormona provoca el vaciamiento de la vesícula?"* -> `uniqueToA: ['estimula', 'contraccion']`, `uniqueToB: ['provoca', 'vaciamiento']`) para que `distinctSubject` y `distinctFact` devuelvan **`true`**.
- **Efecto en cascada:**
  1. En el **Filtro Léxico** (líneas 503–511, 537–552, 663–671 y 697–712), las reglas principales exigen `!distinctSubject && !distinctFact`, por lo que **quedan desactivadas**.
  2. En el **Filtro Semántico Vectorial (`gemini-embedding-001`)** (líneas 820–827), el hecho de que `distinctSubject || distinctFact` sea `true` **eleva el umbral de corte coseno hasta `0.95` o `0.97` en Modo Exhaustivo** (y `0.92` en Modo Normal). Dos preguntas parafraseadas que evalúan el mismo dato suelen tener una similitud vectorial de entre `0.86` y `0.93`, por lo que **ambas superan el filtro y se guardan en el mazo**.

### 2.2. BRECHA ALTA 2: El cortocircuito `hasClearlyDistinctAnswers` en preguntas tipo Test x4 (`cardDeduplication.ts`, líneas 474–497 y 635–659)
- En formato `basic` o `cloze`, la respuesta nuclear suele ser de 1 o 2 palabras (ej. `"Colecistoquinina"`), lo que hace fácil detectar `sameCoreAnswer = true`.
- Pero en **`multiple_choice` (Test x4)**, la respuesta nuclear extraída de `back` es una oración larga (ej. *"Disminuir la tensión superficial alveolar para evitar el colapso pulmonar"* vs. *"Evitar el colapso de los alvéolos reduciendo su tensión superficial durante la espiración"*).
- Al tener palabras distintas, su Jaccard léxico es `< 0.35`, lo que activa `hasClearlyDistinctAnswers = true` (línea 474) y ejecuta en la línea 495:
  ```ts
  } else if (hasClearlyDistinctAnswers && jaccard < 0.88) {
    isDuplicate = false; // <-- Cortocircuito: da por hecho que no son duplicadas
  }
  ```

### 2.3. BRECHA MEDIA 3: *Concurrent Batching* a ciegas en lotes de 20 o más tarjetas (`generateCards.ts`, líneas 1757–1844 y 3779–3874)
- Cuando el usuario solicita `20`, `25`, `30` o `40` tarjetas desde un Tema o desde Audio/TXT, el backend divide la petición en **2 llamadas simultáneas (`Promise.allSettled`)** a Gemini.
- Como ambas llamadas corren en paralelo, la Llamada 2 no sabe qué preguntas está redactando la Llamada 1 en ese mismo segundo. En temas donde definición, fisiopatología, diagnóstico y tratamiento están entrelazados, ambos lotes generan preguntas solapadas que, si están redactadas con distinta estructura sintáctica, superan el umbral vectorial de `0.94–0.97`.

### 2.4. BRECHA MEDIA 4: Desglose forzado de las 4 Dimensiones sobre conceptos simples (`FACTUAL_INVENTORY_DIRECTIVE`)
- En Modo Estudio y Modo Exhaustivo, el prompt obliga a buscar para cada entidad sus 4 dimensiones (`1_identidad_definicion`, `2_funcion_mecanismo`, `3_origen_fuente_requisitos`, `4_consecuencia_falla_limite`) y exige relación 1 a 1 (`1 ítem del inventario = 1 tarjeta`).
- Cuando el texto fuente solo dedica 2 líneas a un concepto (donde su definición *es* su función), el modelo genera una tarjeta para `1_identidad_definicion` y otra para `2_funcion_mecanismo` sobre esa misma frase, produciendo dos tarjetas hermanas en la misma página.

---

## 3. AUDITORÍA GENERAL DEL SISTEMA: QUÉ FUNCIONA BIEN VS. QUÉ FLOJEA O TIENE INCONGRUENCIAS

### 3.1. Qué está sólido y funciona muy bien
1. **Blindaje de Seguridad, Suscripciones y Guías de Estudio (`generateDeckSummary.ts`, `deck_summaries`, `api_limits`, `device_limits`):**
   - El aislamiento del contenido completo de las guías en `public.deck_summaries`, la verificación de expiración `current_period_end` en cuentas PRO y el escudo anti-multicuentas por hardware (`device_limits`) en los flujos principales están bien estructurados y son atómicos.
2. **Reconciliador Determinista de Opciones + Barajado Fisher-Yates (`generateCards.ts` y `cardUtils.ts`):**
   - La etiqueta `VEREDICTO_EXACTO` combinada con el puntuador léxico evita desajustes entre la explicación y la letra marcada como correcta, y `randomizeMultipleChoiceCard()` garantiza distribución uniforme de `a, b, c, d`.
3. **Aislamiento del Modo Pánico (`/panic/[deckId]`) y Simulacro (`/exam/[deckId]`):**
   - Ambos modos operan en solo lectura respecto a FSRS, permitiendo entrenar bajo presión o repasar exclusivamente los fallos del último simulacro (`mode=exam_errors`) sin distorsionar la programación espaciada.
4. **Tutor Socrático Post-Fallo (`socraticTutor.ts` y `SocraticTutorDrawer.tsx`):**
   - Flujo ágil, empático, bien acotado en tokens (`maxOutputTokens: 260`) y con validación de sesión tanto por cookies como por JWT de Capacitor.
5. **Exportación e Impresión PDF (`QuickStudyGuideModal.tsx` y `PrintExamSheet.tsx`):**
   - Maquetación limpia, con numeración de página y marca corporativa fija en el margen inferior.

---

### 3.2. Qué flojea o presenta incongruencias técnicas / de UX

#### INCONGRUENCIA 1 (ALTA): Desalineación total entre la Pantalla de Configuración (`/settings`) y el Motor FSRS (`scheduler.ts`)
- **En `/settings` (`src/app/(dashboard)/settings/page.tsx`):**
  1. El usuario puede mover el slider de **Retención Deseada** hasta el **`99%` (`0.99`)** y al ponerlo entre `93%` y `99%` la UI le muestra un cartel verde/índigo: *"🔥 Alta exigencia: Ideal para exámenes de alta densidad..."* (líneas 259–291).
     - **Realidad en el backend/motor (`scheduler.ts`, línea 86):** `sanitizeRequestRetention()` considera inválido cualquier valor `> 0.95` y **lo resetea silenciosamente a `0.90` (90%)** (e incluso `useSettingsStore.ts` en las líneas 110–115 sobreescribe la base de datos a `0.90` la próxima vez que carga).
  2. En `/settings`, el usuario tiene un selector numérico y botones preset para **Intervalo Máximo (Días)**: `6 meses (180d)`, `1 año (365d)`, `3 años (1095d)`, `10 años (3650d)`, `Sin límite (36500d)` (líneas 299–344).
     - **Realidad en el motor (`scheduler.ts`, líneas 357 y 414–424):** La escalera hardcodeada fija `maxAllowedDays = 21` (y `18` para `Good`), aplicando `Math.min(21, customParams.maximum_interval)`. Por tanto, **cualquier configuración del usuario entre 22 y 36.500 días es completamente ignorada**.

#### INCONGRUENCIA 2 (ALTA): `generateCardsFromNotes.ts` (Fotos de Apuntes) no aplica el escudo `device_limits`, usa límites antiguos y es *fail-open*
- En `src/app/actions/generateCardsFromNotes.ts` (líneas 231–289 y 507–509):
  1. Invoca `supabase.rpc('check_api_limit', { p_user_id: userId })` y `increment_api_generation` **sin pasar `p_device_id`, `p_is_admin_email` ni `p_is_test_device`**, por lo que las generaciones desde fotos de apuntes no registran ni validan el límite por dispositivo físico ni las listas blancas de entorno.
  2. Su bloque fallback (línea 278) comprueba `if (count >= 50)` en lugar del esquema vigente (`5 bienvenida + 25 anuncios = 30`).
  3. En caso de excepción al consultar la cuota (líneas 285–288), devuelve `return { allowed: true }` (*fail-open*), a diferencia de `generateCards.ts` que bloquea por seguridad (*fail-closed*).
  4. Inserta las tarjetas directamente en Supabase desde el servidor (línea 498) en vez de devolverlas al store del cliente como hacen los demás generadores.

#### INCONGRUENCIA 3 (MEDIA): Doble ejecución de `buildInterleavedCombinedQueue` y llamada extra a Embeddings en PDF/DOCX
1. **Doble barajado en Estudio Combinado:** `useCardStore.fetchCardsByDecks()` (línea 126) ya ejecuta `buildInterleavedCombinedQueue(loadedCards, deckIds)` antes de devolver los datos, y `src/app/(dashboard)/study/combined/page.tsx` (línea 151) vuelve a llamar a `buildInterleavedCombinedQueue(loaded, deckIds)` sobre el resultado ya entrelazado.
2. **Doble llamada a `gemini-embedding-001` al final del bucle PDF/DOCX:** En `generateCards.ts` (líneas 2953–2963 y 3671–3681), tras haber deduplicado cada página contra `accumulatedHistory` (que ya contenía `existingCards`), se vuelve a ejecutar `deduplicateCandidateCards` de todas las `tarjetasAcumuladas` contra `existingCards`, consumiendo tiempo y llamadas extra a la API de embeddings sin necesidad.

#### INCONGRUENCIA 4 (BAJA): `createInitialCardValues()` inicializa `last_review` con la fecha actual en lugar de `null`
- En `src/lib/fsrs/scheduler.ts` (línea 609), `createInitialCardValues()` devuelve `last_review: now.toISOString()`. Aunque `useCardStore.ts` lo corrige pasando `last_review: null` al insertar, `generateCardsFromNotes.ts` (línea 491) también tiene que forzar `last_review: null` manualmente para que la tarjeta nueva no nazca con fecha de última revisión.

---

## 4. VIABILIDAD TÉCNICA DE "ELEGIR DÍAS HASTA EL PRÓXIMO REPASO" Y PROPUESTAS DE MEJORA (SIN APLICAR)

### 4.1. Evaluación Técnica: Permitir al usuario elegir cuántos días deben pasar hasta volver a ver una tarjeta

- **Veredicto de Viabilidad:** **100% VIABLE, SENCILLO Y SIN MIGRACIONES DE BASE DE DATOS.**
- **Por qué encaja de forma nativa con Supabase y FSRS:**
  - La tabla `public.cards` ya almacena `due` (timestamp ISO), `stability` (float), `difficulty` (float), `state` (int), `reps` (int) y `last_review` (timestamp ISO).
  - En la formulación matemática de FSRS v5, la **Estabilidad ($S$)** se define exactamente como el número de días que tarda la probabilidad de recuerdo ($R$) en caer al $90\%$ ($R = 0.90 \Rightarrow I = S$).
  - Por tanto, si el usuario elige manualmente que quiere volver a ver una tarjeta dentro de **$N$ días** (por ejemplo: `1d`, `3d`, `7d`, `14d`, `30d` o un número personalizado):
    1. Se calcula `due` = inicio del día local `now + N días` (normalizado a las `04:00 AM` para evitar el recorte de horas nocturnas).
    2. Se actualiza `stability = N` (o una mezcla ponderada con su estabilidad previa), `state = State.Review (2)` y `reps = (card.reps || 0) + 1`.
    3. Se guarda el log en `public.reviews` para que cuente en la racha diaria y estadísticas del alumno.
    4. Cuando pasen esos $N$ días y la tarjeta vuelva a salir, **el motor FSRS continuará calculando los siguientes intervalos con total coherencia matemática** a partir de $S = N$.

#### Cómo integrarlo en la experiencia de usuario (2 niveles complementarios):
1. **En la barra inferior de estudio (`/study/[deckId]` y `/study/combined` al revelar la respuesta):**
   - Mantener los 4 botones rápidos FSRS (`1: Fallo`, `2: Difícil`, `3: Correcto`, `4: Fácil`) para quien estudia con un solo clic, y añadir justo debajo o junto a *"📖 Guía: Aprende a puntuar"* una píldora discreta **`📅 Elegir días...`** que despliegue en un toque chips rápidos (`1d`, `2d`, `3d`, `5d`, `7d`, `14d`, `30d`, `+ Custom`).
2. **En Configuración (`/settings`) o Modo de Espaciado:**
   - Permitir elegir entre **"Modo Examen Cercano (Escalera compacta hasta 21 días)"** (el comportamiento actual para quien se examina en 2–3 semanas) y **"Modo FSRS Estándar a Largo Plazo (Hasta 365+ días)"** (que libera el tope de 21 días y respeta el `maximum_interval` elegido por el usuario).

---

### 4.2. Hoja de Ruta de Propuestas de Mejora (Ordenadas por Impacto, Sencillez y Bajo Riesgo)

| Prioridad | Propuesta de Mejora | Archivos Afectados | Impacto y Beneficio | Riesgo / Coste en Tokens |
| :---: | :--- | :--- | :--- | :--- |
| **1 (Alta)** | **Normalizar `due` en días al inicio del día (`04:00 AM` local) + Respetar `10m` en `Again (1)`** | `src/lib/fsrs/scheduler.ts`, `src/app/(dashboard)/study/[deckId]/page.tsx`, `src/app/(dashboard)/study/combined/page.tsx` | Evita que una tarjeta de `1d` estudiada a las 22:30 reaparezca a las 08:30 de la mañana siguiente (10h después). En `Again (1)`, solo reinsertar la tarjeta en la sesión activa si aún quedan tarjetas o mostrarla al final real sin bucle instantáneo, y corregir el botón *"Repasar de nuevo"* de fin de sesión para que redirija a Modo Pánico o avise antes de sobreescribir FSRS. | **Riesgo Bajo / 0 tokens.** No toca IA ni Modo Docente. |
| **2 (Alta)** | **Opción interactiva `"📅 Elegir días"` en la tarjeta + Desbloqueo de `maximum_interval` en FSRS** | `src/lib/fsrs/scheduler.ts`, `src/stores/useCardStore.ts`, `src/app/(dashboard)/study/[deckId]/page.tsx`, `src/app/(dashboard)/settings/page.tsx` | Da control total al alumno para fijar en cuántos días (`1d`, `3d`, `7d`, `14d`, `30d` o libre) quiere volver a ver cualquier tarjeta, impide que `Hard (2)` reduzca una estabilidad mayor ya ganada, y alinea `/settings` con `scheduler.ts` (tope del slider de retención en `95%` y respeto del intervalo máximo). | **Riesgo Bajo / 0 tokens.** Sin cambios en tablas de Supabase. |
| **3 (Media)** | **Endurecer el detector de cuasi-duplicados en Test x4 (`hasDistinctEvaluatedFact` y `hasClearlyDistinctAnswers`) + Eliminar 2.º pase redundante de embeddings** | `src/lib/cardDeduplication.ts`, `src/app/actions/generateCards.ts` | Exigir al menos 2 tokens sustantivos distintos (o no desactivar la capa vectorial cuando las opciones de test estén parafraseadas) sin recortar el volumen de Modo Exhaustivo, y eliminar la segunda llamada duplicada a `deduplicateCandidateCards` al final del bucle PDF/DOCX (líneas 2953 y 3671). | **Riesgo Bajo / Ahorra llamadas a `gemini-embedding-001` y reduce latencia.** |
| **4 (Media)** | **Unificar control de cuotas y `device_limits` en `generateCardsFromNotes.ts`** | `src/app/actions/generateCardsFromNotes.ts` | Pasa `deviceId` y listas blancas al RPC `check_api_limit` / `increment_api_generation` en el flujo de fotos de apuntes y cierra el fallback *fail-open*. | **Riesgo Bajo / 0 tokens.** Cierra una brecha de consistencia de cuotas. |
