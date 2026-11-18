# INFORME TÉCNICO: ESCUDO ANTI-MULTICUENTAS POR DISPOSITIVO (`device_limits`) Y LISTAS BLANCAS VERCEL

**Fecha y Hora:** 18 de Noviembre de 2026 - 10:22 UTC  
**Proyecto:** Flashmente (`flashcards-app`)  
**Base de Datos Supabase:** `fapjackhdqtnrpteujum`  
**Migración:** `supabase/migrations/20261118103000_device_limits_and_anti_multiaccount_shield.sql`  
**Estado de Verificación:** `npx tsc --noEmit` (**0 errores**) & `npx eslint src/ --quiet` (**0 errores**)

---

## 1. RESUMEN EJECUTIVO

Se ha implementado con éxito el **Escudo Anti-Multicuentas por Dispositivo Físico** en Flashmente, blindando la plataforma contra la creación abusiva de cuentas múltiples para evadir los límites del modelo Freemium (5 bienvenida + hasta 25 con anuncios = 30 generaciones/mes Free; 3 guías de estudio/mes Free; y 120 generaciones/mes PRO).

El sistema vincula cada hardware físico mediante identificadores persistentes (`native_<id>` en Android/iOS y `web_<uuid>` en navegadores web), controlando el uso acumulado en la nueva tabla `public.device_limits` y auditando el historial de cuentas vinculadas a cada dispositivo en `public.user_devices`.

Asimismo, se han integrado **listas blancas de alta prioridad configurables mediante variables de entorno de Vercel**, permitiendo acceso ilimitado sin consumo a administradores y excluyendo dispositivos de prueba de los bloqueos de cuota.

---

## 2. COMPONENTES Y ARQUITECTURA TÉCNICA

### 2.1. Identificador Persistente de Dispositivo (`src/lib/deviceId.ts`)
- **Entorno Móvil Nativo (Capacitor Android / iOS):**
  - Utiliza el plugin oficial `@capacitor/device` -> `Device.getId()`.
  - En Android extrae el identificador de hardware de 64 bits (`ANDROID_ID`) y en iOS el `identifierForVendor`.
  - Formato generado: `native_<id>` (ej. `native_ee01f3de145f466b`).
- **Entorno Web / PWA / Safari iOS:**
  - Genera un UUID estándar v4 estable (`crypto.randomUUID()`).
  - Persiste el valor con doble anclaje: `localStorage` (`flashmente_device_id`) + Cookie de larga duración (`max-age=315360000`, 10 años, `SameSite=Lax`).
  - Formato generado: `web_<uuid>`.
- **Rendimiento:** Cuenta con almacenamiento en memoria en tiempo de ejecución (`inMemoryDeviceId`), haciendo que las llamadas subsecuentes en el ciclo de vida del cliente sean inmediatas (0 ms).

### 2.2. Tablas Seguras en Supabase PostgreSQL

1. **`public.device_limits`:**
   - `device_id TEXT PRIMARY KEY`: Identificador físico único.
   - `welcome_generations_used INT NOT NULL DEFAULT 0`: Generaciones de bienvenida consumidas en este hardware.
   - `generations_count INT NOT NULL DEFAULT 0`: Generaciones mensuales totales realizadas por cuentas Free en este dispositivo.
   - `guides_unlocked_this_month INT NOT NULL DEFAULT 0`: Guías de estudio desbloqueadas este mes en este dispositivo.
   - `reset_at TIMESTAMPTZ NOT NULL`: Fecha del próximo reinicio mensual (`date_trunc('month', NOW()) + INTERVAL '1 month'`).
   - `last_seen_user_id UUID`: Último usuario que utilizó el dispositivo.
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
   - **Seguridad:** RLS activado. Sin políticas de escritura pública; únicamente modificable mediante RPCs atómicas `SECURITY DEFINER` o clientes con `service_role`.

2. **`public.user_devices`:**
   - `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`.
   - `device_id TEXT`.
   - `last_seen_at TIMESTAMPTZ DEFAULT NOW()`.
   - `PRIMARY KEY (user_id, device_id)`.
   - **Propósito:** Auditoría y trazabilidad completa. Permite rastrear al instante qué dispositivos utiliza cada usuario (ej. localizar el `device_id` del móvil de pruebas de Ángela o Nacho).

---

## 3. VARIABLES DE ENTORNO VERCEL Y LISTAS BLANCAS (`src/lib/config/whitelist.ts`)

Se implementó el módulo central de listas blancas que lee dinámicamente desde el entorno de ejecución:

| Variable de Entorno | Formato | Respaldo por Defecto | Comportamiento |
| :--- | :--- | :--- | :--- |
| `UNLIMITED_ADMIN_EMAILS` | Emails separados por coma | `nachomoltol@gmail.com, angelagmilla@gmail.com` | **Barra libre total:** No valida cuotas ni incrementa contadores de cuenta ni de dispositivo (`is_admin: true`). |
| `UNLIMITED_TEST_DEVICE_IDS` | IDs separados por coma | `native_ee01f3de145f466b` | **Dispositivo de prueba:** Omite el bloqueo y el conteo en `device_limits`, permitiendo testing exhaustivo sin alterar cuotas de producción. |

