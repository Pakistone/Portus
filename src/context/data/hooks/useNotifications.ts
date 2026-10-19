import { useState, useCallback } from 'react';
import type { NotificationRecord, Sale, User } from '../../../types';
import { getDB } from '../../../db/indexedDb';
import { SupabaseDataLayer } from '../../../db/supabaseService';
import { formatDateTime } from '../../../utils/normalization';

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    const db = await getDB();
    if (db.objectStoreNames.contains('notifications')) {
      const notif = await db.get('notifications', notificationId);
      if (notif) {
        notif.isRead = true;
        notif.readAt = new Date().toISOString();
        await db.put('notifications', notif);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, isRead: true, readAt: notif.readAt } : n))
        );
      }
    }
  }, []);

  const markAllNotificationsAsRead = useCallback(async (recipientId?: string, currentUserId?: string) => {
    const targetId = recipientId || currentUserId;
    const db = await getDB();
    if (db.objectStoreNames.contains('notifications')) {
      const allNotifs: NotificationRecord[] = await db.getAll('notifications');
      const unreadNotifs = allNotifs.filter(
        (notif: NotificationRecord) => (!targetId || notif.recipientId === targetId) && !notif.isRead
      );
      if (unreadNotifs.length > 0) {
        const tx = db.transaction('notifications', 'readwrite');
        const store = tx.objectStore('notifications');
        const nowIso = new Date().toISOString();
        for (const notif of unreadNotifs) {
          notif.isRead = true;
          notif.readAt = nowIso;
        }
        await Promise.all([...unreadNotifs.map((n: NotificationRecord) => store.put(n)), tx.done]);
        setNotifications((prev) =>
          prev.map((n) => ((!targetId || n.recipientId === targetId) ? { ...n, isRead: true, readAt: nowIso } : n))
        );
      }
    }
  }, []);

  const notifySaleSynced = useCallback(async (sale: Sale, database: any) => {
    try {
      const allUsers: User[] = await database.getAll('users');
      // Destinataires : Administrateurs et Responsables (secteur ou tous)
      const recipients = allUsers.filter(
        (u) =>
          u.isActive &&
          (u.role === 'ADMINISTRATEUR' ||
            (u.role === 'RESPONSABLE' && (!sale.sectorId || !u.sectorId || u.sectorId === sale.sectorId)))
      );

      const nowIso = new Date().toISOString();
      const notifTitle = `TICKET ${sale.ticketNumber} VENDU`;
      const notifMessage = `Agent : ${sale.agentName} | Immatriculation : ${sale.plateNumber} | Date/heure : ${formatDateTime(sale.soldAt)}`;

      for (const recipient of recipients) {
        const notifId = `notif-sale-${sale.id}-${recipient.id}`;
        const notif: NotificationRecord = {
          id: notifId,
          recipientId: recipient.id,
          senderId: sale.agentId,
          title: notifTitle,
          message: notifMessage,
          level: 'INFO',
          type: 'SALE',
          metadata: {
            saleId: sale.id,
            ticketNumber: sale.ticketNumber,
            agentId: sale.agentId,
            agentName: sale.agentName,
            plateNumber: sale.plateNumber,
            soldAt: sale.soldAt,
            sectorId: sale.sectorId,
          },
          isRead: false,
          createdAt: nowIso,
        };

        if (database.objectStoreNames.contains('notifications')) {
          await database.put('notifications', notif);
        }

        if (SupabaseDataLayer.isAvailable()) {
          SupabaseDataLayer.insertNotification(notif).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Erreur création notification de vente synchronisée:', err);
    }
  }, []);

  return {
    notifications,
    setNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    notifySaleSynced,
  };
}
