/**
 * Types TypeScript pour PORTUS — U.J.S.R.V.
 * Union des Jeunes de la Sécurité Routière de Vridi
 */

export type Role =
  | 'ADMINISTRATEUR'
  | 'RESPONSABLE'
  | 'AGENT'
  | 'CONTROLEUR'
  | 'CAISSIER'
  | 'FINANCE'
  | 'AUDITEUR';

export type PortusPermission =
  | 'tickets.create'
  | 'tickets.sell'
  | 'tickets.cancel'
  | 'tickets.reprint'
  | 'tickets.verify'
  | 'tickets.view'
  | 'vehicles.create'
  | 'vehicles.edit'
  | 'finance.view'
  | 'finance.reconcile'
  | 'expenses.create'
  | 'expenses.approve'
  | 'reports.export'
  | 'users.manage'
  | 'settings.manage'
  | 'audit.view';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  permissions?: PortusPermission[];
  sectorId?: string;
  sectorName?: string;
  phone?: string;
  isActive: boolean;
  failedAttempts: number;
  lockedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginAttempt {
  id: string;
  username: string;
  profileId?: string;
  isSuccessful: boolean;
  failureReason?: string;
  attemptedAt: string;
  userAgent?: string;
}

export interface TicketAssignment {
  id: string;
  ticketId: string;
  carnetId?: string;
  fromProfileId?: string;
  toProfileId: string;
  assignedBy: string;
  assignmentType: string;
  notes?: string;
  assignedAt: string;
}

export type TicketStatus =
  | 'GENERATED'
  | 'ASSIGNED_TO_RESPONSIBLE'
  | 'AVAILABLE'
  | 'ASSIGNED_TO_AGENT'
  | 'SOLD'
  | 'CONTROLLED'
  | 'CANCELLED';

export type CarnetStatus =
  | 'GENERATED'
  | 'ASSIGNED_TO_RESPONSIBLE'
  | 'AVAILABLE'
  | 'EXHAUSTED'
  | 'CANCELLED'
  | 'CREATED'
  | 'ASSIGNED';

export interface Carnet {
  id: string; // UUID unique
  carnetNumber: string; // Ex: C-2026-001
  seriesPrefix: string; // Ex: VRD
  size: number; // Multiples de 3 (3, 6, 9, ... 150, 153...)
  startNumber: number;
  endNumber: number;
  createdById: string;
  createdByName: string;
  assignedToResponsableId?: string;
  assignedToResponsableName?: string;
  assignedToResponsableAt?: string;
  assignedAt?: string; // Date et heure d'attribution au responsable
  assignedById?: string; // Administrateur ayant attribué
  assignedByName?: string;
  sectorId?: string;
  sectorName?: string;
  createdAt: string; // Date et heure de génération
  status: CarnetStatus;
}

export interface Ticket {
  id: string; // Identifiant interne unique
  ticketNumber: string; // Numéro affiché (ex: VRD-000101)
  physicalNumber?: number; // Numéro séquentiel physique (ex: 1, 2... 100)
  carnetId: string;
  carnetNumber: string;
  qrPayload: string; // Payload crypté / lisible pour QR code
  securityToken?: string;
  status: TicketStatus;
  price: number; // 5 000 FCFA
  assignedResponsableId?: string;
  assignedResponsableName?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedAgentPhone?: string;
  assignedAt?: string;
  sectorId?: string;
  sectorName?: string;

  // Données de vente
  saleId?: string;
  soldAt?: string; // Date/heure originale de vente (ISO)
  plateNumber?: string; // Normalisé (ex: AB1234CD)
  driverPhone?: string; // Chiffres uniquement
  isSuperseded?: boolean; // Remplacé par un nouveau ticket actif pour la même immat
  supersededByTicketNumber?: string;
  coveredByRemiseId?: string;

  // Données de contrôle
  controlCount: number;
  lastControlledAt?: string;
  controlledAt?: string;
  lastControlledBy?: string;
  controlledByName?: string;

  // Annulation
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledByName?: string;
  cancellationReason?: string;
  cancelledReason?: string;

  // Réimpressions
  reprintCount?: number;
  lastReprintedAt?: string;
  lastReprintAt?: string;
  reprintReason?: string;
  lastReprintBy?: string;
  lastReprintByName?: string;

  createdAt: string;
  updatedAt?: string;
}

export type VehicleCategory =
  | 'Camion-citerne'
  | 'Conteneur'
  | 'Plateau'
  | 'Benne'
  | 'Marchandises'
  | 'Autre commercial'
  | string;

