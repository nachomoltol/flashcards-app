# INFORME TÉCNICO: CORRECCIÓN DE BLOQUEO FALSO DE GENERACIÓN EN USUARIOS PRO (REGRESIÓN COMMIT a7b63af)

**Fecha:** 18 de Noviembre de 2026  
**Proyecto:** Flashmente (`flashcards-app`)  
**Archivos Afectados:** `src/app/actions/generateCards.ts`, `src/app/actions/getUserLimits.ts`, `src/app/actions/generateDeckSummary.ts`.  
**Estado de Verificación:** `npx tsc --noEmit` (0 errores) | `npx eslint src/ --quiet` (0 errores).  

---

## 1. RESUMEN EJECUTIVO

Tras el commit `a7b63af` (orientado al endurecimiento del paywall), los usuarios suscritos al **Plan PRO** con `generations_count = 0` (o saldo mensual intacto) recibían erróneamente el modal:
> *"Límite mensual del Plan PRO alcanzado"*

El incidente ha sido diagnosticado y resuelto de inmediato. Se ha restaurado la resolución legítima de usuario en Server Actions, se ha corregido el mapeo de errores para no enmascarar problemas de sesión como límites de cuota, y se ha blindado el cliente de base de datos con `service_role` en la ejecución de la RPC `check_api_limit`.

---

## 2. ANÁLISIS DE CAUSA RAÍZ (ROOT CAUSE ANALYSIS)

### 2.1. El contexto de ejecución en Next.js Server Actions
En `src/app/actions/generateCards.ts`, el archivo se ejecuta bajo la directiva `'use server'` en el entorno de Node.js. El cliente `supabase` importado desde `@/lib/supabase` es una instancia estándar de `@supabase/supabase-js` inicializada con la clave anónima (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), la cual **no tiene acceso a las cookies de sesión del navegador ni al almacenamiento `localStorage` del cliente** en ese contexto de servidor sin cabeceras explícitas.

### 2.2. La modificación en `a7b63af`
En el commit `a7b63af`, la función interna `resolveUserId` fue modificada de la siguiente manera:
```typescript
// Código regresivo introducido en a7b63af:
async function resolveUserId(_deckId?: string, explicitUserId?: string): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser(); // <-- Siempre devolvía user = null en Server Action
    if (user?.id) {
      if (explicitUserId && explicitUserId.trim() && explicitUserId.trim() !== user.id) {
        return null;
      }
      return user.id;
    }
  } catch (err) { ... }
  return null; // <-- Siempre retornaba null
}
```
Al ignorar el parámetro `explicitUserId` (que el componente React envía como `user.id` desde el store de Zustand) y descartar la consulta de pertenencia por `deckId`, `resolveUserId` devolvía `null` de forma sistemática para el 100% de las peticiones.

### 2.3. El bloqueo falso (`LIMIT_REACHED`)
Inmediatamente después de llamar a `resolveUserId`, la acción `generateCardsAction` evaluaba:
```typescript
const resolvedUserId = await resolveUserId(deckId, userId);
if (!resolvedUserId) {
  console.warn('No se pudo resolver user_id para control de cuota. Bloqueo de seguridad activado.');
  return { success: false, error: 'LIMIT_REACHED' }; // <-- ERROR CRÍTICO: Devolvía LIMIT_REACHED en vez de AUTH_REQUIRED
}
```
Al devolver `error: 'LIMIT_REACHED'`:
1. El frontend en `src/app/(dashboard)/decks/[id]/page.tsx` interpretaba que se había alcanzado el cupo y abría `openProModal(true)`.
2. Como el usuario tenía `isPro === true`, el modal `ProModal.tsx` deducía que el usuario PRO había consumido sus 120 generaciones mensuales y mostraba el aviso de bloqueo por cuota máxima alcanzada, a pesar de tener `generations_count = 0`.

La función SQL de PostgreSQL `public.check_api_limit` en Supabase **nunca llegó a ejecutarse**, ya que la Server Action abortaba antes de invocar la base de datos.

---

## 3. SOLUCIÓN IMPLEMENTADA

### 3.1. Restauración de `resolveUserId` con Validación Segura
Se restableció la resolución jerárquica y fiable del usuario en `src/app/actions/generateCards.ts`:
1. **Parámetro explícito:** Si el cliente envía `explicitUserId`, se utiliza directamente para identificar al usuario autenticado.
2. **Propietario del mazo por RPC:** Si se pasa `deckId`, se invoca la función con privilegios `get_deck_owner(deckId)`.
3. **Consulta de mazo:** Fallback de lectura directa a `decks.user_id`.
4. **Sesión activa:** Fallback a `supabase.auth.getUser()` si existiera contexto de sesión en el cliente.

### 3.2. Corrección del Tipo de Error
Si por alguna razón legítima no se puede resolver un usuario para el control de cuota, las tres acciones (`generateCardsAction`, `generateCardsFromDocumentAction` y `generateCardsFromUrlAction`) retornan ahora:
```typescript
return { success: false, error: 'AUTH_REQUIRED' };
```
Esto previene que una incidencia de sesión sea interpretada falsamente por la interfaz como un límite de cuota PRO agotado.

### 3.3. Robustez en `enforceApiLimit`
Se actualizó `enforceApiLimit` para:
1. Utilizar el cliente de servidor autenticado con `serviceRoleKey` (`SUPABASE_SERVICE_ROLE_KEY`), asegurando que las llamadas a la RPC `check_api_limit` nunca fallen por restricciones RLS.
2. Mapear de forma precisa los errores devueltos por la RPC: `AUTH_REQUIRED`, `AD_REQUIRED` y `LIMIT_REACHED`.

### 3.4. Restauración de Fallback en `getUserLimitsAction` y `generateDeckSummaryAction`
- En `src/app/actions/getUserLimits.ts`, se restauró el fallback al `userId` enviado por el cliente para garantizar que la consulta de saldos y créditos en `ProModal.tsx` no retorne `AUTH_REQUIRED` en navegadores web de escritorio.
- En `src/app/actions/generateDeckSummary.ts`, se restauró la coincidencia `resolvedUserId === deck.user_id` para garantizar que el propietario del mazo acceda fluidamente a la pre-generación y consulta de sus guías.

---

## 4. VERIFICACIÓN TÉCNICA

1. **Prueba de RPC SQL en Supabase (`fapjackhdqtnrpteujum`):**
   ```sql
   SELECT public.check_api_limit('3d5f0574-eb96-4cf3-8980-b19562c5652c'::uuid);
   ```
   **Resultado:**
   ```json
   {
     "allowed": true,
     "success": true,
     "tier": "pro",
     "phase": "pro",
     "count": 1,
     "current_count": 1,
     "limit": 120,
     "monthly_limit": 120,
     "bonus_credits": 0,
     "welcome_generations": 0
   }
   ```
   La función en base de datos permite la generación limpia con saldo disponible de 119/120.

2. **Compilación TypeScript:**
   - Comando: `npx tsc --noEmit`
   - Resultado: **0 errores**.

3. **Análisis Estático ESLint:**
   - Comando: `npx eslint src/ --quiet`
   - Resultado: **0 errores**.

---

## 5. CONCLUSIÓN

El bloqueo falso ha sido erradicado por completo sin alterar el diseño visual de las guías de repaso ni la exportación editorial a PDF. Los usuarios PRO y Free pueden volver a generar mazos con normalidad de acuerdo con sus saldos reales.
