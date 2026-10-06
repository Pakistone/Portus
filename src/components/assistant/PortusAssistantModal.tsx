import React, { useState } from 'react';
import {
  X,
  HelpCircle,
  MessageSquare,
  Send,
  Sparkles,
  TrendingUp,
  ShieldAlert,
  Layers,
  DollarSign,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { AssistantService, type AssistantAnswer } from '../../services/assistantService';

interface PortusAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PortusAssistantModal: React.FC<PortusAssistantModalProps> = ({ isOpen, onClose }) => {
  const { tickets, carnets, sales, controls, fraudReports, remises, expenses, ticketPrice } = useData();

  const [inputQuestion, setInputQuestion] = useState('');
  const [history, setHistory] = useState<AssistantAnswer[]>([
    {
      question: 'Introduction',
      answer:
        'Bonjour ! Je suis l’Assistant Opérationnel PORTUS — UJPAA (Lecture Seule). Je réponds instantanément à vos questions sur les ventes du jour, l’état des stocks de carnets, les contrôles routiers et la situation de caisse, sur la base exclusive des données réelles enregistrées.',
      category: 'GENERAL',
    },
  ]);

  if (!isOpen) return null;

  const handleAsk = (queryText: string) => {
    if (!queryText.trim()) return;

    const answer = AssistantService.processOperationalQuery({
      question: queryText.trim(),
      tickets,
      carnets,
      sales,
      controls,
      fraudReports,
      remises,
      expenses,
      ticketPrice,
    });

    setHistory((prev) => [...prev, answer]);
    setInputQuestion('');
  };

  const quickQuestions = [
    'Combien de tickets ont été vendus aujourd’hui ?',
    'Y a-t-il des fraudes ou anomalies détectées ?',
    'Quel est l’état des stocks de carnets ?',
    'Quelle est la situation financière et de caisse ?',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Assistant Opérationnel PORTUS</h3>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-slate-700">
                  Lecture Seule • Données Réelles
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Informations certifiées sans risque d'altération ni hallucination
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Historique des échanges */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {history.map((item, idx) => (
            <div key={idx} className="space-y-2">
              {idx > 0 && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-emerald-600 px-4 py-2.5 text-white font-medium shadow-sm">
                    {item.question}
                  </div>
                </div>
              )}
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl bg-slate-800/90 border border-slate-700/60 p-4 text-slate-200 leading-relaxed shadow-sm space-y-2">
                  <p className="whitespace-pre-wrap">{item.answer}</p>

                  {item.metrics && Object.keys(item.metrics).length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/50">
                      {Object.entries(item.metrics).map(([k, v]) => (
                        <div key={k} className="bg-slate-900/60 p-2 rounded-lg border border-slate-700/40">
                          <span className="text-[10px] text-slate-400 block capitalize">
                            {k.replace(/([A-Z])/g, ' $1')}
                          </span>
                          <span className="text-xs font-bold text-emerald-400 font-mono">
                            {typeof v === 'number' ? v.toLocaleString('fr-FR') : v}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Suggestions rapides */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-400">Suggestions rapides :</div>
          <div className="flex flex-wrap gap-1.5">
            {quickQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => handleAsk(q)}
                className="rounded-lg bg-slate-800/80 border border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300 transition text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Barre de saisie */}
        <div className="p-3 border-t border-slate-800 bg-slate-900 flex items-center gap-2">
          <input
            type="text"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAsk(inputQuestion);
            }}
            placeholder="Posez une question sur les opérations, les caisses, les camions..."
            className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
          />
          <button
            onClick={() => handleAsk(inputQuestion)}
            disabled={!inputQuestion.trim()}
            className="rounded-xl bg-emerald-600 p-2.5 text-white hover:bg-emerald-500 transition disabled:opacity-40"
            title="Envoyer la question"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
