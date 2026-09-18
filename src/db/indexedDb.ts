/**
 * Base de données locale IndexedDB pour PORTUS — U.J.S.R.V.
 * Utilise 'idb' pour garantir la persistance locale 100% hors ligne.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  User,
  Carnet,
  Ticket,
  Sale,
  Control,
  FraudReport,
  Remise,
  Expense,
  AuditLog,
  LoginAttempt,
  TicketAssignment,
  NotificationRecord,
} from '../types';
import { TICKET_PRICE_FCFA } from '../config/constants';

interface PortusDB extends DBSchema {
  users: {
    key: string;
    value: User;
    indexes: { 'by-username': string; 'by-role': string };
  };
  carnets: {
    key: string;
    value: Carnet;
    indexes: { 'by-responsable': string; 'by-carnet-number': string };
  };
  tickets: {
    key: string;
    value: Ticket;
    indexes: {
      'by-ticket-number': string;
      'by-carnet': string;
      'by-agent': string;
      'by-responsable': string;
      'by-status': string;
      'by-plate': string;
    };
  };
  sales: {
    key: string;
    value: Sale;
    indexes: {
      'by-agent': string;
      'by-ticket-number': string;
      'by-plate': string;
      'by-sync-status': string;
      'by-sold-at': string;
    };
  };
  controls: {
    key: string;
    value: Control;
    indexes: { 'by-plate': string; 'by-ticket-number': string; 'by-controleur': string };
  };
  fraud_reports: {
    key: string;
    value: FraudReport;
    indexes: { 'by-plate': string; 'by-controleur': string; 'by-status': string };
  };
  remises: {
    key: string;
    value: Remise;
    indexes: { 'by-agent': string; 'by-responsable': string; 'by-reference': string };
  };
  expenses: {
    key: string;
    value: Expense;
    indexes: {
      'by-expense-number': string;
      'by-status': string;
      'by-sector': string;
      'by-responsable': string;
      'by-created-by': string;
    };
  };
  audit_logs: {
    key: string;
    value: AuditLog;
    indexes: { 'by-action': string; 'by-actor': string; 'by-timestamp': string };
  };
  ticket_assignments: {
    key: string;
    value: TicketAssignment;
    indexes: { 'by-ticket': string; 'by-to-profile': string; 'by-from-profile': string };
  };
  notifications: {
    key: string;
    value: NotificationRecord;
    indexes: { 'by-recipient': string; 'by-created-at': string };
  };
  login_attempts: {
    key: string;
    value: LoginAttempt;
    indexes: { 'by-username': string; 'by-attempted-at': string };
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'portus_ujsrv_db_v1';
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<PortusDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<PortusDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PortusDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Users store
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id' });
          userStore.createIndex('by-username', 'username', { unique: true });
          userStore.createIndex('by-role', 'role');
        }

        // Carnets store
        if (!db.objectStoreNames.contains('carnets')) {
          const carnetStore = db.createObjectStore('carnets', { keyPath: 'id' });
          carnetStore.createIndex('by-responsable', 'assignedToResponsableId');
          carnetStore.createIndex('by-carnet-number', 'carnetNumber', { unique: true });
        }

        // Tickets store
        if (!db.objectStoreNames.contains('tickets')) {
          const ticketStore = db.createObjectStore('tickets', { keyPath: 'id' });
          ticketStore.createIndex('by-ticket-number', 'ticketNumber', { unique: true });
          ticketStore.createIndex('by-carnet', 'carnetId');
          ticketStore.createIndex('by-agent', 'assignedAgentId');
          ticketStore.createIndex('by-responsable', 'assignedResponsableId');
          ticketStore.createIndex('by-status', 'status');
          ticketStore.createIndex('by-plate', 'plateNumber');
        }

        // Sales store
        if (!db.objectStoreNames.contains('sales')) {
          const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
          salesStore.createIndex('by-agent', 'agentId');
          salesStore.createIndex('by-ticket-number', 'ticketNumber');
          salesStore.createIndex('by-plate', 'plateNumber');
          salesStore.createIndex('by-sync-status', 'syncStatus');
          salesStore.createIndex('by-sold-at', 'soldAt');
        }

        // Controls store
        if (!db.objectStoreNames.contains('controls')) {
          const controlsStore = db.createObjectStore('controls', { keyPath: 'id' });
          controlsStore.createIndex('by-plate', 'plateNumber');
          controlsStore.createIndex('by-ticket-number', 'ticketNumber');
          controlsStore.createIndex('by-controleur', 'controleurId');
        }

        // Fraud reports store
        if (!db.objectStoreNames.contains('fraud_reports')) {
          const fraudStore = db.createObjectStore('fraud_reports', { keyPath: 'id' });
          fraudStore.createIndex('by-plate', 'plateNumber');
          fraudStore.createIndex('by-controleur', 'controleurId');
          fraudStore.createIndex('by-status', 'status');
        }

        // Remises store
        if (!db.objectStoreNames.contains('remises')) {
          const remisesStore = db.createObjectStore('remises', { keyPath: 'id' });
          remisesStore.createIndex('by-agent', 'agentId');
          remisesStore.createIndex('by-responsable', 'responsableId');
          remisesStore.createIndex('by-reference', 'reference', { unique: true });
        }

        // Expenses store
        if (!db.objectStoreNames.contains('expenses')) {
          const expenseStore = db.createObjectStore('expenses', { keyPath: 'id' });
          expenseStore.createIndex('by-expense-number', 'expenseNumber', { unique: true });
          expenseStore.createIndex('by-status', 'status');
          expenseStore.createIndex('by-sector', 'sectorId');
          expenseStore.createIndex('by-responsable', 'responsibleId');
          expenseStore.createIndex('by-created-by', 'createdBy');
        }

        // Audit store
        if (!db.objectStoreNames.contains('audit_logs')) {
          const auditStore = db.createObjectStore('audit_logs', { keyPath: 'id' });
          auditStore.createIndex('by-action', 'action');
          auditStore.createIndex('by-actor', 'actorId');
          auditStore.createIndex('by-timestamp', 'timestamp');
        }

        // Ticket assignments store
        if (!db.objectStoreNames.contains('ticket_assignments')) {
          const assignmentStore = db.createObjectStore('ticket_assignments', { keyPath: 'id' });
          assignmentStore.createIndex('by-ticket', 'ticketId');
          assignmentStore.createIndex('by-to-profile', 'toProfileId');
          assignmentStore.createIndex('by-from-profile', 'fromProfileId');
        }

        // Notifications store
        if (!db.objectStoreNames.contains('notifications')) {
          const notifStore = db.createObjectStore('notifications', { keyPath: 'id' });
          notifStore.createIndex('by-recipient', 'recipientId');
          notifStore.createIndex('by-created-at', 'createdAt');
        }

        // Login attempts store
        if (!db.objectStoreNames.contains('login_attempts')) {
          const loginStore = db.createObjectStore('login_attempts', { keyPath: 'id' });
          loginStore.createIndex('by-username', 'username');
          loginStore.createIndex('by-attempted-at', 'attemptedAt');
        }

        // Settings / meta
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Utilisateurs pré-configurés pour la démonstration et le fonctionnement initial
 * Mots de passe stockés en clair ou hash local pour démo (règle : NE JAMAIS altérer les mots de passe)
 */