export interface Sale {
  id: string; // Identifiant de vente unique UUID (généré immédiatement hors ligne)
  ticketId: string;
  ticketNumber: string;
  agentId: string;
  agentName: string;
  sectorId?: string;
  sectorName?: string;
  plateNumber: string; // Normalisé
  driverPhone?: string; // Chiffres uniquement ou vide
  vehicleCategory?: string;
  soldAt: string; // Date originale de vente (NE JAMAIS écraser par la synchro)
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAccuracy: number | null;
  gpsStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'GPS_UNAVAILABLE';
  syncedAt?: string; // Date/heure réelle de synchronisation
  syncStatus: 'PENDING_SYNC' | 'SYNCED';
  price: number; // 5000 FCFA
  paymentMethod?: 'ESPECES' | 'MOBILE_MONEY' | 'AUTRE';
  paymentReference?: string;
  coveredByRemiseId?: string;
}

export interface Control {
  id: string;
  ticketId?: string;
  ticketNumber: string;
  plateNumber: string;
  controleurId: string;
  controleurName: string;
  controlledAt: string;
  isValid: boolean;
  validationMessage: string;
  resultType?: 'VALID' | 'CANCELLED' | 'INVALID_UNKNOWN' | 'SUPERSEDED' | 'NOT_SOLD';
  isOnline?: boolean;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAccuracy: number | null;
  gpsStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'GPS_UNAVAILABLE';
  syncStatus: 'PENDING_SYNC' | 'SYNCED';
  syncedAt?: string;
}

export type FraudType =
  | 'CAMION_DIFFERENT'
  | 'TICKET_SUSPECT'
  | 'TICKET_FALSIFIE'
  | 'TICKET_DEJA_PRESENTE'
  | 'AUTRE';

export type FraudReportStatus =
  | 'NOUVEAU'
  | 'EN_COURS'
  | 'TRAITE'
  | 'REJETE'
  | 'CONFIRME';

export interface FraudProcessingHistoryEntry {
  id: string;
  processedAt: string;
  adminId: string;
  adminName: string;
  fromStatus: FraudReportStatus;
  toStatus: FraudReportStatus;
  decisionNote: string;
}

export interface FraudReport {
  id: string;
  ticketNumber?: string;
  plateNumber: string;
  sectorId?: string;
  sectorName?: string;
  controleurId: string;
  controleurName: string;
  type: FraudType;
  typeLabel: string;
  reason?: string;
  reasonLabel?: string;
  comment: string;
  photos: string[];
  photoDataUrl?: string;
  reportedAt: string;
  reportedDate: string;
  reportedTime: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsStatus?: 'AVAILABLE' | 'UNAVAILABLE';
  status: FraudReportStatus;
  processingHistory?: FraudProcessingHistoryEntry[];
  adminDecisionNote?: string;
  adminDecisionBy?: string;
  adminDecisionByName?: string;
  adminDecisionAt?: string;
  isOnline?: boolean;
  syncStatus: 'PENDING_SYNC' | 'SYNCED';
  syncedAt?: string;
}

export interface RemiseHistoryEntry {
  id: string;
  modifiedAt: string;
  modifiedById: string;
  modifiedByName: string;
  date: string;
  time: string;
  reason: string;
  oldAmount: number;
  newAmount: number;
  oldNote?: string;
  newNote?: string;
}

export interface Remise {
  id: string;
  reference: string;
  agentId: string;
  agentName: string;
  responsableId: string;
  responsableName: string;
  sectorId: string;
  sectorName: string;
  amount: number;
  montant?: number; // compatibilité
  date: string;
  time: string;
  createdAt: string;
  note?: string;
  status?: string;
  ticketIdsCovered: string[];
  ticketsCount: number;
  isCorrected?: boolean;
  history: RemiseHistoryEntry[];
}

export type ExpenseCategory =
  | 'MATÉRIEL'
  | 'AGENT'
  | 'AUTORITÉS'
  | 'RÉPARATION / ENTRETIEN'
  | 'CARBURANT'
  | 'TRANSPORT'
  | 'AUTRE';

export type ExpenseStatus = 'PENDING' | 'VALIDATED' | 'VALIDEE' | 'REJECTED' | 'CANCELLED' | 'PAYEE';

