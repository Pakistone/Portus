/**
 * Service Métier Finances pour PORTUS — U.J.S.R.V.
 * Gère les dépenses, les remises financières, les clôtures journalières et le rapprochement
 */

import { getSupabase } from '../db/supabaseClient';
import { getDB } from '../db/indexedDb';
import { generateUUID } from '../utils/uuid';
import type { Expense, Remise, DailyClosing, CashManagementSummary, FinancialReconciliation, User } from '../types';

/**
 * Calcul du solde net attendu en caisse
 */
export function calculateNetCashSession(params: {
  totalSales: number;
  totalExpenses: number;
  openingBalance?: number;
}): number {
  return (params.openingBalance || 0) + params.totalSales - params.totalExpenses;
}

/**
 * Enregistrement d'une clôture journalière
 */
export async function submitDailyClosing(params: {
  date: string;
  expectedBalance: number;
  declaredCash: number;
  difference: number;
  totalSales: number;
  totalExpenses: number;
  totalRemises: number;
  ticketCount: number;
  notes?: string;
  closedBy: User;
}): Promise<DailyClosing> {
  const now = new Date().toISOString();
  const closingRecord: DailyClosing = {
    id: generateUUID(),
    closingReference: `CLO-${params.date.replace(/-/g, '')}`,
    closingDate: params.date,
    date: params.date,
    cashierId: params.closedBy.id,
    cashierName: params.closedBy.fullName,
    closedById: params.closedBy.id,
    closedByName: params.closedBy.fullName,
    closedAt: now,
    openingBalance: 0,
    cashSalesAmount: params.totalSales,
    digitalSalesAmount: 0,
    refundsAmount: 0,
    expensesAmount: params.totalExpenses,
    totalSales: params.totalSales,
    totalExpenses: params.totalExpenses,
    totalRemises: params.totalRemises,
    ticketCount: params.ticketCount,
    expectedBalance: params.expectedBalance,
    declaredBalance: params.declaredCash,
    declaredCash: params.declaredCash,
    difference: params.difference,
    discrepancy: params.difference,
    notes: params.notes,
    status: 'CONFIRMED',
    isLocked: true,
    createdAt: now,
    updatedAt: now,
  };

  // 1. Sauvegarde locale dans IndexedDB
  try {
    const db = await getDB();
    if (db.objectStoreNames.contains('daily_closings')) {
      await db.put('daily_closings', closingRecord);
    }
    if (db.objectStoreNames.contains('audit_logs')) {
      await db.put('audit_logs', {
        id: generateUUID(),
        actorId: params.closedBy.id,
        actorName: params.closedBy.fullName,
        actorRole: params.closedBy.role,
        action: 'DAILY_CLOSING_SUBMITTED',
        targetEntity: 'DailyClosing',
        targetId: closingRecord.id,
        timestamp: now,
        details: JSON.stringify({
          date: params.date,
          expectedBalance: params.expectedBalance,
          declaredCash: params.declaredCash,
          difference: params.difference,
          ticketCount: params.ticketCount,
        }),
      });
    }
  } catch (err) {
    console.warn('Erreur IndexedDB clôture:', err);
  }

  // 2. Synchronisation Supabase si disponible
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('daily_closings').upsert({
        id: closingRecord.id,
        closing_reference: closingRecord.closingReference,
        closing_date: closingRecord.closingDate,
        cashier_id: closingRecord.cashierId,
        opening_balance: closingRecord.openingBalance,
        cash_sales_amount: closingRecord.cashSalesAmount,
        digital_sales_amount: closingRecord.digitalSalesAmount,
        refunds_amount: closingRecord.refundsAmount,
        expenses_amount: closingRecord.expensesAmount,
        expected_balance: closingRecord.expectedBalance,
        declared_balance: closingRecord.declaredBalance,
        discrepancy: closingRecord.discrepancy,
        notes: closingRecord.notes || null,
        status: closingRecord.status,
        is_locked: closingRecord.isLocked,
        created_at: closingRecord.createdAt,
        updated_at: closingRecord.updatedAt,
      });
    } catch (err) {
      console.warn('Erreur Supabase enregistrement clôture:', err);
    }
  }

  return closingRecord;
}

export const FinanceService = {
  calculateCashSummary(params: {
    openingBalance?: number;
    sales: Array<{ price: number; paymentMethod?: string; ticketNumber: string }>;
    expenses?: Array<{ amount: number; status: string }>;
    refunds?: number;
    declaredBalance?: number;
  }): CashManagementSummary {
    const opening = params.openingBalance || 0;
    let cashSales = 0;
    let digitalPayments = 0;
    const ticketsSoldList: string[] = [];

    params.sales.forEach((s) => {
      ticketsSoldList.push(s.ticketNumber);
      if (s.paymentMethod === 'MOBILE_MONEY') {
        digitalPayments += s.price;
      } else {
        cashSales += s.price;
      }
    });

    const refunds = params.refunds || 0;
    const validatedExpenses = (params.expenses || [])
      .filter((e) => e.status === 'VALIDATED' || e.status === 'VALIDEE' || e.status === 'PAYEE')
      .reduce((sum, e) => sum + e.amount, 0);

    const expectedBalance = opening + cashSales - refunds - validatedExpenses;
    const declared = params.declaredBalance !== undefined ? params.declaredBalance : expectedBalance;
    const difference = declared - expectedBalance;

    return {
      openingBalance: opening,
      cashSales,
      digitalPayments,
      refunds,
      expenses: validatedExpenses,
      expectedBalance,
      declaredBalance: declared,
      difference,
      salesCount: params.sales.length,
      ticketsSoldList,
    };
  },

  calculateReconciliation(params: {
    periodLabel: string;
    ticketsSold: number;
    ticketPrice?: number;
    validatedExpenses: number;
    remittancesReceived: number;
    declaredCash: number;
  }): FinancialReconciliation {
    const price = params.ticketPrice || 5000;
    const grossSalesExpected = params.ticketsSold * price;
    const netRevenueExpected = Math.max(0, grossSalesExpected - params.validatedExpenses);
    const unremittedBalance = Math.max(0, grossSalesExpected - params.remittancesReceived);
    const discrepancy = params.declaredCash - unremittedBalance;

    let status: FinancialReconciliation['status'] = 'BALANCED';
    if (discrepancy < -1000) status = 'DEFICIT';
    else if (discrepancy > 1000) status = 'SURPLUS';

    return {
      periodLabel: params.periodLabel,
      totalTicketsSold: params.ticketsSold,
      grossSalesExpected,
      totalExpensesValidated: params.validatedExpenses,
      netRevenueExpected,
      totalRemittancesReceived: params.remittancesReceived,
      declaredCashTotal: params.declaredCash,
      unremittedBalance,
      discrepancy,
      status,
    };
  },

  submitDailyClosing,
  calculateNetCashSession,
};