export const INITIAL_USERS: (User & { passwordHash: string })[] = [
  {
    id: 'usr-admin-01',
    username: 'admin',
    passwordHash: 'admin123',
    fullName: 'YAO KOFFI ALEXIS',
    role: 'ADMINISTRATEUR',
    phone: '2250701020304',
    isActive: true,
    failedAttempts: 0,
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'usr-resp-01',
    username: 'resp_port',
    passwordHash: 'resp123',
    fullName: 'KOUASSI MICHEL',
    role: 'RESPONSABLE',
    sectorId: 'sec-vridi-port',
    sectorName: 'VRIDI PORT / TERMINAL',
    phone: '2250505060708',
    isActive: true,
    failedAttempts: 0,
    createdAt: '2026-01-05T08:00:00.000Z',
    updatedAt: '2026-01-05T08:00:00.000Z',
  },
  {
    id: 'usr-resp-02',
    username: 'resp_canal',
    passwordHash: 'resp123',
    fullName: 'TRAORE AMADOU',
    role: 'RESPONSABLE',
    sectorId: 'sec-vridi-canal',
    sectorName: 'VRIDI CANAL / PONT',
    phone: '2250102030405',
    isActive: true,
    failedAttempts: 0,
    createdAt: '2026-01-05T08:00:00.000Z',
    updatedAt: '2026-01-05T08:00:00.000Z',
  },
  {
    id: 'usr-agent-01',
    username: 'agent_eric',
    passwordHash: 'agent123',
    fullName: 'KOUAME ERIC',
    role: 'AGENT',
    sectorId: 'sec-vridi-port',
    sectorName: 'VRIDI PORT / TERMINAL',
    phone: '2250788990011',
    isActive: true,
    failedAttempts: 0,
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'usr-agent-02',
    username: 'agent_ibrahim',
    passwordHash: 'agent123',
    fullName: 'SANOGO IBRAHIM',
    role: 'AGENT',
    sectorId: 'sec-vridi-canal',
    sectorName: 'VRIDI CANAL / PONT',
    phone: '2250577889900',
    isActive: true,
    failedAttempts: 0,
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'usr-ctrl-01',
    username: 'controleur_jean',
    passwordHash: 'ctrl123',
    fullName: 'BAMBA JEAN-LUC',
    role: 'CONTROLEUR',
    phone: '2250744556677',
    isActive: true,
    failedAttempts: 0,
    createdAt: '2026-01-15T08:00:00.000Z',
    updatedAt: '2026-01-15T08:00:00.000Z',
  },
];