export interface Expense {
  id: string;
  expenseNumber: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  beneficiary?: string | null;
  paymentMethod?: string;
  expenseDate: string;
  receiptUrl?: string | null;
  status: ExpenseStatus;
  createdBy: string;
  createdByName: string;
  createdByRole: Role;
  responsibleId?: string | null;
  responsibleName?: string | null;
  sectorId?: string | null;
  sectorName?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  correctionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string | null;
  offlineId?: string | null;
}

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_LOCKED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'CARNET_GENERATED'
  | 'CARNET_ASSIGNED_RESPONSABLE'
  | 'CARNET_CANCELLED'
  | 'TICKETS_ASSIGNED_AGENT'
  | 'TICKETS_REASSIGNED'
  | 'TICKET_SOLD'
  | 'TICKET_REPRINTED'
  | 'SALE_SYNCED'
  | 'PLATE_CORRECTED'
  | 'TICKET_CANCELLED'
  | 'TICKET_CONTROLLED'
  | 'CONTROL_SYNCED'
  | 'FRAUD_REPORTED'
  | 'FRAUD_STATUS_UPDATED'
  | 'FRAUD_CONFIRMED'
  | 'FRAUD_REJECTED'
  | 'FRAUD_SYNCED'
  | 'REMISE_RECORDED'
  | 'REMISE_EXCEPTIONAL_CORRECTION'
  | 'EXPENSE_CREATED'
  | 'EXPENSE_UPDATED'
  | 'EXPENSE_VALIDATED'
  | 'EXPENSE_REJECTED'
  | 'EXPENSE_CORRECTED'
  | 'EXPENSE_CANCELLED'
  | 'EXPENSE_SYNCED'
  | 'DAILY_CLOSING_SUBMITTED'
  | 'DAILY_CLOSING_CONFIRMED'
  | 'DATABASE_EXPORTED'
  | 'DATABASE_RESET'
  | 'CONFIG_UPDATE';

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  action: AuditAction;
  timestamp: string;
  targetEntity: string;
  targetId: string;
  oldValue?: string | number | Record<string, unknown> | null;
  newValue?: string | number | Record<string, unknown> | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  details?: any;
}

export interface FinancialAlert {
  id: string;
  agentId: string;
  agentName: string;
  sectorId?: string;
  sectorName?: string;
  unremittedTicketsCount: number;
  unremittedAmount: number;
  thresholdPassed: number;
  level: 'WARNING' | 'CRITICAL';
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  recipientId: string;
  senderId?: string;
  title: string;
  message: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  type: 'FINANCIAL_ALERT' | 'ASSIGNMENT' | 'SYSTEM' | 'FRAUD_ALERT' | 'REMITTANCE' | 'SALE';
  metadata?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

// --------------------------------------------------------------------------
// NOUVELLES INTERFACES OPÉRATIONNELLES (VEHICULES, CAISSE, CLÔTURE, RÉIMPRESSION)
// --------------------------------------------------------------------------

export type VehicleType =
  | 'CAMION_CITERNE'
  | 'CONTENEUR'
  | 'PLATEAU'
  | 'BENNE'
  | 'MARCHANDISES'
  | 'AUTRE_POIDS_LOURD';

export interface Vehicle {
  id: string;
  plateNumber: string;
  vehicleType: VehicleType;
  makeModel?: string;
  driverName?: string;
  driverPhone?: string;
  companyName?: string;
  isFlaggedFraud: boolean;
  flagReason?: string;
  lastSeenAt?: string;
  totalTicketsCount: number;
  totalControlsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketReprint {
  id: string;
  ticketId: string;
  ticketNumber: string;
  requestedBy: string;
  requestedByName: string;
  reason: string;
  reprintCount: number;
  isSuspicious: boolean;
  approvedBy?: string;
  reprintedAt: string;
}

export interface DailyClosing {
  id: string;
  closingReference: string;
  closingDate: string;
  date?: string;
  cashierId: string;
  cashierName: string;
  sectorId?: string;
  sectorName?: string;
  openingBalance: number;
  cashSalesAmount: number;
  digitalSalesAmount: number;
  refundsAmount: number;
  expensesAmount: number;
  expectedBalance: number;
  declaredBalance: number;
  declaredCash?: number;
  difference?: number;
  discrepancy: number; // declaredBalance - expectedBalance
  totalSales?: number;
  totalExpenses?: number;
  totalRemises?: number;
  ticketCount?: number;
  closedById?: string;
  closedByName?: string;
  closedAt?: string;
  notes?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'DISPUTED' | 'LOCKED' | 'CLOSED';
  confirmedBy?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashManagementSummary {
  openingBalance: number;
  cashSales: number;
  digitalPayments: number;
  refunds: number;
  expenses: number;
  expectedBalance: number;
  declaredBalance: number;
  difference: number; // declared - expected
  salesCount: number;
  ticketsSoldList: string[];
}

export interface FinancialReconciliation {
  periodLabel: string;
  totalTicketsSold: number;
  grossSalesExpected: number;
  totalExpensesValidated: number;
  netRevenueExpected: number;
  totalRemittancesReceived: number;
  declaredCashTotal: number;
  unremittedBalance: number;
  discrepancy: number;
  status: 'BALANCED' | 'DEFICIT' | 'SURPLUS';
}

export interface QRVerificationLog {
  id: string;
  ticketId?: string;
  ticketNumber: string;
  controllerId?: string;
  plateNumber?: string;
  isValid: boolean;
  signatureValid: boolean;
  isReplay: boolean;
  verificationCount: number;
  deviceInfo?: string;
  location?: string;
  verifiedAt: string;
}
