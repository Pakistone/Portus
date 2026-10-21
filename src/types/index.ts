/**
 * Types TypeScript Officiels pour PORTUS — U.J.P.A.S.
 * Union des Jeunes du Port pour l'Assistance et la Sécurité — Zone Portuaire & Industrielle d'Abidjan
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
  avatarUrl?: string;
  matricule?: string;
  brigade?: string;
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
  id: string;
  carnetNumber: string;
  seriesPrefix: string;
  size: number;
  startNumber: number;
  endNumber: number;
  createdById: string;
  createdByName: string;
  assignedToResponsableId?: string;
  assignedToResponsableName?: string;
  assignedToResponsableAt?: string;
  assignedAt?: string;
  assignedById?: string;
  assignedByName?: string;
  sectorId?: string;
  sectorName?: string;
  createdAt: string;
  updatedAt?: string;
  status: CarnetStatus;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  physicalNumber?: number;
  carnetId: string;
  carnetNumber: string;
  qrPayload: string;
  securityToken?: string;
  status: TicketStatus;
  price: number;
  assignedResponsableId?: string;
  assignedResponsableName?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedAgentPhone?: string;
  assignedAt?: string;
  sectorId?: string;
  sectorName?: string;

  // Données de vente & validité 14 jours
  saleId?: string;
  soldAt?: string;
  expiresAt?: string;
  paymentMethod?: PortusPaymentMethod;
  plateNumber?: string;
  driverPhone?: string;
  driverName?: string;
  isSuperseded?: boolean;
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
  id: string;
  ticketId: string;
  ticketNumber: string;
  agentId: string;
  agentName: string;
  sectorId?: string;
  sectorName?: string;
  plateNumber: string;
  driverPhone?: string;
  driverName?: string;
  vehicleCategory?: string;
  soldAt: string;
  expiresAt?: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAccuracy: number | null;
  gpsStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'GPS_UNAVAILABLE';
  syncedAt?: string;
  syncStatus: 'PENDING_SYNC' | 'SYNCED';
  price: number;
  paymentMethod?: PortusPaymentMethod;
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
  resultType?: 'VALID' | 'CANCELLED' | 'INVALID_UNKNOWN' | 'SUPERSEDED' | 'NOT_SOLD' | 'EXPIRED';
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
  suspectedAgentId?: string;
  suspectedAgentName?: string;
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
  montant?: number;
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
  | 'CARNET_DELETED'
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
  | 'SOS_REPORTED'
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
  | 'CONFIG_UPDATE'
  | 'SECURITY_ALERT';

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  action: AuditAction;
  timestamp: string;
  targetEntity: string;
  targetId: string;
  oldValue?: string | number | boolean | Record<string, unknown> | null;
  newValue?: string | number | boolean | Record<string, unknown> | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  details?: string | Record<string, unknown> | null;
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
  discrepancy: number;
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
  difference: number;
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

export type PortusPaymentMethod =
  | 'ESPECES'
  | 'WAVE'
  | 'ORANGE_MONEY'
  | 'MOOV'
  | 'MTN_MOMO'
  | 'BON_ABONNEMENT'
  | 'MOBILE_MONEY'
  | 'AUTRE';

export type SOSAlertStatus = 'ACTIVE' | 'RESOLU';

export interface SOSAlert {
  id: string;
  agentId: string;
  agentName: string;
  agentRole: Role;
  sectorId?: string;
  sectorName?: string;
  latitude: number | null;
  longitude: number | null;
  alertedAt: string;
  status: SOSAlertStatus;
  reason?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

export type LitigeStatus = 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'REJETE';

export interface LitigeChauffeur {
  id: string;
  plateNumber: string;
  driverPhone?: string;
  driverName?: string;
  ticketNumber?: string;
  reason: 'TICKET_DEJA_PAYE' | 'TICKET_PERDU' | 'ERREUR_IMMATRICULATION' | 'AUTRE';
  description: string;
  status: LitigeStatus;
  reportedBy: string;
  reportedByName: string;
  reportedAt: string;
  decisionNote?: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type BrigadeType = 'MATIN' | 'SOIR' | 'NUIT';
export type SectorType = 'VRIDI_PORT' | 'CANAL' | 'ZI' | 'SIR';

export interface BrigadeAssignment {
  id: string;
  userId: string;
  userName: string;
  userRole: Role;
  brigade: BrigadeType;
  sector: SectorType;
  sectorName: string;
  shiftDate: string;
  checkInAt?: string;
  checkInApprovedBy?: string;
  checkInApprovedByName?: string;
  checkOutAt?: string;
  notes?: string;
  status: 'PLANIFIE' | 'PRESENT' | 'ABSENT' | 'TERMINE';
  createdAt: string;
}
