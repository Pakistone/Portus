import React, { useState } from 'react';
import { X, Download, Printer, Shield, CheckCircle2, Ticket, Award, FileText, ExternalLink, Eye } from 'lucide-react';
import { ORG_INFO } from '../../config/constants';

interface OfficialStampModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'ticket' | 'logo' | 'stamp';

export function OfficialStampModal({ isOpen, onClose }: OfficialStampModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ticket');

  if (!isOpen) return null;

  const handleDownload = (url: string, filename: string) => {
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const handlePrintImage = (src: string, title: string, subtitle: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} — ${ORG_INFO.SHORT_ORG_NAME}</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; }
            .content-box { max-width: 900px; width: 100%; text-align: center; }
            .content-box img { max-width: 100%; height: auto; max-height: 75vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .info { margin-top: 24px; color: #1e293b; }
            .info h2 { margin: 0 0 6px 0; color: #0d4a36; font-size: 20px; font-weight: 800; }
            .info p { margin: 4px 0; font-size: 13px; color: #64748b; }
            .footer-legal { margin-top: 16px; font-size: 11px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 10px; }
            @media print {
              body { padding: 0; }
              .content-box img { max-height: 85vh; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="content-box">
            <img src="${src}" alt="${title}" />
            <div class="info">
              <h2>${title}</h2>
              <p>${subtitle}</p>
              <p>Contacts officiels : ${ORG_INFO.CONTACT_TEL} | ${ORG_INFO.CONTACT_EMAIL}</p>
              <div class="footer-legal">Document officiel certifié — ${ORG_INFO.FULL_ORG_NAME} (${ORG_INFO.SHORT_ORG_NAME})</div>
            </div>
          </div>
          <script>
            window.onload = () => { setTimeout(() => { window.print(); }, 250); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-5 animate-fade-in">
      <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/90 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-white text-lg tracking-wide">Identité Officielle {ORG_INFO.SHORT_ORG_NAME}</h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/40">
                  NOUVELLE ÉDITION
                </span>
              </div>
              <p className="text-xs text-slate-400">{ORG_INFO.FULL_ORG_NAME}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre d'onglets */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-6 shrink-0 gap-2">
          <button
            onClick={() => setActiveTab('ticket')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'ticket'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Ticket className="w-4 h-4" />
            <span>Nouveau Modèle de Ticket UJPAS</span>
          </button>

          <button
            onClick={() => setActiveTab('logo')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'logo'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Emblème Officiel UJPAS</span>
          </button>

          <button
            onClick={() => setActiveTab('stamp')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'stamp'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Validation & Sécurité UJPAS</span>
          </button>
        </div>

        {/* Corps avec défilement */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ONGLET 1 : MODÈLE DE TICKET UJPAS */}
          {activeTab === 'ticket' && (
            <div className="space-y-6">
              {/* Carte visuelle du Spécimen */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-6 shadow-inner flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-3 text-xs text-slate-400">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    Spécimen Certifié Conforme (Haute Sécurité UJPAS)
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">Réf. VRDCH-000001</span>
                </div>
                <div className="w-full overflow-hidden rounded-xl border border-slate-700 bg-white/5 shadow-2xl">
                  <img
                    src={ORG_INFO.TICKET_SPECIMEN_PATH}
                    alt="Spécimen Officiel du Nouveau Ticket UJPAS"
                    className="w-full h-auto max-h-[380px] object-contain mx-auto"
                  />
                </div>
              </div>

              {/* Grille explicative des éléments de sécurité du nouveau ticket */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 space-y-1">
                  <span className="font-bold text-orange-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-orange-400" />
                    En-tête &amp; Mission Officielle UJPAS
                  </span>
                  <p className="text-slate-300">
                    « UNION DES JEUNES DU PORT POUR L'ASSISTANCE ET LA SÉCURITÉ (UJPAS) » avec mention « SURVEILLANCE &amp; LOGISTIQUE - PORT D’ABIDJAN » et « {ORG_INFO.ZONE} ».
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 space-y-1">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Cases d'Immatriculation &amp; Chauffeur
                  </span>
                  <p className="text-slate-300">
                    8 cases individuelles carrées pour les caractères de la plaque minéralogique du camion contrôlé et ligne manuscrite chauffeur.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 space-y-1">
                  <span className="font-bold text-orange-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-orange-400" />
                    Rosace intaglio &amp; Sécurité Guillochée
                  </span>
                  <p className="text-slate-300">
                    Filigrane continu de sécurité papier monnaie et rosace centrale « VALIDATION UJPAS » avec ancre marine dorée et 3 étoiles.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3.5 space-y-1">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    QR Code Haute Densité avec Badge UJPAS
                  </span>
                  <p className="text-slate-300">
                    Cadre blanc sécurisé sous l'emblème avec QR code dynamique cryptographique et badge central orange « UJPAS ».
                  </p>
                </div>
              </div>

              {/* Alerte vérification */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-200 flex items-center justify-between">
                <span>
                  <strong>Numéro Vert de Vérification :</strong> {ORG_INFO.CONTACT_TEL} | {ORG_INFO.CONTACT_EMAIL}
                </span>
                <span className="font-bold text-orange-400 shrink-0">Zone Portuaire &amp; Industrielle PAA 🇨🇮</span>
              </div>
            </div>
          )}

          {/* ONGLET 2 : NOUVEAU LOGO UJPAS */}
          {activeTab === 'logo' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 flex flex-col items-center">
                <div className="w-72 h-72 sm:w-80 sm:h-80 rounded-2xl bg-white/5 border border-slate-800 p-4 shadow-2xl flex items-center justify-center">
                  <img
                    src={ORG_INFO.LOGO_PATH}
                    alt="Logo Officiel UJPAS"
                    className="w-full h-full object-contain filter drop-shadow-xl"
                  />
                </div>
                <div className="mt-4 text-center space-y-1">
                  <h4 className="text-base font-black text-white">{ORG_INFO.FULL_ORG_NAME}</h4>
                  <p className="text-xs text-emerald-400 font-bold">{ORG_INFO.SHORT_ORG_NAME} — Armoiries &amp; Emblème Officiel</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 space-y-1">
                  <span className="font-bold text-amber-400">1. La Fraternité &amp; l'Union</span>
                  <p className="text-slate-400">La poignée de main chaleureuse au sommet symbolisant l'entraide, la solidarité et l'entente.</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 space-y-1">
                  <span className="font-bold text-emerald-400">2. La Côte d'Ivoire &amp; le Camion</span>
                  <p className="text-slate-400">La silhouette géographique nationale tricolore surmontée du camion portuaire de fret de surveillance.</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 space-y-1">
                  <span className="font-bold text-blue-400">3. L'Ancre &amp; l'Écusson UJPAS</span>
                  <p className="text-slate-400">L'ancre marine et l'écusson bleu marine signant l'attachement au Port Autonome d'Abidjan.</p>
                </div>
              </div>
            </div>
          )}

          {/* ONGLET 3 : CACHET DE VALIDATION */}
          {activeTab === 'stamp' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 flex flex-col items-center">
                <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-2xl bg-white p-6 shadow-2xl flex items-center justify-center border border-slate-700">
                  <img
                    src={ORG_INFO.STAMP_PATH}
                    alt="Cachet de Validation UJPAS"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="mt-4 text-center space-y-1">
                  <h4 className="text-base font-black text-white">Cachet Officiel "VALIDATION UJPAS"</h4>
                  <p className="text-xs text-slate-400">Feston circulaire de sécurité pour validation physique des carnets et reçus</p>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Ce tampon certifié est automatiquement apposé sur les reçus numériques et les carnets imprimés par le système PORTUS.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Pied d'actions contextuel */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-slate-900 border-t border-slate-800 shrink-0">
          <div className="text-xs text-slate-400 hidden sm:block">
            {activeTab === 'ticket' && 'Format A4 paysage calibré 3x3 pour impression'}
            {activeTab === 'logo' && 'Résolution ultra-haute définition 1000×1000 px'}
            {activeTab === 'stamp' && 'Fichier PNG transparent certifié'}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              Fermer
            </button>

            {activeTab === 'ticket' && (
              <>
                <button
                  onClick={() => handlePrintImage(
                    ORG_INFO.TICKET_SPECIMEN_PATH,
                    'Spécimen Officiel de Ticket UJPAS',
                    "Union des Jeunes du Port pour l'Assistance et la Sécurité — Surveillance & Logistique"
                  )}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimer Spécimen</span>
                </button>
                <button
                  onClick={() => handleDownload(ORG_INFO.TICKET_SPECIMEN_PATH, 'SPECIMEN_TICKET_OFFICIEL_UJPAS.svg')}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-950 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger Ticket HD</span>
                </button>
              </>
            )}

            {activeTab === 'logo' && (
              <>
                <button
                  onClick={() => handleDownload(ORG_INFO.LOGO_PATH, 'LOGO_OFFICIEL_UJPAS.svg')}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-950 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger SVG Logo</span>
                </button>
              </>
            )}

            {activeTab === 'stamp' && (
              <>
                <button
                  onClick={() => handlePrintImage(
                    ORG_INFO.STAMP_PATH,
                    'Cachet Officiel VALIDATION UJPAS',
                    'Direction Surveillance & Logistique Portuaire'
                  )}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimer</span>
                </button>
                <button
                  onClick={() => handleDownload(ORG_INFO.STAMP_PATH, 'CACHET_OFFICIEL_VALIDATION_UJPAS.svg')}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-950 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger SVG Cachet</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
