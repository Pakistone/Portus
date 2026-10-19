import { useState, useCallback } from 'react';
import type { Expense, ExpenseCategory, User, NotificationRecord } from '../../../types';
import { getDB } from '../../../db/indexedDb';
import { normalizeText, formatFCFA } from '../../../utils/normalization';
import { generateUUID } from '../../../utils/uuid';
import { SupabaseDataLayer } from '../../../db/supabaseService';

export function useExpenses(
  currentUser: User | null,
  recordAudit: (action: any, entity: string, id: string, details?: string, oldVal?: any, newVal?: any) => Promise<void>,
  refreshData: (forceSync?: boolean) => Promise<void>
) {
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const createExpense = useCallback(async (params: {
    amount: number;
    category: ExpenseCategory;
    description: string;
    expenseDate: string;
    receiptUrl?: string | null;
    offlineId?: string;
  }): Promise<Expense> => {
    if (!currentUser || (currentUser.role !== 'ADMINISTRATEUR' && currentUser.role !== 'RESPONSABLE')) {
      throw new Error("Privilège insuffisant : Seul un administrateur ou un responsable peut enregistrer une dépense.");
    }
    if (params.amount <= 0) {
      throw new Error('Le montant de la dépense doit être strictement positif.');
    }
    if (!params.description.trim()) {
      throw new Error('Le motif ou la description de la dépense est obligatoire.');
    }

    const db = await getDB();
    const allExpenses: Expense[] = await db.getAll('expenses');
    const expenseNumber = `EXP-2026-${String(allExpenses.length + 1).padStart(6, '0')}`;
    const expenseId = generateUUID();
    const nowIso = new Date().toISOString();

    const expense: Expense = {
      id: expenseId,
      expenseNumber,
      amount: params.amount,
      category: params.category,
      description: normalizeText(params.description),
      expenseDate: params.expenseDate,
      receiptUrl: params.receiptUrl || null,
      status: 'PENDING',
      createdBy: currentUser.id,
      createdByName: currentUser.fullName,
      createdByRole: currentUser.role,
      responsibleId: currentUser.role === 'RESPONSABLE' ? currentUser.id : null,
      responsibleName: currentUser.role === 'RESPONSABLE' ? currentUser.fullName : null,
      sectorId: currentUser.sectorId || null,
      sectorName: currentUser.sectorName || null,
      createdAt: nowIso,
      updatedAt: nowIso,
      offlineId: params.offlineId || null,
    };

    await db.put('expenses', expense);

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertExpense(expense).catch((err) =>
        console.warn('Supabase insertExpense warning:', err)
      );
    }

    const admins: User[] = (await db.getAll('users')).filter((u: User) => u.role === 'ADMINISTRATEUR' && u.isActive);
    for (const admin of admins) {
      const notif: NotificationRecord = {
        id: `notif-exp-${expenseId}-${admin.id}`,
        recipientId: admin.id,
        senderId: currentUser.id,
        title: `NOUVELLE DÉPENSE À VALIDER : ${expenseNumber}`,
        message: `${currentUser.fullName} (${currentUser.role}) a soumis une dépense de ${formatFCFA(params.amount)} (${params.category}).`,
        level: 'WARNING',
        type: 'FINANCIAL_ALERT',
        metadata: { expenseId, expenseNumber, amount: params.amount },
        isRead: false,
        createdAt: nowIso,
      };
      if (db.objectStoreNames.contains('notifications')) {
        await db.put('notifications', notif);
      }
    }

    await recordAudit(
      'EXPENSE_CREATED',
      'Expense',
      expenseId,
      `Création de la dépense ${expenseNumber} (${params.category}) d'un montant de ${formatFCFA(params.amount)}`
    );

    await refreshData();
    return expense;
  }, [currentUser, recordAudit, refreshData]);

  const validateExpense = useCallback(async (expenseId: string): Promise<Expense> => {
    if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error("Privilège insuffisant : Seul l'administrateur peut valider une dépense.");
    }
    const db = await getDB();
    const expense = await db.get('expenses', expenseId);
    if (!expense) throw new Error('Dépense introuvable.');
    if (expense.status !== 'PENDING') {
      throw new Error('Cette dépense a déjà été traitée.');
    }

    const nowIso = new Date().toISOString();
    expense.status = 'VALIDATED';
    expense.approvedBy = currentUser.id;
    expense.approvedByName = currentUser.fullName;
    expense.approvedAt = nowIso;
    expense.updatedAt = nowIso;

    await db.put('expenses', expense);

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.updateExpenseStatus({
        expenseId: expense.id,
        status: 'VALIDATED',
        approvedBy: currentUser.id,
      }).catch((err) => console.warn('Supabase validateExpense warning:', err));
    }

    if (expense.createdBy && expense.createdBy !== currentUser.id) {
      const notif: NotificationRecord = {
        id: `notif-exp-val-${expenseId}-${Date.now()}`,
        recipientId: expense.createdBy,
        senderId: currentUser.id,
        title: `DÉPENSE VALIDÉE : ${expense.expenseNumber}`,
        message: `Votre dépense de ${formatFCFA(expense.amount)} (${expense.category}) a été validée par l'administrateur.`,
        level: 'INFO',
        type: 'FINANCIAL_ALERT',
        metadata: { expenseId, expenseNumber: expense.expenseNumber },
        isRead: false,
        createdAt: nowIso,
      };
      if (db.objectStoreNames.contains('notifications')) {
        await db.put('notifications', notif);
      }
    }

    await recordAudit(
      'EXPENSE_VALIDATED',
      'Expense',
      expenseId,
      `Validation de la dépense ${expense.expenseNumber} d'un montant de ${formatFCFA(expense.amount)}`
    );

    await refreshData();
    return expense;
  }, [currentUser, recordAudit, refreshData]);

  const rejectExpense = useCallback(async (expenseId: string, reason: string): Promise<Expense> => {
    if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error("Privilège insuffisant : Seul l'administrateur peut rejeter une dépense.");
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error('Veuillez fournir un motif de rejet valide (minimum 5 caractères).');
    }
    const db = await getDB();
    const expense = await db.get('expenses', expenseId);
    if (!expense) throw new Error('Dépense introuvable.');
    if (expense.status !== 'PENDING') {
      throw new Error('Cette dépense a déjà été traitée.');
    }

    const nowIso = new Date().toISOString();
    expense.status = 'REJECTED';
    expense.rejectionReason = normalizeText(reason);
    expense.approvedBy = currentUser.id;
    expense.approvedByName = currentUser.fullName;
    expense.approvedAt = nowIso;
    expense.updatedAt = nowIso;

    await db.put('expenses', expense);

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.updateExpenseStatus({
        expenseId: expense.id,
        status: 'REJECTED',
        approvedBy: currentUser.id,
        reason: normalizeText(reason),
      }).catch((err) => console.warn('Supabase rejectExpense warning:', err));
    }

    if (expense.createdBy && expense.createdBy !== currentUser.id) {
      const notif: NotificationRecord = {
        id: `notif-exp-rej-${expenseId}-${Date.now()}`,
        recipientId: expense.createdBy,
        senderId: currentUser.id,
        title: `DÉPENSE REJETÉE : ${expense.expenseNumber}`,
        message: `Votre dépense de ${formatFCFA(expense.amount)} a été rejetée. Motif : ${reason}`,
        level: 'WARNING',
        type: 'FINANCIAL_ALERT',
        metadata: { expenseId, expenseNumber: expense.expenseNumber, reason },
        isRead: false,
        createdAt: nowIso,
      };
      if (db.objectStoreNames.contains('notifications')) {
        await db.put('notifications', notif);
      }
    }

    await recordAudit(
      'EXPENSE_REJECTED',
      'Expense',
      expenseId,
      `Rejet de la dépense ${expense.expenseNumber}. Motif : ${reason}`
    );

    await refreshData();
    return expense;
  }, [currentUser, recordAudit, refreshData]);

  const cancelExpense = useCallback(async (expenseId: string, reason: string): Promise<Expense> => {
    if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error("Privilège insuffisant : Seul l'administrateur peut annuler une dépense validée.");
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error("Veuillez fournir un motif d'annulation valide.");
    }
    const db = await getDB();
    const expense = await db.get('expenses', expenseId);
    if (!expense) throw new Error('Dépense introuvable.');

    const nowIso = new Date().toISOString();
    expense.status = 'CANCELLED';
    expense.cancellationReason = normalizeText(reason);
    expense.updatedAt = nowIso;

    await db.put('expenses', expense);

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.updateExpenseStatus({
        expenseId: expense.id,
        status: 'CANCELLED',
        approvedBy: currentUser.id,
        reason: normalizeText(reason),
      }).catch((err) => console.warn('Supabase cancelExpense warning:', err));
    }

    await recordAudit(
      'EXPENSE_CANCELLED',
      'Expense',
      expenseId,
      `Annulation de la dépense validée ${expense.expenseNumber} (${formatFCFA(expense.amount)}). Motif : ${reason}`
    );

    await refreshData();
    return expense;
  }, [currentUser, recordAudit, refreshData]);

  const correctExpense = useCallback(async (expenseId: string, newAmount: number, reason: string): Promise<Expense> => {
    if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error("Privilège insuffisant : Seul l'administrateur peut corriger une dépense.");
    }
    if (newAmount <= 0) {
      throw new Error('Le montant corrigé doit être strictement positif.');
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error('Veuillez fournir un motif de correction valide.');
    }
    const db = await getDB();
    const expense = await db.get('expenses', expenseId);
    if (!expense) throw new Error('Dépense introuvable.');

    const oldAmount = expense.amount;
    const nowIso = new Date().toISOString();
    expense.amount = newAmount;
    expense.correctionReason = normalizeText(reason);
    expense.updatedAt = nowIso;

    await db.put('expenses', expense);

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertExpense(expense).catch((err) =>
        console.warn('Supabase correctExpense warning:', err)
      );
    }

    await recordAudit(
      'EXPENSE_CORRECTED',
      'Expense',
      expenseId,
      `Correction administrative de la dépense ${expense.expenseNumber} : ${formatFCFA(oldAmount)} -> ${formatFCFA(newAmount)}. Motif : ${reason}`
    );

    await refreshData();
    return expense;
  }, [currentUser, recordAudit, refreshData]);

  return {
    expenses,
    setExpenses,
    createExpense,
    validateExpense,
    rejectExpense,
    cancelExpense,
    correctExpense,
  };
}