/**
 * Initialisation automatique avec données réalistes si la DB est vide
 */
export async function initializeDatabase(): Promise<void> {
  const db = await getDB();
  const isInitialized = await db.get('settings', 'is_initialized');

  if (isInitialized) {
    return;
  }

  // Enregistrer les mots de passe de test dans le store settings sécurisé
  const passwordsMap: Record<string, string> = {};
  INITIAL_USERS.forEach((u) => {
    passwordsMap[u.username] = u.passwordHash;
  });
  await db.put('settings', passwordsMap, 'user_passwords');

  // Insérer les utilisateurs
  const txUser = db.transaction('users', 'readwrite');
  for (const u of INITIAL_USERS) {
    const { passwordHash: _hash, ...userDoc } = u;
    await txUser.store.put(userDoc);
  }
  await txUser.done;

  // Créer un premier carnet (multiple de 3 : 18 tickets)
  const carnetId = 'car-vridi-001';
  const carnet: Carnet = {
    id: carnetId,
    carnetNumber: 'CARNET-2026-001',
    seriesPrefix: 'VRD',
    size: 18,
    startNumber: 101,
    endNumber: 118,
    createdById: 'usr-admin-01',
    createdByName: 'YAO KOFFI ALEXIS',
    assignedToResponsableId: 'usr-resp-01',
    assignedToResponsableName: 'KOUASSI MICHEL',
    sectorId: 'sec-vridi-port',
    sectorName: 'VRIDI PORT / TERMINAL',
    createdAt: '2026-09-01T08:00:00.000Z',
    status: 'ASSIGNED',
  };

  await db.put('carnets', carnet);

  // Générer les 18 tickets correspondants
  const txTicket = db.transaction('tickets', 'readwrite');
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

  const sampleTickets: Ticket[] = [];

  for (let i = 101; i <= 118; i++) {
    const ticketNum = `VRD-${String(i).padStart(6, '0')}`;
    const tId = `tkt-${i}`;

    let status: Ticket['status'] = 'AVAILABLE';
    let assignedAgentId: string | undefined = undefined;
    let assignedAgentName: string | undefined = undefined;
    let soldAt: string | undefined = undefined;
    let plateNumber: string | undefined = undefined;
    let driverPhone: string | undefined = undefined;
    let saleId: string | undefined = undefined;
    let controlCount = 0;
    let lastControlledAt: string | undefined = undefined;
    let lastControlledBy: string | undefined = undefined;

    // Tickets 101-112 assignés à l'agent Eric
    if (i <= 112) {
      assignedAgentId = 'usr-agent-01';
      assignedAgentName = 'KOUAME ERIC';
      status = 'ASSIGNED_TO_AGENT';

      // 101 à 108 sont déjà vendus
      if (i <= 108) {
        status = 'SOLD';
        saleId = `sale-${i}`;
        if (i === 101) {
          soldAt = threeDaysAgo;
          plateNumber = '1234HL01';
          driverPhone = '2250711223344';
          controlCount = 1;
          lastControlledAt = twoDaysAgo;
          lastControlledBy = 'BAMBA JEAN-LUC';
        } else if (i === 102) {
          soldAt = threeDaysAgo;
          plateNumber = '5678JK01';
          driverPhone = '2250122334455';
        } else if (i === 103) {
          soldAt = twoDaysAgo;
          plateNumber = '9012MN01';
          driverPhone = '2250533445566';
        } else if (i === 104) {
          soldAt = twoDaysAgo;
          plateNumber = '3456PQ01';
        } else if (i === 105) {
          soldAt = yesterday;
          plateNumber = '7890RS01';
          driverPhone = '2250799887766';
        } else if (i === 106) {
          soldAt = yesterday;
          plateNumber = '2345TU01';
        } else if (i === 107) {
          soldAt = yesterday;
          plateNumber = '6789VW01';
        } else if (i === 108) {
          soldAt = now.toISOString();
          plateNumber = '4321XY01';
        }
      }
    } else {
      // 113-118 disponibles auprès du Responsable (non encore distribués)
      status = 'ASSIGNED_TO_RESPONSIBLE';
    }

    const tkt: Ticket = {
      id: tId,
      ticketNumber: ticketNum,
      carnetId,
      carnetNumber: carnet.carnetNumber,
      qrPayload: JSON.stringify({
        t: ticketNum,
        c: carnet.carnetNumber,
        v: 'UJSRV-VRIDI',
        s: 'SECURE-AUTH-2026',
      }),
      status,
      price: TICKET_PRICE_FCFA,
      assignedResponsableId: 'usr-resp-01',
      assignedResponsableName: 'KOUASSI MICHEL',
      assignedAgentId,
      assignedAgentName,
      sectorId: 'sec-vridi-port',
      sectorName: 'VRIDI PORT / TERMINAL',
      saleId,
      soldAt,
      plateNumber,
      driverPhone,
      controlCount,
      lastControlledAt,
      lastControlledBy,
      createdAt: '2026-09-01T08:00:00.000Z',
    };

    sampleTickets.push(tkt);
    await txTicket.store.put(tkt);
  }
  await txTicket.done;

  // Créer les ventes pour les tickets vendus
  const txSales = db.transaction('sales', 'readwrite');
  for (const t of sampleTickets.filter((t) => t.status === 'SOLD')) {
    const sale: Sale = {
      id: t.saleId!,
      ticketId: t.id,
      ticketNumber: t.ticketNumber,
      agentId: t.assignedAgentId!,
      agentName: t.assignedAgentName!,
      sectorId: t.sectorId,
      sectorName: t.sectorName,
      plateNumber: t.plateNumber!,
      driverPhone: t.driverPhone,
      soldAt: t.soldAt!,
      gpsLatitude: 5.253612,
      gpsLongitude: -3.998451,
      gpsAccuracy: 12,
      gpsStatus: 'AVAILABLE',
      syncedAt: t.soldAt!,
      syncStatus: 'SYNCED',
      price: TICKET_PRICE_FCFA,
    };
    await txSales.store.put(sale);
  }
  await txSales.done;

  // Insérer un contrôle de démo
  const control: Control = {
    id: 'ctrl-001',
    ticketId: 'tkt-101',
    ticketNumber: 'VRD-000101',
    plateNumber: '1234HL01',
    controleurId: 'usr-ctrl-01',
    controleurName: 'BAMBA JEAN-LUC',
    controlledAt: twoDaysAgo,
    isValid: true,
    validationMessage: 'Ticket valide en cours de validité',
    gpsLatitude: 5.25411,
    gpsLongitude: -3.99912,
    gpsAccuracy: 10,
    gpsStatus: 'AVAILABLE',
    syncStatus: 'SYNCED',
  };
  await db.put('controls', control);

  // Insérer une remise initiale partielle : 3 tickets couverts (15 000 FCFA sur 40 000 FCFA attendus)
  const remise: Remise = {
    id: 'rem-2026-001',
    reference: 'REM-2026-0001',
    agentId: 'usr-agent-01',
    agentName: 'KOUAME ERIC',
    responsableId: 'usr-resp-01',
    responsableName: 'KOUASSI MICHEL',
    sectorId: 'sec-vridi-port',
    sectorName: 'VRIDI PORT / TERMINAL',
    amount: 15000,
    date: '2026-09-15',
    time: '17:30:00',
    createdAt: '2026-09-15T17:30:00.000Z',
    note: 'Versement partiel fin de vacation',
    ticketIdsCovered: ['tkt-101', 'tkt-102', 'tkt-103'],
    ticketsCount: 3,
    history: [],
  };
  await db.put('remises', remise);

  // Marquer ces 3 tickets comme couverts par la remise
  const txUpdateTickets = db.transaction('tickets', 'readwrite');
  for (const tId of ['tkt-101', 'tkt-102', 'tkt-103']) {
    const t = await txUpdateTickets.store.get(tId);
    if (t) {
      t.coveredByRemiseId = remise.id;
      await txUpdateTickets.store.put(t);
    }
  }
  await txUpdateTickets.done;

  // Logs d'audit initiaux
  const initialAudit: AuditLog[] = [
    {
      id: 'aud-001',
      actorId: 'usr-admin-01',
      actorName: 'YAO KOFFI ALEXIS',
      actorRole: 'ADMINISTRATEUR',
      action: 'CARNET_GENERATED',
      timestamp: '2026-09-01T08:00:00.000Z',
      targetEntity: 'Carnet',
      targetId: carnetId,
      details: 'Génération du carnet CARNET-2026-001 (18 tickets de VRD-000101 à VRD-000118)',
    },
    {
      id: 'aud-002',
      actorId: 'usr-admin-01',
      actorName: 'YAO KOFFI ALEXIS',
      actorRole: 'ADMINISTRATEUR',
      action: 'CARNET_ASSIGNED_RESPONSABLE',
      timestamp: '2026-09-01T08:15:00.000Z',
      targetEntity: 'Carnet',
      targetId: carnetId,
      newValue: 'KOUASSI MICHEL (VRIDI PORT)',
      details: 'Attribution du carnet au Responsable de Vridi Port',
    },
    {
      id: 'aud-003',
      actorId: 'usr-resp-01',
      actorName: 'KOUASSI MICHEL',
      actorRole: 'RESPONSABLE',
      action: 'TICKETS_ASSIGNED_AGENT',
      timestamp: '2026-09-02T07:30:00.000Z',
      targetEntity: 'Tickets',
      targetId: 'tkt-101..112',
      newValue: 'KOUAME ERIC',
      details: 'Distribution de 12 tickets à l’agent de terrain Kouamé Éric',
    },
  ];

  const txAudit = db.transaction('audit_logs', 'readwrite');
  for (const a of initialAudit) {
    await txAudit.store.put(a);
  }
  await txAudit.done;

  // Marquer comme initialisé
  await db.put('settings', true, 'is_initialized');
}
