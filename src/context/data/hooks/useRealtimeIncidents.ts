import { useState, useCallback, useEffect } from 'react';
import type { FraudReport, NotificationRecord, User } from '../../../types';
import { getDB } from '../../../db/indexedDb';
import { SupabaseDataLayer } from '../../../db/supabaseService';
import { playIncidentAlertSound } from '../../../utils/audioAlert';
import { formatPlateDisplay } from '../../../utils/normalization';

export function useRealtimeIncidents(
  currentUser: User | null,
  isOnline: boolean,
  setFraudReports: React.Dispatch<React.SetStateAction<FraudReport[]>>,
  setNotifications: React.Dispatch<React.SetStateAction<NotificationRecord[]>>
) {
  const [latestRealtimeIncident, setLatestRealtimeIncident] = useState<FraudReport | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const dismissLatestIncident = useCallback(() => {
    setLatestRealtimeIncident(null);
  }, []);

  useEffect(() => {
    if (!currentUser || !isOnline || !SupabaseDataLayer.isAvailable()) {
      setIsRealtimeConnected(false);
      return;
    }

    setIsRealtimeConnected(true);

    const unsubscribe = SupabaseDataLayer.subscribeToRoadSafetyIncidents(async (incident) => {
      console.log('[PORTUS Realtime] Réception d’un incident de sécurité en direct:', incident);

      try {
        const db = await getDB();

        // 1. Idempotence : Ne pas dupliquer si déjà présent
        const existing = await db.get('fraud_reports', incident.id);
        if (existing) {
          return;
        }

        // 2. Sauvegarde immédiate dans IndexedDB
        await db.put('fraud_reports', incident);

        // 3. Mise à jour de l'état réactif
        setFraudReports((prev) => {
          if (prev.some((f) => f.id === incident.id)) return prev;
          return [incident, ...prev];
        });

        // 4. Création de notification prioritaire pour le Contrôleur / Responsable / Admin
        const notifId = `notif-inc-${incident.id}-${Date.now()}`;
        const newNotif: NotificationRecord = {
          id: notifId,
          recipientId: currentUser.id,
          title: `🚨 ALERTE INCIDENT : ${formatPlateDisplay(incident.plateNumber)}`,
          message: `Type: ${incident.typeLabel || incident.reason || 'Incident'} | Agent: ${incident.controleurName || 'Équipe Contrôle'}.${incident.comment ? ` Note: "${incident.comment}"` : ''}`,
          level: 'CRITICAL',
          type: 'FRAUD_ALERT',
          metadata: {
            incidentId: incident.id,
            plateNumber: incident.plateNumber,
            ticketNumber: incident.ticketNumber,
            gpsLatitude: incident.gpsLatitude,
            gpsLongitude: incident.gpsLongitude,
          },
          createdAt: new Date().toISOString(),
          isRead: false,
        };

        if (db.objectStoreNames.contains('notifications')) {
          await db.put('notifications', newNotif);
        }

        setNotifications((prev) => [newNotif, ...prev]);

        // 5. Déclenchement de l'alerte sonore et haptique
        playIncidentAlertSound();

        // 6. Affichage du bandeau d'alerte en direct
        setLatestRealtimeIncident(incident);

        // 7. Émission d'événements système pour notification globale et vibration
        window.dispatchEvent(new CustomEvent('portus-road-safety-alert', { detail: incident }));
        window.dispatchEvent(new CustomEvent('portus-notification-received', { detail: newNotif }));
      } catch (err) {
        console.warn('[PORTUS Realtime] Erreur traitement incident:', err);
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      setIsRealtimeConnected(false);
    };
  }, [currentUser, isOnline, setFraudReports, setNotifications]);

  const simulateIncidentForTesting = useCallback(
    async (plateNumber = '1234HZ01') => {
      const now = new Date();
      const testIncident: FraudReport = {
        id: `frd-test-${Date.now()}`,
        ticketNumber: 'VRD-TEST-99',
        plateNumber,
        controleurId: currentUser?.id || 'ctrl-sim',
        controleurName: currentUser?.fullName || 'Contrôle Corridor Vridi',
        type: 'TICKET_FALSIFIE',
        typeLabel: 'Ticket Falsifié / Contrefait',
        comment: 'Véhicule suspect détecté au poste de contrôle Vridi Terminal (Test Realtime)',
        photos: [],
        reportedAt: now.toISOString(),
        reportedDate: now.toISOString().slice(0, 10),
        reportedTime: now.toLocaleTimeString('fr-FR', { hour12: false }),
        gpsLatitude: 5.2647,
        gpsLongitude: -4.0089,
        status: 'NOUVEAU',
        syncStatus: 'SYNCED',
        syncedAt: now.toISOString(),
      };

      // Déclencher instantanément l'alerte sonore et le bandeau d'alerte visuel en local
      playIncidentAlertSound();
      setLatestRealtimeIncident(testIncident);
      window.dispatchEvent(new CustomEvent('portus-road-safety-alert', { detail: testIncident }));

      // SÉCURITÉ DE PRODUCTION : Ne jamais persister d'incident fictif dans la table fraud_reports officielle
    },
    [currentUser]
  );

  return {
    latestRealtimeIncident,
    dismissLatestIncident,
    isRealtimeConnected,
    simulateIncidentForTesting,
  };
}
