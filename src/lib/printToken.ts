import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export type PrintGrantMode = 'exam' | 'guide';

interface PrintGrantPayload {
  d: string; // deckId
  u: string; // userId
  m: PrintGrantMode;
  exp: number; // unix timestamp ms
}

const EPHEMERAL_FALLBACK_SECRET = randomBytes(32).toString('hex');
const DEFAULT_TTL_MS = 20 * 60 * 1000; // 20 minutos

function getSigningSecret(): string {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.GEMINI_API_KEY;
  return secret && secret.trim() ? secret.trim() : EPHEMERAL_FALLBACK_SECRET;
}

/**
 * Genera un token efímero firmado con HMAC-SHA256 (sin exponer JWT de sesión)
 * para autorizar la apertura de `/decks/[id]/print` en el navegador externo (`_system`)
 * de iOS (Safari / AirPrint) y Android (Chrome / Guardar PDF).
 */
export function mintPrintGrantToken(
  deckId: string,
  userId: string,
  mode: PrintGrantMode = 'exam',
  ttlMs: number = DEFAULT_TTL_MS
): string {
  const payload: PrintGrantPayload = {
    d: deckId.trim(),
    u: userId.trim(),
    m: mode,
    exp: Date.now() + ttlMs,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

/**
 * Valida criptográficamente un token de impresión efímero y comprueba su vigencia,
 * el `deckId` objetivo y el modo autorizado (`exam` vs `guide`).
 */
export function verifyPrintGrantToken(
  token: string | undefined | null,
  expectedDeckId: string,
  expectedMode: PrintGrantMode
): { valid: boolean; userId?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false };
  }

  const [encodedPayload, providedSig] = parts;
  const expectedSig = createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return { valid: false };
  }

  try {
    const raw = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as Partial<PrintGrantPayload>;
    if (
      !parsed ||
      typeof parsed.d !== 'string' ||
      typeof parsed.u !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return { valid: false };
    }

    if (Date.now() > parsed.exp) {
      return { valid: false };
    }

    if (parsed.d !== expectedDeckId.trim() || parsed.m !== expectedMode) {
      return { valid: false };
    }

    return { valid: true, userId: parsed.u };
  } catch {
    return { valid: false };
  }
}