---

## 4. REGLAS DE NEGOCIO Y RPCS ACTUALIZADAS

### 4.1. RPC `check_api_limit` & `increment_api_generation`
- **Firma:** `(p_user_id UUID, p_device_id TEXT, p_is_admin_email BOOLEAN, p_is_test_device BOOLEAN)`
- **Regla Admin:** Si `p_is_admin_email = TRUE` -> Retorna `{ allowed: true, is_admin: true, tier: 'admin', limit: 9999 }` sin descontar saldo.
- **Regla Plan PRO / VIP:** Ignora por completo `device_limits` (no consulta ni suma al contador físico del dispositivo). Evalúa únicamente su límite mensual de cuenta (120 generaciones/mes).
- **Regla Plan Free con Escudo Anti-Multicuentas:**
  1. Si `p_is_test_device = FALSE` y `p_device_id IS NOT NULL`:
     - Aplica *Lazy Reset Mensual* del dispositivo si `reset_at <= NOW()`.
     - Si el dispositivo ya alcanzó `30` generaciones en el mes -> Devuelve `DEVICE_LIMIT_REACHED` invitando a suscribirse a PRO.
     - Si el dispositivo ya agotó sus `5` generaciones de bienvenida (`welcome_generations_used >= 5`):
       - Aunque se registre una nueva cuenta con otro email, **NO se le concede bienvenida gratuita**; pasa directamente a requerir anuncio bonificado (`AD_REQUIRED`).
  2. Si el dispositivo aún tiene saldo de bienvenida y la cuenta también -> Concede fase de bienvenida gratuita.

### 4.2. RPC `unlock_deck_summary_with_ad` (Guías de Estudio)
- **Firma:** `(p_user_id UUID, p_deck_id UUID, p_device_id TEXT, p_is_admin_email BOOLEAN, p_is_test_device BOOLEAN)`
- **Regla Admin / PRO:** Ilimitado sin gastar cupo ni consultar `device_limits`.
- **Regla Free:**
  - Evalúa la cuenta: máx 3 guías/mes (`guides_unlocked_this_month < 3`).
  - Evalúa el dispositivo: si `p_device_id` ya desbloqueó 3 guías en el mes entre cuentas Free, deniega con `DEVICE_LIMIT_REACHED`.
  - Al desbloquear: incrementa atómicamente tanto en `api_limits` como en `device_limits` con bloqueo pesimista `FOR UPDATE`.

### 4.3. Reinicio a 0 Generaciones al Suscribirse a PRO
- **RPC `set_user_tier`:** En caso de pasar a `tier = 'pro'` o `'vip'`, actualiza `generations_count = 0`.
- **Server Action `verifyStripeCheckout.ts`:** Al validar el pago de Stripe Checkout, resetea explícitamente `generations_count: 0`.
- **Webhook de Stripe (`/api/stripe/webhook`):** En `checkout.session.completed` e `invoice.paid`, fuerza `generations_count: 0`.
- **Garantía:** El usuario que paga su suscripción PRO (3,50 €/mes) disfruta de sus 120 generaciones limpias desde el primer segundo.

---

## 5. PROPAGACIÓN EN CLIENTE Y SERVER ACTIONS

Se integró la propagación transparente del `deviceId` en todas las vías de entrada:
1. `src/app/(dashboard)/decks/[id]/page.tsx` -> `generateCardsAction(..., clientDeviceId)`
2. `src/components/cards/DocumentUploader.tsx` -> `generateCardsFromDocumentAction({ ..., deviceId })`
3. `src/components/cards/UrlCardGenerator.tsx` -> `generateCardsFromUrlAction({ ..., deviceId })`
4. `src/components/subscription/ProModal.tsx` -> `claimAdRewardAction(..., clientDeviceId)` y `getUserLimitsAction(..., clientDeviceId)`
5. `src/components/decks/QuickStudyGuideModal.tsx` -> `unlockDeckSummaryWithAdAction(..., clientDeviceId)`
6. `src/app/api/generate/route.ts` -> Soporta `deviceId` en payload JSON o cabecera `x-device-id`.

---

## 6. CONTROL DE CALIDAD Y DESPLIEGUE

1. **TypeScript Compiler (`npx tsc --noEmit`):**
   - Ejecutado con éxito. **0 errores de compilación**.
2. **ESLint (`npx eslint src/ --quiet`):**
   - Ejecutado con éxito. **0 errores de linting**.
3. **Migración SQL en Supabase (`fapjackhdqtnrpteujum`):**
   - Ejecutada y validada. Tablas `device_limits` y `user_devices` activas con RLS.
   - RPCs `check_api_limit`, `increment_api_generation`, `unlock_deck_summary_with_ad` y `add_bonus_credit` operativas.
4. **Diseño Visual y Exportación Editorial PDF:**
   - Intactos al 100%. No se alteró ningún estilo CSS, ni maquetación ni Modo Docente.
