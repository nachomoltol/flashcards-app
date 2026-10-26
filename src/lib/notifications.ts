import { Capacitor } from '@capacitor/core';

export type NotificationLanguage = 'es' | 'en';

/** ID fijo del recordatorio de estudio (permite cancelarlo/reemplazarlo). */
export const STUDY_REMINDER_NOTIFICATION_ID = 1001;
const REMINDER_HOUR = 20;

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function getPlugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

function buildMessage(studiedToday: boolean, streak: number, lang: NotificationLanguage) {
  if (studiedToday) {
    return lang === 'en'
      ? {
          title: 'Flashmente',
          body: `🔥 Keep your ${streak}-day streak alive! Your tomorrow flashcards are waiting.`,
        }
      : {
          title: 'Flashmente',
          body: `🔥 ¡No pierdas tu racha de ${streak} días! Tus tarjetas de mañana te esperan.`,
        };
  }
  return lang === 'en'
    ? {
        title: 'Flashmente',
        body: '⚡ Your study streak is at risk! Review your cards today on Flashmente.',
      }
    : {
        title: 'Flashmente',
        body: '⚡ ¡Tu racha está en peligro! Repasa tus tarjetas hoy en Flashmente.',
      };
}

/** Calcula la fecha del próximo aviso a las 20:00 locales. */
export function computeReminderDate(studiedToday: boolean, now: Date = new Date()): Date {
  const at = new Date(now);
  at.setHours(REMINDER_HOUR, 0, 0, 0);
  if (studiedToday) {
    at.setDate(at.getDate() + 1);
  } else if (at.getTime() <= now.getTime()) {
    at.setDate(at.getDate() + 1);
  }
  return at;
}

export const SmartNotificationService = {
  async requestNotificationPermission(): Promise<boolean> {
    if (!isNative()) return false;
    try {
      const plugin = await getPlugin();
      const current = await plugin.checkPermissions();
      if (current.display === 'granted') return true;
      const result = await plugin.requestPermissions();
      return result.display === 'granted';
    } catch (err) {
      console.warn('No se pudo solicitar permiso de notificaciones:', err);
      return false;
    }
  },

  async scheduleStudyReminder(
    studiedToday: boolean,
    currentStreak: number,
    lang: NotificationLanguage
  ): Promise<void> {
    if (!isNative()) return;
    try {
      const plugin = await getPlugin();

      await plugin.cancel({ notifications: [{ id: STUDY_REMINDER_NOTIFICATION_ID }] });

      const perm = await plugin.checkPermissions();
      if (perm.display !== 'granted') return;

      const { title, body } = buildMessage(studiedToday, currentStreak, lang);
      await plugin.schedule({
        notifications: [
          {
            id: STUDY_REMINDER_NOTIFICATION_ID,
            title,
            body,
            schedule: { at: computeReminderDate(studiedToday), allowWhileIdle: true },
          },
        ],
      });
    } catch (err) {
      console.warn('No se pudo programar el recordatorio de estudio:', err);
    }
  },
};

export const requestNotificationPermission = SmartNotificationService.requestNotificationPermission;
export const scheduleStudyReminder = SmartNotificationService.scheduleStudyReminder;
