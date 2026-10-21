/**
 * Contrats et définitions de types publics pour DataContext — PORTUS — U.J.P.A.S.
 * Union des Jeunes du Port pour l'Assistance et la Sécurité
 */

import type {
  User,
  Carnet,
  Ticket,
  Sale,
  Control,
  FraudReport,
  Remise,
  Expense,
  ExpenseCategory,
  AuditLog,
  FinancialAlert,
  Role,
  TicketStatus,
  NotificationRecord,
  Vehicle,
  DailyClosing,
  TicketReprint,
  SOSAlert,
  LitigeChauffeur,
  BrigadeAssignment,
  LitigeStatus,
  BrigadeType,
  SectorType,
  PortusPaymentMethod,
} from '../../types';
import { DEFAULT_SECTORS } from '../../config/constants';

export type VerificationStatus =
  | 'VALID'
  | 'INVALID'
  | 'CANCELLED'
  | 'INVALID_UNKNOWN'
  | 'SUSPICIOUS'
  | 'SUPERSEDED'
  | 'NOT_FOUND'
  | 'NOT_SOLD'
  | 'EXPIRED';

export interface VerifyTicketResult {
  status: VerificationStatus;
  bannerTitle: string;
  ticket: Ticket | null;
  agentName: string | null;
  agentPhone: string | null;
  agentAvatarUrl?: string | null;
  verifiedVia: 'SERVER' | 'LOCAL_CACHE';
  message: string;
  isRepeatedControl: boolean;
  previousControlCount: number;
  expiresAt?: string | null;
  isExpired?: boolean;
}

export interface DuplicateCheckResult {
  hasActiveTicket: boolean;
  activeTicket: Ticket | null;
  daysRemaining: number;
}

export interface DataContextType {
  // Données
  isLoading: boolean;
  users: User[];
  carnets: Carnet[];
  tickets: Ticket[];
  sales: Sale[];
  controls: Control[];
  fraudReports: FraudReport[];
  remises: Remise[];
  expenses: Expense[];
  auditLogs: AuditLog[];
  alerts: FinancialAlert[];
  notifications: NotificationRecord[];
  dailyClosings: DailyClosing[];
  vehicles: Vehicle[];
  ticketReprints: TicketReprint[];
  sosAlerts: SOSAlert[];
  litigesChauffeurs: LitigeChauffeur[];
  brigadeAssignments: BrigadeAssignment[];
  sectors: typeof DEFAULT_SECTORS;
  ticketPrice: number;
  updateTicketPrice: (newPrice: number) => Promise<void>;

  // Actions SOS, Litiges, Plannings
  resolveSOSAlert: (sosId: string, notes: string) => Promise<void>;
  createLitige: (params: {
    plateNumber: string;
    driverPhone?: string;
    driverName?: string;
    ticketNumber?: string;
    reason: 'TICKET_DEJA_PAYE' | 'TICKET_PERDU' | 'ERREUR_IMMATRICULATION' | 'AUTRE';
    description: string;
  }) => Promise<LitigeChauffeur>;
  updateLitigeStatus: (litigeId: string, status: LitigeStatus, decisionNote: string) => Promise<LitigeChauffeur>;
  createBrigadeAssignment: (params: {
    userId: string;
    userName: string;
    userRole: Role;
    brigade: BrigadeType;
    sector: SectorType;
    sectorName: string;
    shiftDate: string;
    notes?: string;
  }) => Promise<BrigadeAssignment>;
  checkInBrigade: (assignmentId: string) => Promise<void>;
  checkOutBrigade: (assignmentId: string, notes?: string) => Promise<void>;

  // Actions Dépenses
  createExpense: (params: {
    amount: number;
    category: ExpenseCategory;
    description: string;
    expenseDate: string;
    receiptUrl?: string | null;
    offlineId?: string;
  }) => Promise<Expense>;
  validateExpense: (expenseId: string) => Promise<Expense>;
  rejectExpense: (expenseId: string, reason: string) => Promise<Expense>;
  cancelExpense: (expenseId: string, reason: string) => Promise<Expense>;
  correctExpense: (expenseId: string, newAmount: number, reason: string) => Promise<Expense>;

  // Actions Clôture, Véhicules & Réimpressions
  submitDailyClosing: (params: {
    openingBalance: number;
    cashSalesAmount: number;
    digitalSalesAmount: number;
    refundsAmount: number;
    expensesAmount: number;
    expectedBalance: number;
    declaredBalance: number;
    notes?: string;
  }) => Promise<DailyClosing>;
  upsertVehicle: (vehicleData: Partial<Vehicle> & { plateNumber: string }) => Promise<Vehicle>;
  recordTicketReprint: (ticketId: string, reason: string) => Promise<{ reprint: TicketReprint; isSuspicious: boolean }>;

  // Notifications
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllNotificationsAsRead: (recipientId?: string) => Promise<void>;

