/**
 * Configuración central de Listas Blancas para Administradores y Dispositivos de Prueba.
 * Lee variables de entorno de Vercel con valores de respaldo estables por defecto.
 */

const DEFAULT_ADMIN_EMAILS = [
  'nachomoltol@gmail.com',
  'angelagmilla@gmail.com',
];

const DEFAULT_TEST_DEVICE_IDS = [
  'native_ee01f3de145f466b',
];

/**
 * Retorna la lista de emails de administrador con barra libre total.
 */
export function getAdminEmails(): string[] {
  const envVal = process.env.UNLIMITED_ADMIN_EMAILS;
  if (!envVal || !envVal.trim()) {
    return DEFAULT_ADMIN_EMAILS;
  }
  const parsed = envVal
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ADMIN_EMAILS;
}

/**
 * Retorna la lista de identificadores de dispositivo de prueba excluidos de device_limits.
 */
export function getTestDeviceIds(): string[] {
  const envVal = process.env.UNLIMITED_TEST_DEVICE_IDS;
  if (!envVal || !envVal.trim()) {
    return DEFAULT_TEST_DEVICE_IDS;
  }
  const parsed = envVal
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_TEST_DEVICE_IDS;
}

/**
 * Verifica si un email pertenece a la lista blanca de administradores.
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email || !email.trim()) return false;
  const cleanEmail = email.trim().toLowerCase();
  const admins = getAdminEmails();
  return admins.includes(cleanEmail);
}

/**
 * Verifica si un deviceId pertenece a la lista blanca de dispositivos de prueba.
 */
export function isTestDevice(deviceId?: string | null): boolean {
  if (!deviceId || !deviceId.trim()) return false;
  const cleanDevice = deviceId.trim().toLowerCase();
  const testDevices = getTestDeviceIds();
  return testDevices.includes(cleanDevice);
}
