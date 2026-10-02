/**
 * Service Assistant Opérationnel PORTUS — U.J.S.R.V. (Section 66)
 * Assistant en LECTURE SEULE répondant à des questions métier précises
 * fondées sur les données réelles de la base (sans hallucination ni altération).
 */

import type { Ticket, Carnet, Sale, Control, FraudReport, Remise, Expense } from '../types';
import { formatFCFA, formatDate } from '../utils/normalization';

export interface AssistantAnswer {
  question: string;
  answer: string;
  category: 'SALES' | 'CONTROLS' | 'CARNETS' | 'FINANCE' | 'GENERAL';
  metrics?: Record<string, string | number>;
}

export const AssistantService = {
  /**
   * Analyse une question opérationnelle et génère une réponse factuelle
   */
  processOperationalQuery(params: {
    question: string;
    tickets: Ticket[];
    carnets: Carnet[];
    sales: Sale[];
    controls: Control[];
    fraudReports: FraudReport[];
    remises: Remise[];
    expenses: Expense[];
    ticketPrice?: number;
  }): AssistantAnswer {
    const q = params.question.toLowerCase().trim();
    const today = new Date().toISOString().slice(0, 10);
    const price = params.ticketPrice || 5000;

    // 1. Ventes du jour
    if (q.includes('vendu') || q.includes('vente') || q.includes('aujourd') || q.includes('recette')) {
      const todaySales = params.sales.filter((s) => s.soldAt && s.soldAt.slice(0, 10) === today);
      const totalAmount = todaySales.reduce((sum, s) => sum + s.price, 0);

      return {
        question: params.question,
        category: 'SALES',
        answer: `Aujourd'hui (${formatDate(today)}), **${todaySales.length} ticket(s)** ont été vendus sur le secteur de Vridi, pour un montant total perçu de **${formatFCFA(totalAmount)}**.`,
        metrics: {
          ticketsVendus: todaySales.length,
          montantPerçu: totalAmount,
        },
      };
    }

    // 2. Contrôles et vérifications / anomalies
    if (q.includes('contrôle') || q.includes('verif') || q.includes('anomalie') || q.includes('fraude') || q.includes('échec')) {
      const todayControls = params.controls.filter((c) => c.controlledAt && c.controlledAt.slice(0, 10) === today);
      const invalidControls = todayControls.filter((c) => !c.isValid);
      const todayFrauds = params.fraudReports.filter((f) => f.reportedDate === today);

      return {
        question: params.question,
        category: 'CONTROLS',
        answer: `Activité de contrôle routier aujourd'hui : **${todayControls.length} contrôles** effectués, dont **${invalidControls.length} anomalie(s)** détectée(s) et **${todayFrauds.length} signalement(s) de fraude** en cours d'examen.`,
        metrics: {
          controlesTotal: todayControls.length,
          anomalies: invalidControls.length,
          fraudes: todayFrauds.length,
        },
      };
    }

    // 3. Carnets presque épuisés ou état des stocks
    if (q.includes('carnet') || q.includes('stock') || q.includes('épuisé') || q.includes('restant')) {
      const activeCarnets = params.carnets.filter((c) => c.status !== 'CANCELLED');
      const carnetsNearlyExhausted: Array<{ carnetNumber: string; remaining: number }> = [];

      activeCarnets.forEach((c) => {
        const carnetTickets = params.tickets.filter((t) => t.carnetId === c.id);
        const remaining = carnetTickets.filter(
          (t) => t.status === 'AVAILABLE' || t.status === 'ASSIGNED_TO_RESPONSIBLE' || t.status === 'ASSIGNED_TO_AGENT'
        ).length;
        if (remaining > 0 && remaining <= 5) {
          carnetsNearlyExhausted.push({ carnetNumber: c.carnetNumber, remaining });
        }
      });

      const totalAvailable = params.tickets.filter(
        (t) => t.status === 'AVAILABLE' || t.status === 'ASSIGNED_TO_RESPONSIBLE' || t.status === 'ASSIGNED_TO_AGENT'
      ).length;

      let detailMsg = '';
      if (carnetsNearlyExhausted.length > 0) {
        detailMsg = `\n\n⚠️ Carnets presque épuisés (≤ 5 tickets) : ${carnetsNearlyExhausted
          .map((c) => `**${c.carnetNumber}** (${c.remaining} restants)`)
          .join(', ')}.`;
      }

      return {
        question: params.question,
        category: 'CARNETS',
        answer: `État global des stocks : **${activeCarnets.length} carnet(s)** actifs et **${totalAvailable} ticket(s) encore disponibles**.${detailMsg}`,
        metrics: {
          carnetsActifs: activeCarnets.length,
          ticketsDisponibles: totalAvailable,
        },
      };
    }

    // 4. Caisse, remises et dépenses
    if (q.includes('caisse') || q.includes('remise') || q.includes('dépense') || q.includes('solde') || q.includes('écart')) {
      const totalSales = params.sales.reduce((sum, s) => sum + s.price, 0);
      const totalRemises = params.remises.reduce((sum, r) => sum + r.amount, 0);
      const validatedExpenses = params.expenses
        .filter((e) => e.status === 'VALIDATED')
        .reduce((sum, e) => sum + e.amount, 0);
      const netCash = Math.max(0, totalRemises - validatedExpenses);
      const ecartRemise = Math.max(0, totalSales - totalRemises);

      return {
        question: params.question,
        category: 'FINANCE',
        answer: `Situation financière globale : **${formatFCFA(totalRemises)}** de remises encaissées auprès des percepteurs, **${formatFCFA(validatedExpenses)}** de dépenses validées, soit une caisse nette de **${formatFCFA(netCash)}**. Le solde restant à verser par les agents est de **${formatFCFA(ecartRemise)}**.`,
        metrics: {
          remisesEncaissées: totalRemises,
          dépensesValidées: validatedExpenses,
          caisseNette: netCash,
          soldeRestantDu: ecartRemise,
        },
      };
    }

    // Réponse par défaut
    return {
      question: params.question,
      category: 'GENERAL',
      answer: `Je suis l'assistant opérationnel de supervision PORTUS (mode lecture seule sécurisé). Vous pouvez me poser des questions telles que :
- "Combien de tickets ont été vendus aujourd'hui ?"
- "Quel est l'état des contrôles routiers et des fraudes ?"
- "Quels carnets sont presque épuisés ?"
- "Quel est le solde de la caisse et des remises ?"`,
    };
  },
};