  // Statuts réseau et synchronisation
  isOnline: boolean;
  isSimulatedOffline: boolean;
  toggleSimulatedOffline: () => void;
  isSyncing: boolean;
  pendingSyncCount: number;
  lastSyncedSaleNumber: string | null;
  syncOfflineQueue: () => Promise<void>;
  syncAllToSupabase: () => Promise<{ success: boolean; message: string; count: number }>;
  isRlsPermissionIssue: boolean;
  lastRlsError: string;

  // Alertes Realtime Sécurité Routière (Contrôleurs & Supervision)
  latestRealtimeIncident: FraudReport | null;
  dismissLatestIncident: () => void;
  isRealtimeConnected: boolean;
  simulateIncidentForTesting: (plateNumber?: string) => Promise<void>;

  // Actions ADMINISTRATEUR
  createUser: (userData: {
    username: string;
    fullName: string;
    role: Role;
    sectorId?: string;
    phone?: string;
    avatarUrl?: string;
    matricule?: string;
    brigade?: string;
    passwordRaw: string;
  }) => Promise<User>;
  updateUser: (
    userId: string,
    updates: {
      fullName?: string;
      phone?: string;
      sectorId?: string;
      role?: Role;
      avatarUrl?: string;
      matricule?: string;
      brigade?: string;
    }
  ) => Promise<User>;
  toggleUserActive: (userId: string) => Promise<void>;
  resetUserPassword: (userId: string, newPasswordRaw: string) => Promise<void>;
  changeOwnPassword: (newPasswordRaw: string) => Promise<void>;
  resetApplicationData: () => Promise<void>;
  createCarnet: (params: {
    seriesPrefix?: string;
    size: number;
    startPhysicalNumber?: number;
    assignedResponsableId?: string;
  }) => Promise<{ carnet: Carnet; tickets: Ticket[] }>;
  assignCarnetToResponsable: (carnetId: string, responsableId: string) => Promise<Carnet>;
  cancelCarnet: (carnetId: string, reason: string) => Promise<Carnet>;
  deleteCarnet: (carnetId: string) => Promise<void>;
  deleteCarnetPermanently?: (carnetId: string) => Promise<void>;
  updateTicketStatus: (ticketId: string, newStatus: TicketStatus, reason?: string) => Promise<Ticket>;
  cancelTicket: (ticketId: string, reason: string) => Promise<void>;
  correctRemiseAdmin: (
    remiseId: string,
    newAmount: number,
    newNote: string,
    reason: string
  ) => Promise<void>;

  // Actions RESPONSABLE & ADMIN
  assignTicketsToAgent: (ticketIds: string[], agentId: string) => Promise<{ count: number; ticketNumbers: string[] }>;
  reassignUnsoldTickets: (ticketIds: string[], newAgentId: string) => Promise<{ count: number; ticketNumbers: string[] }>;
  correctPlateNumber: (ticketId: string, newPlate: string, reason: string) => Promise<void>;
  recordRemise: (params: {
    agentId: string;
    amount: number;
    note?: string;
  }) => Promise<Remise>;

  // Actions AGENT
  checkDuplicatePlate: (plate: string) => DuplicateCheckResult;
  sellTicket: (params: {
    ticketId: string;
    plateNumber: string;
    driverPhone?: string;
    driverName?: string;
    overrideOldTicketId?: string;
    paymentMethod?: PortusPaymentMethod;
    paymentReference?: string;
  }) => Promise<Sale>;
  getAgentStats: (agentId: string) => {
    assignedCount: number;
    availableCount: number;
    soldCount: number;
    ticketsSold: number;
    totalSalesAmount: number;
    expectedAmount: number;
    remittedAmount: number;
    remainingBalance: number;
    ecart: number;
    unremittedTicketsCount: number;
  };
  getRecentPlates: () => string[];

  // Actions CONTRÔLEUR
  verifyTicket: (identifier: string) => Promise<VerifyTicketResult>;
  searchTicketsByPlate: (plate: string) => Promise<Ticket[]>;
  recordControl: (
    ticketNumberOrParams: string | {
      ticketNumber: string;
      plateNumber: string;
      isValid: boolean;
      message: string;
      resultType?: Control['resultType'];
    },
    plateNumber?: string,
    isValid?: boolean,
    message?: string
  ) => Promise<Control>;
  reportFraud: (report: {
    ticketNumber?: string;
    plateNumber: string;
    type: FraudReport['type'];
    typeLabel: string;
    comment: string;
    photos?: string[];
    photoDataUrl?: string;
    reason?: string;
    reasonLabel?: string;
    suspectedAgentId?: string;
    suspectedAgentName?: string;
  }) => Promise<FraudReport>;
  updateFraudReportStatus: (
    fraudId: string,
    newStatus: FraudReport['status'],
    decisionNote: string
  ) => Promise<FraudReport>;

  // Rechargement manuel des données
  refreshData: (forceSync?: boolean) => Promise<void>;
  triggerSOSAlert: (message?: string) => Promise<FraudReport>;
}
