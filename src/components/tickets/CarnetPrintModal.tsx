import React, { useRef, useState, useEffect, useMemo } from 'react';
import { X, Printer, Download, ExternalLink, CheckCircle2, Scissors, ZoomIn, ZoomOut, RotateCcw, Layers, FileText, Loader2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { renderTicketToDataUrl } from '../../utils/ticketImageRenderer';
import { formatTicketQrForCameraScan } from '../../utils/ticketSecurity';
import { printPdfDocument } from '../../utils/pdfGenerator';
import type { Carnet, Ticket } from '../../types';

interface CarnetPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  carnet: Carnet | null;
  pdfUrl: string | null;
  filename: string;
}

export const CarnetPrintModal: React.FC<CarnetPrintModalProps> = ({
  isOpen,
  onClose,
  carnet,
  pdfUrl,
  filename,
}) => {
  const { tickets } = useData();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const printContainerRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<'SHEETS' | 'PDF'>('SHEETS');
  const [fileSizeStr, setFileSizeStr] = useState<string>('');
  const [zoomScale, setZoomScale] = useState<number>(0.65);
  const [ticketImages, setTicketImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<boolean>(true);

  // Calcul et récupération des tickets du carnet
  const carnetTickets = useMemo(() => {
    if (!carnet) return [];
    const list = tickets.filter(
      (t) => t.carnetId === carnet.id || t.carnetNumber === carnet.carnetNumber
    );
    if (list.length > 0) {
      return [...list].sort((a, b) => (a.physicalNumber || 0) - (b.physicalNumber || 0));
    }

    // Repli de sécurité : reconstruction des tickets du carnet si non encore indexés
    const size = carnet.size || 6;
    const start = carnet.startNumber || 1;
    const prefix = carnet.seriesPrefix || 'VRDCH';
    return Array.from({ length: size }, (_, i) => {
      const num = start + i;
      const tNum = `${prefix}-${String(num).padStart(6, '0')}`;
      return {
        id: `gen-${carnet.id}-${num}`,
        carnetId: carnet.id,
        carnetNumber: carnet.carnetNumber,
        ticketNumber: tNum,
        physicalNumber: num,
        price: 5000,
        controlCount: 0,
        status: 'AVAILABLE' as const,
        createdAt: carnet.createdAt || new Date().toISOString(),
        qrPayload: formatTicketQrForCameraScan({
          ticketNumber: tNum,
          carnetNumber: carnet.carnetNumber,
          carnetCreatedAt: carnet.createdAt,
          price: 5000,
        }),
      };
    });
  }, [carnet, tickets]);

  // Découpage en pages de 6 tickets (2 lignes x 3 tickets par page A4 paysage)
  const pages = useMemo(() => {
    const p: Ticket[][] = [];
    for (let i = 0; i < carnetTickets.length; i += 6) {
      p.push(carnetTickets.slice(i, i + 6));
    }
    return p;
  }, [carnetTickets]);

  // Génération asynchrone ultra-rapide des images des tickets (Affichage instantané dès la 1ère page)
  useEffect(() => {
    if (!isOpen || carnetTickets.length === 0) return;
    let isMounted = true;

    const renderTicketBatch = async (batch: Ticket[]) => {
      return Promise.all(
        batch.map(async (t) => {
          try {
            const url = await renderTicketToDataUrl(t, {
              width: 1075, // 300 DPI pour 9.1 cm (longueur augmentée pour combler l'espace blanc à droite)
              height: 945,  // 300 DPI pour 8.0 cm (hauteur officielle)
              enhanceContrast: true,
              watermarkOpacity: 0.58,
              carnetCreatedAt: carnet?.createdAt,
              carnetNumber: carnet?.carnetNumber,
            });
            return { id: t.id, url };
          } catch (err) {
            console.warn('Erreur rendu ticket:', t.ticketNumber, err);
            return { id: t.id, url: '' };
          }
        })
      );
    };

    (async () => {
      // 1. Rendu prioritaire des 6 premiers tickets (Page 1) pour affichage immédiat
      const firstPageTickets = carnetTickets.slice(0, 6);
      const firstResults = await renderTicketBatch(firstPageTickets);
      if (!isMounted) return;

      const initialMap: Record<string, string> = {};
      firstResults.forEach((r) => {
        if (r.url) initialMap[r.id] = r.url;
      });
      setTicketImages(initialMap);
      setLoadingImages(false); // Libère immédiatement l'affichage pour l'utilisateur

      // 2. Traitement progressif des pages suivantes en arrière-plan sans bloquer la réactivité
      const remainingTickets = carnetTickets.slice(6);
      if (remainingTickets.length > 0) {
        const chunkSize = 12;
        for (let i = 0; i < remainingTickets.length; i += chunkSize) {
          if (!isMounted) return;
          const chunk = remainingTickets.slice(i, i + chunkSize);
          const chunkResults = await renderTicketBatch(chunk);
          if (!isMounted) return;

          setTicketImages((prev) => {
            const nextMap = { ...prev };
            chunkResults.forEach((r) => {
              if (r.url) nextMap[r.id] = r.url;
            });
            return nextMap;
          });

          // Laisser respirer le thread d'affichage pour une réactivité totale
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, carnetTickets]);

  // Détection de la taille du PDF
  useEffect(() => {
    if (!pdfUrl) return;
    fetch(pdfUrl)
      .then((res) => res.blob())
      .then((b) => {
        const mb = b.size / (1024 * 1024);
        if (mb >= 1) {
          setFileSizeStr(`${mb.toFixed(1)} Mo`);
        } else {
          setFileSizeStr(`${Math.round(b.size / 1024)} Ko`);
        }
      })
      .catch(() => {});
  }, [pdfUrl]);

  if (!isOpen || !carnet) return null;

  // Lancement de l'impression physique avec la mise en page A4 paysage stricte
  const handlePrint = () => {
    // 1. Si l'onglet PDF est actif ou si l'iframe interne est prête
    if (activeTab === 'PDF' && iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
        return;
      } catch (err) {
        console.warn('Impression iframe interne bloquée, repli printPdfDocument:', err);
      }
    }

    // 2. Impression directe par création d'une iframe isolée appliquant @page { size: A4 landscape; }
    try {
      const printRoot = printContainerRef.current;
      if (!printRoot) {
        window.print();
        return;
      }

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.name = 'portus-print-sheets-iframe';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        window.print();
        return;
      }

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html lang="fr">
          <head>
            <meta charset="utf-8" />
            <title>Impression Planches Carnet ${carnet.carnetNumber} — PORTUS</title>
            <style>
              @page {
                size: A4 landscape;
                margin: 4mm;
              }
              * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              body {
                margin: 0;
                padding: 0;
                background: #ffffff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
              }
              .a4-print-sheet {
                width: 29.7cm;
                height: 20.2cm;
                page-break-after: always;
                break-after: page;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                margin: 0 auto;
                padding: 2mm 0;
                overflow: hidden;
              }
              .strip-row {
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: flex-start;
                border: 2px dashed #1f2937 !important;
                padding: 0 !important;
                margin: 3mm auto !important;
                background: #ffffff;
                position: relative;
                width: 29.3cm !important;
                box-sizing: border-box;
              }
              .staple-margin {
                width: 1.5cm !important;
                height: 8.0cm !important;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                padding: 2mm 1mm;
                background: #f8fafc !important;
                border-right: 1.5px dotted #1f2937 !important;
                flex-shrink: 0;
                box-sizing: border-box;
              }
              .staple-target {
                width: 14px;
                height: 22px;
                border: 1px dashed #4b5563;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-size: 6px;
                font-weight: 800;
                color: #374151;
                border-radius: 2px;
                background: #ffffff;
              }
              .staple-text {
                font-size: 6px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: #1f2937;
                transform: rotate(-90deg);
                white-space: nowrap;
              }
              .ticket-img {
                width: 9.1cm !important;
                height: 8.0cm !important;
                max-width: 9.1cm !important;
                max-height: 8.0cm !important;
                object-fit: fill;
                display: block;
                filter: contrast(1.24) brightness(0.88) saturate(1.35) !important;
                -webkit-filter: contrast(1.24) brightness(0.88) saturate(1.35) !important;
              }
              .perf-gap {
                width: 2.5mm !important;
                height: 8.0cm !important;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                padding: 1.5mm 0;
                background: transparent;
                flex-shrink: 0;
              }
              .perf-line {
                flex: 1;
                width: 0;
                border-left: 1.5px dotted #1f2937 !important;
              }
              .perf-mark {
                font-size: 8px;
                font-weight: bold;
                color: #000000;
                line-height: 1;
              }
              .perf-text {
                font-size: 6px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: #000000;
                transform: rotate(-90deg);
                margin: 4px 0;
              }
              .cut-label {
                position: absolute;
                top: -9px;
                left: 12px;
                background: #ffffff;
                padding: 0 4px;
                font-size: 8px;
                font-weight: 700;
                color: #374151;
                text-transform: uppercase;
                letter-spacing: 0.4px;
              }
              .page-guide-text {
                font-size: 7.5px;
                color: #4b5563;
                text-align: center;
                margin-top: 2mm;
                font-weight: 600;
              }
            </style>
          </head>
          <body>
            ${printRoot.innerHTML}
          </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Échec impression iframe, appel direct window.print:', e);
          window.print();
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
          }, 15000);
        }
      }, 500);
    } catch (err) {
      console.warn('Erreur handlePrint:', err);
      window.print();
    }
  };

  const handleDownload = async () => {
    if (!pdfUrl) return;
    try {
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 1500);
    } catch {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) document.body.removeChild(link);
      }, 1500);
    }
  };

  const totalPages = pages.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-2 sm:p-4 animate-fade-in">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-6xl max-h-[96vh] flex flex-col text-slate-100 overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Impression Officielle — Carnet {carnet.carnetNumber}
                </h3>
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  {carnet.size || 6} TICKETS • {totalPages} PAGE(S) A4 PAYSAGE{fileSizeStr ? ` • ${fileSizeStr}` : ''}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Série {carnet.seriesPrefix} ({String(carnet.startNumber).padStart(6, '0')} à {String(carnet.endNumber).padStart(6, '0')}) • Grille 3×2 Paysage (2 bandes de 3 tickets de 9.1 × 8.0 cm + Marge d'agrafage 1.5 cm • Découpe ciseaux &amp; perforation)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre d'onglets & Actions */}
        <div className="border-b border-slate-800 bg-slate-950/40 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {/* Bouton Impression Directe */}
            <button
              onClick={handlePrint}
              disabled={loadingImages}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-lg shadow-emerald-950 transition cursor-pointer active:scale-98 disabled:opacity-50"
            >
              <Printer className="w-4 h-4 text-emerald-200" />
              <span>Lancer l'Impression (Boîte de dialogue)</span>
            </button>

            {/* Bouton Téléchargement PDF */}
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer active:scale-98"
            >
              <Download className="w-4 h-4 text-orange-400" />
              <span>Télécharger le Fichier PDF</span>
            </button>
          </div>

          {/* Onglets de prévisualisation */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-800/80 p-0.5 rounded-xl border border-slate-700">
              <button
                onClick={() => setActiveTab('SHEETS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'SHEETS'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Planches Découpe &amp; Perforation (HTML)</span>
              </button>
              <button
                onClick={() => setActiveTab('PDF')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'PDF'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Aperçu PDF Classique</span>
              </button>
            </div>

            {activeTab === 'SHEETS' && (
              <div className="hidden sm:flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-xl border border-slate-700 text-xs text-slate-300">
                <button
                  onClick={() => setZoomScale((z) => Math.max(0.40, z - 0.1))}
                  title="Zoom arrière"
                  className="p-1 hover:text-white"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] w-12 text-center">{Math.round(zoomScale * 100)}%</span>
                <button
                  onClick={() => setZoomScale((z) => Math.min(1.0, z + 0.1))}
                  title="Zoom avant"
                  className="p-1 hover:text-white"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomScale(0.65)}
                  title="Réinitialiser zoom"
                  className="p-1 hover:text-white ml-1 border-l border-slate-700"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Zone de contenu défilable */}
        <div className="flex-1 bg-slate-950 p-4 overflow-y-auto overflow-x-auto flex flex-col items-center justify-start min-h-[420px] max-h-[64vh]">
          {/* VUE 1 : PLANCHES DE DÉCOUPE & PERFORATION (HTML + TAILWIND + @MEDIA PRINT) */}
          {activeTab === 'SHEETS' && (
            <div className="w-full flex flex-col items-center space-y-6">
              {loadingImages ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                  <p className="text-xs font-semibold">Génération des tickets 10 × 8 cm à haut contraste pour imprimante jet d'encre...</p>
                </div>
              ) : (
                /* Conteneur de prévisualisation interactif avec échelle */
                <div
                  className="flex flex-col items-center gap-8 origin-top transition-transform"
                  style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top center' }}
                >
                  {pages.map((pageTickets, pageIdx) => {
                    const row1Tickets = pageTickets.slice(0, 3);
                    const row2Tickets = pageTickets.slice(3, 6);

                    return (
                      <div
                        key={`preview-page-${pageIdx}`}
                        className="bg-white text-slate-900 shadow-2xl rounded-sm px-[2mm] py-3 border border-slate-300 select-none flex flex-col items-center justify-center relative"
                        style={{
                          width: '29.7cm',
                          minHeight: '20.4cm',
                          boxSizing: 'border-box',
                        }}
                      >
                        {/* Indicateur de calage A4 */}
                        <div className="w-full flex items-center justify-between text-[10px] text-gray-500 font-bold mb-2 pb-1 border-b border-gray-200">
                          <span className="flex items-center gap-1.5">
                            <Scissors className="w-3 h-3 text-red-500" />
                            FEUILLE A4 PAYSAGE ({pageIdx + 1} / {totalPages}) — CARNET {carnet.carnetNumber}
                          </span>
                          <span className="text-gray-400 font-mono">
                            DIMENSIONS : 2 BANDES DE 3 TICKETS (9.1 × 8.0 CM) + TALON D'AGRAFAGE (1.5 CM) • LONGUEUR ÉTENDUE SANS ESPACE BLANC
                          </span>
                        </div>

                        {/* BANDE 1 (Ligne 1 de 3 tickets avec talon d'agrafage à gauche) */}
                        <div className="w-full flex flex-col items-center my-2">
                          <div className="w-[29.3cm] relative border-2 border-dashed border-gray-800 bg-white p-0 flex flex-row items-center justify-start box-border">
                            <span className="absolute -top-3 left-3 bg-white px-1 text-[8px] font-bold text-gray-700 tracking-wider uppercase border border-gray-300 rounded-xs flex items-center gap-1 z-10">
                              ✂ Découpe Bande 1 (Ciseaux)
                            </span>

                            {/* Talon / Marge d'agrafage à gauche (1.5 cm) pour relier le carnet */}
                            <div className="w-[1.5cm] h-[8.0cm] flex flex-col items-center justify-between py-2 px-1 bg-amber-50/40 border-r-2 border-dotted border-gray-700 shrink-0 select-none relative">
                              {/* Repère agrafe haut */}
                              <div className="w-3.5 h-6 border border-dashed border-gray-600 rounded-xs flex items-center justify-center bg-white shadow-2xs" title="Zone agrafe supérieure">
                                <span className="text-[7px] text-gray-500 font-mono">⁝</span>
                              </div>

                              <div className="flex flex-col items-center gap-0.5 my-auto">
                                <span className="text-[7px] font-black uppercase tracking-wider text-gray-700 transform -rotate-90 whitespace-nowrap">
                                  AGRAFAGE
                                </span>
                                <span className="text-[5.5px] font-bold uppercase tracking-tight text-gray-500 transform -rotate-90 whitespace-nowrap mt-4">
                                  RELIURE CARNET
                                </span>
                              </div>

                              {/* Repère agrafe bas */}
                              <div className="w-3.5 h-6 border border-dashed border-gray-600 rounded-xs flex items-center justify-center bg-white shadow-2xs" title="Zone agrafe inférieure">
                                <span className="text-[7px] text-gray-500 font-mono">⁝</span>
                              </div>
                            </div>

                            {row1Tickets.map((t, idx) => (
                              <React.Fragment key={t.id}>
                                {/* Image du ticket allongé (9.1cm x 8.0cm avec fond assombri et filtre haute visibilité) */}
                                <div className="w-[9.1cm] h-[8.0cm] shrink-0 overflow-hidden flex items-center justify-center bg-white">
                                  <img
                                    src={ticketImages[t.id]}
                                    alt={`Ticket ${t.ticketNumber}`}
                                    className="w-[9.1cm] h-[8.0cm] object-fill contrast-125 brightness-90 saturate-140 print:contrast-125 print:brightness-90 print:saturate-140 block"
                                    style={{
                                      width: '9.1cm',
                                      height: '8.0cm',
                                      filter: 'contrast(1.24) brightness(0.88) saturate(1.35)',
                                      objectFit: 'fill',
                                    }}
                                  />
                                </div>

                                {/* Marge de perforation (uniquement entre les tickets d'une même ligne) */}
                                {idx < row1Tickets.length - 1 && (
                                  <div className="w-[2.5mm] h-[8.0cm] flex flex-col items-center justify-between py-1 bg-gray-50 select-none shrink-0 border-x border-gray-100">
                                    <span className="text-[8px] font-bold text-gray-700 leading-none">✁</span>
                                    <div className="flex-1 w-0 border-l-2 border-dotted border-gray-600 my-1" />
                                    <span className="text-[6px] font-extrabold uppercase tracking-tighter text-gray-600 transform -rotate-90">
                                      Perfo
                                    </span>
                                    <div className="flex-1 w-0 border-l-2 border-dotted border-gray-600 my-1" />
                                    <span className="text-[8px] font-bold text-gray-700 leading-none">✁</span>
                                  </div>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>

                        {/* Espace de séparation entre les 2 bandes (guide de coupe horizontale) */}
                        <div className="w-full flex items-center justify-center my-1.5 py-0.5 text-[8px] text-gray-400 font-bold uppercase tracking-widest gap-2">
                          <span className="border-b border-dotted border-gray-400 flex-1" />
                          <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                            ✂ Ligne de séparation médiane entre les 2 bandes (Découpe aux ciseaux) ✂
                          </span>
                          <span className="border-b border-dotted border-gray-400 flex-1" />
                        </div>

                        {/* BANDE 2 (Ligne 2 de 3 tickets avec talon d'agrafage à gauche) */}
                        {row2Tickets.length > 0 && (
                          <div className="w-full flex flex-col items-center my-2">
                            <div className="w-[29.3cm] relative border-2 border-dashed border-gray-800 bg-white p-0 flex flex-row items-center justify-start box-border">
                              <span className="absolute -top-3 left-3 bg-white px-1 text-[8px] font-bold text-gray-700 tracking-wider uppercase border border-gray-300 rounded-xs flex items-center gap-1 z-10">
                                ✂ Découpe Bande 2 (Ciseaux)
                              </span>

                              {/* Talon / Marge d'agrafage à gauche (1.5 cm) pour relier le carnet */}
                              <div className="w-[1.5cm] h-[8.0cm] flex flex-col items-center justify-between py-2 px-1 bg-amber-50/40 border-r-2 border-dotted border-gray-700 shrink-0 select-none relative">
                                {/* Repère agrafe haut */}
                                <div className="w-3.5 h-6 border border-dashed border-gray-600 rounded-xs flex items-center justify-center bg-white shadow-2xs" title="Zone agrafe supérieure">
                                  <span className="text-[7px] text-gray-500 font-mono">⁝</span>
                                </div>

                                <div className="flex flex-col items-center gap-0.5 my-auto">
                                  <span className="text-[7px] font-black uppercase tracking-wider text-gray-700 transform -rotate-90 whitespace-nowrap">
                                    AGRAFAGE
                                  </span>
                                  <span className="text-[5.5px] font-bold uppercase tracking-tight text-gray-500 transform -rotate-90 whitespace-nowrap mt-4">
                                    RELIURE CARNET
                                  </span>
                                </div>

                                {/* Repère agrafe bas */}
                                <div className="w-3.5 h-6 border border-dashed border-gray-600 rounded-xs flex items-center justify-center bg-white shadow-2xs" title="Zone agrafe inférieure">
                                  <span className="text-[7px] text-gray-500 font-mono">⁝</span>
                                </div>
                              </div>

                              {row2Tickets.map((t, idx) => (
                                <React.Fragment key={t.id}>
                                  {/* Image du ticket allongé (9.1cm x 8.0cm avec fond assombri et filtre haute visibilité) */}
                                  <div className="w-[9.1cm] h-[8.0cm] shrink-0 overflow-hidden flex items-center justify-center bg-white">
                                    <img
                                      src={ticketImages[t.id]}
                                      alt={`Ticket ${t.ticketNumber}`}
                                      className="w-[9.1cm] h-[8.0cm] object-fill contrast-125 brightness-90 saturate-140 print:contrast-125 print:brightness-90 print:saturate-140 block"
                                      style={{
                                        width: '9.1cm',
                                        height: '8.0cm',
                                        filter: 'contrast(1.24) brightness(0.88) saturate(1.35)',
                                        objectFit: 'fill',
                                      }}
                                    />
                                  </div>

                                  {/* Marge de perforation entre tickets */}
                                  {idx < row2Tickets.length - 1 && (
                                    <div className="w-[2.5mm] h-[8.0cm] flex flex-col items-center justify-between py-1 bg-gray-50 select-none shrink-0 border-x border-gray-100">
                                      <span className="text-[8px] font-bold text-gray-700 leading-none">✁</span>
                                      <div className="flex-1 w-0 border-l-2 border-dotted border-gray-600 my-1" />
                                      <span className="text-[6px] font-extrabold uppercase tracking-tighter text-gray-600 transform -rotate-90">
                                        Perfo
                                      </span>
                                      <div className="flex-1 w-0 border-l-2 border-dotted border-gray-600 my-1" />
                                      <span className="text-[8px] font-bold text-gray-700 leading-none">✁</span>
                                    </div>
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Guide bas de page */}
                        <div className="w-full text-center text-[7.5px] text-gray-500 font-semibold mt-1">
                          PORTUS UJPAS • Format A4 Paysage • Relier et agrafer le carnet sur le talon gauche (1.5 cm) puis perforer sur les lignes de séparation
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VUE 2 : APERÇU PDF */}
          {activeTab === 'PDF' && (
            <div className="w-full h-full min-h-[460px] rounded-xl overflow-hidden border border-slate-800 bg-white">
              <iframe
                ref={iframeRef}
                src={pdfUrl || ''}
                title={`Aperçu PDF Carnet ${carnet.carnetNumber}`}
                className="w-full h-full min-h-[460px] border-0"
              />
            </div>
          )}
        </div>

        {/* Pied de page et recommandations techniques */}
        <div className="border-t border-slate-800 px-5 py-3 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Procédé de confection :</strong> Imprimer en <em>A4 Paysage (100% / Sans marge)</em>. Les tickets allongés à <em>9.1 cm</em> et le <em>talon d'agrafage de 1.5 cm à gauche</em> couvrent parfaitement la feuille A4 (29.3 cm sur 29.7 cm) sans laisser d'espace blanc à droite. Découper les 2 bandes, agrafer sur le talon gauche, puis perforer sur les lignes de séparation.
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer ml-auto"
          >
            Fermer
          </button>
        </div>
      </div>

      {/* =========================================================================
          CONTENEUR D'IMPRESSION PHYSIQUE DÉDIÉ (DOM VISIBLE EN @MEDIA PRINT)
          Génère exactement les feuilles A4 Paysage sans les modales ou l'interface
         ========================================================================= */}
      <div
        id="portus-carnet-print-area"
        ref={printContainerRef}
        className="hidden print:block fixed inset-0 bg-white text-black z-9999 m-0 p-0"
        style={{ width: '29.7cm' }}
      >
        {pages.map((pageTickets, pageIdx) => {
          const row1Tickets = pageTickets.slice(0, 3);
          const row2Tickets = pageTickets.slice(3, 6);

          return (
            <div
              key={`print-page-${pageIdx}`}
              className="a4-print-sheet"
              style={{
                width: '29.7cm',
                height: '20.2cm',
                pageBreakAfter: pageIdx < pages.length - 1 ? 'always' : 'auto',
                breakAfter: pageIdx < pages.length - 1 ? 'page' : 'auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                margin: '0 auto',
                padding: '2mm 0',
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              {/* BANDE 1 */}
              <div
                className="strip-row"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  border: '2px dashed #1f2937',
                  margin: '3mm auto',
                  padding: 0,
                  position: 'relative',
                  background: '#ffffff',
                  width: '29.3cm',
                  boxSizing: 'border-box',
                }}
              >
                <span className="cut-label">✂ Découpe Bande 1 (Ciseaux)</span>

                {/* Talon / Marge d'agrafage à gauche (1.5 cm) pour relier le carnet */}
                <div className="staple-margin" style={{ width: '1.5cm', height: '8.0cm' }}>
                  <div className="staple-target" title="Zone agrafe">
                    <span>⁝</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: 'auto 0' }}>
                    <span className="staple-text">AGRAFAGE</span>
                  </div>
                  <div className="staple-target" title="Zone agrafe">
                    <span>⁝</span>
                  </div>
                </div>

                {row1Tickets.map((t, idx) => (
                  <React.Fragment key={t.id}>
                    <img
                      src={ticketImages[t.id]}
                      alt={`Ticket ${t.ticketNumber}`}
                      className="ticket-img print:contrast-125 print:brightness-90 print:saturate-140"
                      style={{
                        width: '9.1cm',
                        height: '8.0cm',
                        maxWidth: '9.1cm',
                        maxHeight: '8.0cm',
                        objectFit: 'fill',
                        display: 'block',
                        filter: 'contrast(1.24) brightness(0.88) saturate(1.35)',
                      }}
                    />

                    {idx < row1Tickets.length - 1 && (
                      <div className="perf-gap" style={{ width: '2.5mm', height: '8.0cm' }}>
                        <span className="perf-mark">✁</span>
                        <div className="perf-line" />
                        <span className="perf-text">Perfo</span>
                        <div className="perf-line" />
                        <span className="perf-mark">✁</span>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* BANDE 2 */}
              {row2Tickets.length > 0 && (
                <div
                  className="strip-row"
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    border: '2px dashed #1f2937',
                    margin: '3mm auto',
                    padding: 0,
                    position: 'relative',
                    background: '#ffffff',
                    width: '29.3cm',
                    boxSizing: 'border-box',
                  }}
                >
                  <span className="cut-label">✂ Découpe Bande 2 (Ciseaux)</span>

                  {/* Talon / Marge d'agrafage à gauche (1.5 cm) pour relier le carnet */}
                  <div className="staple-margin" style={{ width: '1.5cm', height: '8.0cm' }}>
                    <div className="staple-target" title="Zone agrafe">
                      <span>⁝</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: 'auto 0' }}>
                      <span className="staple-text">AGRAFAGE</span>
                    </div>
                    <div className="staple-target" title="Zone agrafe">
                      <span>⁝</span>
                    </div>
                  </div>

                  {row2Tickets.map((t, idx) => (
                    <React.Fragment key={t.id}>
                      <img
                        src={ticketImages[t.id]}
                        alt={`Ticket ${t.ticketNumber}`}
                        className="ticket-img print:contrast-125 print:brightness-90 print:saturate-140"
                        style={{
                          width: '9.1cm',
                          height: '8.0cm',
                          maxWidth: '9.1cm',
                          maxHeight: '8.0cm',
                          objectFit: 'fill',
                          display: 'block',
                          filter: 'contrast(1.24) brightness(0.88) saturate(1.35)',
                        }}
                      />

                      {idx < row2Tickets.length - 1 && (
                        <div className="perf-gap" style={{ width: '2.5mm', height: '8.0cm' }}>
                          <span className="perf-mark">✁</span>
                          <div className="perf-line" />
                          <span className="perf-text">Perfo</span>
                          <div className="perf-line" />
                          <span className="perf-mark">✁</span>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}

              <div className="page-guide-text">
                PORTUS UJPAS • Carnet {carnet.carnetNumber} — Page {pageIdx + 1}/{totalPages} • Relier/agrafer sur le talon gauche (1.5 cm) puis perforer sur la ligne pointillée
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
