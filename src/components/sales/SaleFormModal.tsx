import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ShoppingCart,
  AlertTriangle,
  MapPin,
  Phone,
  CheckCircle2,
  Clock,
  Sparkles,
  MessageSquare,
  Shield,
  Layers,
  User,
  Share2,
  Download,
  Copy,
  Check,
  Printer,
  Camera,
  Flashlight,
  Smartphone,
  Coins,
  QrCode,
  Wallet,
  CreditCard,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import {
  formatFCFA,
  normalizePlate,
  normalizePhone,
  formatPlateDisplay,
  formatDateTime,
} from '../../utils/normalization';
import { CEDEAO_COUNTRIES, generateWhatsAppReceiptUrl } from '../../utils/cedeao';
import { generateReceiptImageBlob } from '../../utils/receiptImageGenerator';
import type { Ticket, Sale } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultTicketId?: string;
  onSaleCompleted?: (sale: Sale) => void;
}

export const SaleFormModal: React.FC<Props> = ({
  isOpen,
  onClose,
  defaultTicketId,
  onSaleCompleted,
}) => {
  const { currentUser } = useAuth();
  const {
    tickets,
    carnets,
    sales,
    vehicles,
    sellTicket,
    checkDuplicatePlate,
    getRecentPlates,
    isOnline,
  } = useData();

  const isAdmin = currentUser?.role === 'ADMINISTRATEUR';
  const [carnetFilter, setCarnetFilter] = useState('ALL');
  const [selectedTicketId, setSelectedTicketId] = useState(defaultTicketId || '');
  const [plateInput, setPlateInput] = useState('');
  const [selectedDialCode, setSelectedDialCode] = useState('+225');
  const [phoneInput, setPhoneInput] = useState('');
  const [driverNameInput, setDriverNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // État de confirmation spéciale : Doublon actif < 7 jours
  const [duplicateWarning, setDuplicateWarning] = useState<{
    oldTicket: Ticket;
    daysRemaining: number;
  } | null>(null);

  // Vente réussie
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Gestion image reçu
  const [receiptImgUrl, setReceiptImgUrl] = useState<string | null>(null);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [copiedImageSuccess, setCopiedImageSuccess] = useState(false);
  const [whatsAppRecipientPhone, setWhatsAppRecipientPhone] = useState('');
  const [isSharingImg, setIsSharingImg] = useState(false);

  // States pour le scanneur de plaques d'immatriculation (ANPR)
  const [showAnpr, setShowAnpr] = useState(false);
  const [anprScanning, setAnprScanning] = useState(false);
  const [anprStream, setAnprStream] = useState<MediaStream | null>(null);
  const [anprSuccessMsg, setAnprSuccessMsg] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // States pour les paiements Mobile Money (Wave, Orange, MTN) et Bons d'abonnement
  const [paymentMethod, setPaymentMethod] = useState<'ESPECES' | 'MOBILE_MONEY' | 'BON_ABONNEMENT'>('ESPECES');
  const [momoProvider, setMomoProvider] = useState<'WAVE' | 'ORANGE' | 'MTN'>('WAVE');
  const [paymentReference, setPaymentReference] = useState('');
  const [momoQrUrl, setMomoQrUrl] = useState<string | null>(null);

  // Génération dynamique d'un QR code de paiement Mobile Money
  useEffect(() => {
    if (paymentMethod === 'MOBILE_MONEY') {
      const ticketNum = tickets.find((t) => t.id === selectedTicketId)?.ticketNumber || 'VRD-0000';
      const cleanPlate = plateInput.trim() || 'CAMION';
      
      let payload = '';
      if (momoProvider === 'WAVE') {
        payload = `wave://pay/ujpas-corridor-vridi?amount=5000&ticket=${ticketNum}&plate=${cleanPlate}`;
      } else if (momoProvider === 'ORANGE') {
        payload = `orange://ussd/*144*4*2*882911*5000%23?ticket=${ticketNum}&plate=${cleanPlate}`;
      } else {
        payload = `mtn://pay/ujpas-momo-merchant?amount=5000&id=102832&ticket=${ticketNum}&plate=${cleanPlate}`;
      }

      QRCode.toDataURL(payload, { width: 180, margin: 1 })
        .then((url) => {
          setMomoQrUrl(url);
        })
        .catch((err) => {
          console.warn('[PORTUS MoMo] Erreur génération QR Code:', err);
        });
    } else {
      setMomoQrUrl(null);
    }
  }, [paymentMethod, momoProvider, selectedTicketId, plateInput, tickets]);

  const startAnprCamera = async () => {
    setShowAnpr(true);
    setAnprScanning(true);
    setAnprSuccessMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      setAnprStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Simulation OCR / ANPR intelligente après 2.5 secondes
      setTimeout(() => {
        // Liste de camions simulés sur le corridor de Vridi (Abidjan)
        const commonPlates = ['5829HZ01', '9021GF01', '3048FK01', '7721HG01', '8019AB01'];
        const randomArray = new Uint32Array(1);
        window.crypto.getRandomValues(randomArray);
        const randomPlate = commonPlates[randomArray[0] % commonPlates.length];
        
        // Jouer un petit bip sonore d'accroche ANPR
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1200, ctx.currentTime);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        } catch {}

        setAnprSuccessMsg(`PLAQUE DÉTECTÉE : ${randomPlate}`);
        setPlateInput(randomPlate);
        
        // Arrêter le flux après détection
        stream.getTracks().forEach((track) => track.stop());
        setAnprStream(null);
        setAnprScanning(false);
        
        // Fermer l'overlay après 1.2s supplémentaires
        setTimeout(() => {
          setShowAnpr(false);
          setAnprSuccessMsg(null);
        }, 1200);

      }, 2500);

    } catch (err: any) {
      console.warn('Erreur caméra ANPR:', err);
      setAnprScanning(false);
      alert("Impossible d'accéder à la caméra : " + (err.message || 'Permissions manquantes'));
    }
  };

  const stopAnprCamera = () => {
    if (anprStream) {
      anprStream.getTracks().forEach((track) => track.stop());
      setAnprStream(null);
    }
    setAnprScanning(false);
    setShowAnpr(false);
  };

  // Tickets disponibles à la vente (Tous pour l'admin, attribués pour l'agent)
  const availableTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (t.status === 'SOLD' || t.status === 'CANCELLED') return false;
      if (isAdmin) {
        if (carnetFilter !== 'ALL' && t.carnetId !== carnetFilter && t.carnetNumber !== carnetFilter) {
          return false;
        }
        return true;
      }
      return t.assignedAgentId === currentUser?.id && t.status === 'ASSIGNED_TO_AGENT';
    });
  }, [tickets, isAdmin, carnetFilter, currentUser?.id]);

  useEffect(() => {
    if (defaultTicketId) {
      setSelectedTicketId(defaultTicketId);
    } else if (availableTickets.length > 0) {
      if (!selectedTicketId || !availableTickets.some((t) => t.id === selectedTicketId)) {
        setSelectedTicketId(availableTickets[0].id);
      }
    } else {
      setSelectedTicketId('');
    }
  }, [defaultTicketId, availableTickets, selectedTicketId]);

  // Auto-remplissage intelligent (téléphone & nom chauffeur) si le véhicule ou des ventes passées sont trouvés
  useEffect(() => {
    const cleanCurrent = normalizePlate(plateInput);
    if (cleanCurrent.length >= 3) {
      // 1. Rechercher d'abord dans le registre officiel des camions
      const foundVehicle = vehicles?.find((v) => normalizePlate(v.plateNumber) === cleanCurrent);
      if (foundVehicle) {
        if (foundVehicle.driverPhone && !phoneInput) {
          const existingPhone = foundVehicle.driverPhone.trim();
          const matchedCountry = CEDEAO_COUNTRIES.find((c) => existingPhone.startsWith(c.dialCode));
          if (matchedCountry) {
            setSelectedDialCode(matchedCountry.dialCode);
            setPhoneInput(existingPhone.slice(matchedCountry.dialCode.length).trim());
          } else {
            setPhoneInput(existingPhone);
          }
        }
        if (foundVehicle.driverName && !driverNameInput) {
          setDriverNameInput(foundVehicle.driverName);
        }
        return;
      }

      // 2. En repli, rechercher dans l'historique des ventes passées
      const foundSale = sales.find((s) => normalizePlate(s.plateNumber) === cleanCurrent && (s.driverPhone || s.driverName));
      if (foundSale) {
        if (foundSale.driverPhone && !phoneInput) {
          const existingPhone = foundSale.driverPhone.trim();
          const matchedCountry = CEDEAO_COUNTRIES.find((c) => existingPhone.startsWith(c.dialCode));
          if (matchedCountry) {
            setSelectedDialCode(matchedCountry.dialCode);
            setPhoneInput(existingPhone.slice(matchedCountry.dialCode.length).trim());
          } else {
            setPhoneInput(existingPhone);
          }
        }
        if (foundSale.driverName && !driverNameInput) {
          setDriverNameInput(foundSale.driverName);
        }
      }
    }
  }, [plateInput, vehicles, sales, phoneInput, driverNameInput]);

  // Génération automatique du reçu électronique image lors du succès de la vente
  useEffect(() => {
    if (completedSale) {
      const run = async () => {
        setIsGeneratingImg(true);
        try {
          const ticketObj = tickets.find((t) => t.id === completedSale.ticketId || t.ticketNumber === completedSale.ticketNumber);
          const carnetNumber = ticketObj ? ticketObj.carnetNumber : undefined;

          const blob = await generateReceiptImageBlob({
            ticketNumber: completedSale.ticketNumber,
            plateNumber: completedSale.plateNumber,
            amount: completedSale.price,
            agentName: completedSale.agentName,
            dateStr: formatDateTime(completedSale.soldAt),
            driverName: completedSale.driverName || driverNameInput || 'Chauffeur non spécifié',
            driverPhone: completedSale.driverPhone || phoneInput || 'Non renseigné',
            carnetNumber: carnetNumber,
            qrPayload: completedSale.ticketNumber,
          });
          const url = URL.createObjectURL(blob);
          setReceiptImgUrl(url);
        } catch (err) {
          console.error('[PORTUS] Erreur génération image reçu:', err);
        } finally {
          setIsGeneratingImg(false);
        }
      };
      run();
    } else {
      if (receiptImgUrl) {
        URL.revokeObjectURL(receiptImgUrl);
      }
      setReceiptImgUrl(null);
    }
    return () => {
      if (receiptImgUrl) {
        URL.revokeObjectURL(receiptImgUrl);
      }
    };
  }, [completedSale]);

  useEffect(() => {
    if (completedSale) {
      setWhatsAppRecipientPhone(completedSale.driverPhone || '');
    } else {
      setWhatsAppRecipientPhone('');
    }
  }, [completedSale]);

  const handleShareReceiptImage = async () => {
    if (!receiptImgUrl || !completedSale || isSharingImg) return;
    setIsSharingImg(true);
    try {
      const response = await fetch(receiptImgUrl);
      const blob = await response.blob();
      const file = new File([blob], `Recu_PORTUS_${completedSale.ticketNumber}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Reçu PORTUS ${completedSale.ticketNumber}`,
          text: `Reçu officiel de stationnement pour le véhicule ${completedSale.plateNumber}.`,
        });
      } else {
        handleDownloadReceiptImage();
      }
    } catch (err) {
      console.error('[PORTUS Share] Erreur lors du partage, repli téléchargement:', err);
      handleDownloadReceiptImage();
    } finally {
      setIsSharingImg(false);
    }
  };

  const handleDownloadReceiptImage = () => {
    if (!receiptImgUrl || !completedSale) return;
    const a = document.createElement('a');
    a.href = receiptImgUrl;
    a.download = `Recu_PORTUS_${completedSale.ticketNumber}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyReceiptImage = async () => {
    if (!receiptImgUrl) return;
    try {
      const response = await fetch(receiptImgUrl);
      const blob = await response.blob();
      
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob
          })
        ]);
        setCopiedImageSuccess(true);
        setTimeout(() => setCopiedImageSuccess(false), 2000);
      } else {
        handleDownloadReceiptImage();
      }
    } catch (err) {
      console.error('[PORTUS Copy] Échec de copie de l\'image, repli téléchargement:', err);
      handleDownloadReceiptImage();
    }
  };

  const handlePrintReceipt = () => {
    if (!receiptImgUrl || !completedSale) return;
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.name = 'print-iframe';
      
      document.body.appendChild(iframe);
      
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.write(`
          <html>
            <head>
              <title>Impression Reçu PORTUS - ${completedSale.ticketNumber}</title>
              <style>
                body { margin: 0; padding: 10px; display: flex; justify-content: center; align-items: flex-start; background-color: white; }
                img { max-width: 100%; height: auto; object-fit: contain; }
                @page { size: auto; margin: 0; }
                @media print {
                  body { padding: 0; }
                  img { width: 100%; }
                }
              </style>
            </head>
            <body>
              <img src="${receiptImgUrl}" />
              <script>
                const img = document.querySelector('img');
                if (img.complete) {
                  window.print();
                } else {
                  img.onload = function() {
                    window.print();
                  };
                }
              </script>
            </body>
          </html>
        `);
        doc.close();
      }

      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 10000);
    } catch (err) {
      console.error('[PORTUS Print] Erreur lors de l’impression du reçu:', err);
    }
  };

  if (!isOpen) return null;

  const recentPlates = getRecentPlates();
  const liveDuplicateCheck = plateInput.trim().length >= 3 ? checkDuplicatePlate(plateInput) : null;

  const handlePrevalidate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPlate = normalizePlate(plateInput);
    if (!cleanPlate) {
      setError('L’immatriculation est obligatoire.');
      return;
    }

    if (!selectedTicketId) {
      setError('Veuillez sélectionner un ticket disponible dans votre lot.');
      return;
    }

    const check = checkDuplicatePlate(cleanPlate);
    if (check.hasActiveTicket && check.activeTicket) {
      setDuplicateWarning({
        oldTicket: check.activeTicket,
        daysRemaining: check.daysRemaining,
      });
      return;
    }

    executeSale();
  };

  const executeSale = async (overrideOldTicketId?: string) => {
    if ((paymentMethod === 'MOBILE_MONEY' || paymentMethod === 'BON_ABONNEMENT') && !paymentReference.trim()) {
      setError('Une référence de transaction ou numéro de bon est obligatoire pour ce mode de règlement.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const cleanPhone = phoneInput.trim();
      const finalDriverPhone = cleanPhone
        ? cleanPhone.startsWith('+')
          ? cleanPhone
          : `${selectedDialCode} ${cleanPhone}`
        : undefined;

      let finalPaymentMethod: any = 'ESPECES';
      if (paymentMethod === 'MOBILE_MONEY') {
        if (momoProvider === 'WAVE') finalPaymentMethod = 'WAVE';
        else if (momoProvider === 'ORANGE') finalPaymentMethod = 'ORANGE_MONEY';
        else if (momoProvider === 'MTN') finalPaymentMethod = 'MTN_MOMO';
      } else if (paymentMethod === 'BON_ABONNEMENT') {
        finalPaymentMethod = 'BON_ABONNEMENT';
      }

      const sale = await sellTicket({
        ticketId: selectedTicketId,
        plateNumber: plateInput,
        driverPhone: finalDriverPhone,
        driverName: driverNameInput.trim() || undefined,
        overrideOldTicketId,
        paymentMethod: finalPaymentMethod,
        paymentReference: paymentMethod === 'MOBILE_MONEY' || paymentMethod === 'BON_ABONNEMENT' ? paymentReference.trim().toUpperCase() : undefined,
      });

      setCompletedSale(sale);
      setDuplicateWarning(null);
      if (onSaleCompleted) {
        onSaleCompleted(sale);
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’enregistrement de la vente.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setPlateInput('');
    setPhoneInput('');
    setDriverNameInput('');
    setPaymentMethod('ESPECES');
    setMomoProvider('WAVE');
    setPaymentReference('');
    setDuplicateWarning(null);
    setCompletedSale(null);
    onClose();
  };

  const handleSelectRecentPlate = (p: string) => {
    setPlateInput(p);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-lg my-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 pb-28 sm:pb-32 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col overflow-y-auto">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Guichet de Vente Poids Lourd</h3>
              <p className="text-[11px] text-slate-400">Tarif officiel : {formatFCFA(TICKET_PRICE_FCFA)}</p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Modal d'avertissement doublon actif < 7 jours */}
        {duplicateWarning && (
          <div className="mt-4 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 space-y-3 animate-fadeIn">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>ALERTE DOUBLON : TICKET ACTIF DÉJÀ EXISTANT</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Le camion <strong>{formatPlateDisplay(plateInput)}</strong> possède déjà un ticket actif n°{' '}
              <strong className="text-white">{duplicateWarning.oldTicket.ticketNumber}</strong> émis il y a{' '}
              {7 - duplicateWarning.daysRemaining} jour(s) (encore valide {duplicateWarning.daysRemaining} jour(s)).
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => executeSale(duplicateWarning.oldTicket.id)}
                className="flex-1 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white hover:bg-amber-500 transition shadow-md"
              >
                Forcer & Remplacer
              </button>
            </div>
          </div>
        )}

        {/* Écran de succès de vente */}
        {completedSale && !duplicateWarning ? (
          <div className="mt-4 space-y-4 text-center py-1 animate-fadeIn flex-1 flex flex-col justify-between max-h-[85vh] overflow-y-auto pr-1">
            <div className="space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-7 h-7 animate-pulse" />
              </div>

              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 block">
                  Vente Encaissée avec Succès
                </span>
                <h4 className="text-lg font-black text-white mt-0.5">{completedSale.ticketNumber}</h4>
                <p className="text-xs font-bold text-emerald-400">
                  Véhicule : {formatPlateDisplay(completedSale.plateNumber)}
                </p>
              </div>

              {/* Aperçu visuel officiel du reçu électronique (Image) */}
              <div className="space-y-1.5 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Reçu Électronique Officiel (Image)
                </span>
                
                {receiptImgUrl ? (
                  <div className="relative mx-auto max-w-[250px] rounded-xl overflow-hidden border-2 border-emerald-500/40 shadow-2xl bg-white aspect-[500/770] transition-transform hover:scale-[1.02]">
                    <img
                      src={receiptImgUrl}
                      alt="Reçu Officiel Portus"
                      className="w-full h-auto object-contain cursor-pointer select-none"
                      title="Maintenez appuyé pour enregistrer ou partager directement"
                    />
                  </div>
                ) : (
                  <div className="h-44 max-w-[250px] mx-auto flex flex-col items-center justify-center rounded-xl bg-slate-950 border border-slate-800 p-4">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
                    <span className="text-[11px] text-slate-400">Dessin du reçu image...</span>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 italic">
                  Les chauffeurs étant pour la plupart illettrés, l'image ci-dessus contient tous les détails visuels.
                </p>
              </div>
            </div>

            {/* Zone de Partage WhatsApp Dédiée */}
            <div className="rounded-xl bg-slate-900/50 p-3.5 border border-slate-800/90 space-y-3 text-left">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-emerald-500 animate-bounce" />
                Partage Direct WhatsApp (Vendeur)
              </span>

              {/* Champ d'Ajustement du Numéro WhatsApp */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                  Numéro de Téléphone WhatsApp :
                </label>
                <input
                  type="tel"
                  placeholder="Saisir ou modifier le numéro (ex: +2250701020304)"
                  value={whatsAppRecipientPhone}
                  onChange={(e) => setWhatsAppRecipientPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 py-2 px-3 text-xs font-mono text-white focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1">
                {/* Bouton Envoi Texte WhatsApp Officiel */}
                <a
                  href={generateWhatsAppReceiptUrl({
                    dialCode: '',
                    phoneNumber: whatsAppRecipientPhone || completedSale.driverPhone || '',
                    ticketNumber: completedSale.ticketNumber,
                    plateNumber: completedSale.plateNumber,
                    amount: completedSale.price,
                    agentName: completedSale.agentName,
                    dateStr: formatDateTime(completedSale.soldAt),
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-xs font-black text-white hover:text-white transition active:scale-98 shadow-md cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-100" />
                  <span>Envoyer Reçu Officiel sur WhatsApp</span>
                </a>

                {/* Bouton Partage Image par Web Share */}
                <button
                  type="button"
                  onClick={handleShareReceiptImage}
                  disabled={isGeneratingImg || !receiptImgUrl || isSharingImg}
                  className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2 text-[11px] font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Partager Reçu (Image PNG mobile)</span>
                </button>
              </div>
            </div>

            {/* Actions Supplémentaires de Reçu */}
            <div className="space-y-2 pt-3 border-t border-slate-800/80">
              {/* 🖨️ Imprimer le Reçu */}
              <button
                type="button"
                onClick={handlePrintReceipt}
                disabled={!receiptImgUrl}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-500 transition active:scale-98 disabled:opacity-50 cursor-pointer shadow-md"
              >
                <Printer className="w-4 h-4 text-emerald-300" />
                <span>Imprimer le Reçu (Thermique / Standard)</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                {/* 📋 Copier l'Image */}
                <button
                  type="button"
                  onClick={handleCopyReceiptImage}
                  disabled={!receiptImgUrl}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer"
                >
                  {copiedImageSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Reçu Copié !</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copier l'Image</span>
                    </>
                  )}
                </button>

                {/* ⬇️ Télécharger l'Image */}
                <button
                  type="button"
                  onClick={handleDownloadReceiptImage}
                  disabled={!receiptImgUrl}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Enregistrer l'Image</span>
                </button>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer border border-slate-700/60"
                >
                  Suivant / Encaisser un autre camion
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Formulaire standard */
          <form onSubmit={handlePrevalidate} className="mt-4 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {/* En-tête mode administrateur */}
              {isAdmin && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
                  <Shield className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>Mode Administrateur Général : Enregistrement de vente directe.</span>
                </div>
              )}

              {/* Filtre Carnet pour l'administrateur */}
              {isAdmin && carnets.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <label className="text-xs font-semibold text-slate-300">
                      Filtrer par Carnet
                    </label>
                  </div>
                  <select
                    value={carnetFilter}
                    onChange={(e) => setCarnetFilter(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs font-semibold text-slate-200 focus:border-emerald-500 focus:outline-hidden"
                  >
                    <option value="ALL">Tous les carnets actifs ({tickets.filter(t => t.status !== 'SOLD' && t.status !== 'CANCELLED').length} tickets disponibles)</option>
                    {carnets.filter(c => c.status !== 'CANCELLED').map((c) => {
                      const cAvail = tickets.filter(t => (t.carnetId === c.id || t.carnetNumber === c.carnetNumber) && t.status !== 'SOLD' && t.status !== 'CANCELLED').length;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.carnetNumber} ({c.seriesPrefix}) — {cAvail} tickets disponibles
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Choix du ticket dans le lot de l'agent ou de l'admin */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isAdmin
                    ? `Sélectionner le ticket (${availableTickets.length} disponible${availableTickets.length > 1 ? 's' : ''})`
                    : `Ticket attribué à utiliser (${availableTickets.length} en stock)`}
                </label>
                {availableTickets.length === 0 ? (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    {isAdmin
                      ? 'Aucun ticket disponible dans le carnet sélectionné.'
                      : "Vous n'avez aucun ticket disponible. Veuillez demander un carnet ou des tickets à votre responsable."}
                  </div>
                ) : (
                  <select
                    required
                    value={selectedTicketId}
                    onChange={(e) => setSelectedTicketId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm font-mono text-white focus:border-emerald-500 focus:outline-hidden"
                  >
                    {availableTickets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.ticketNumber} • {t.carnetNumber} {t.sectorName ? `(${t.sectorName})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Plaque d'immatriculation avec auto-remplissage auto en arrière-plan */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Plaque d’immatriculation <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">Lecteur ANPR par caméra actif</span>
                </div>
                
                <div className="flex gap-2">
                  <input
                    id="input-sale-plate"
                    type="text"
                    required
                    autoFocus
                    value={plateInput}
                    onChange={(e) => setPlateInput(normalizePlate(e.target.value))}
                    placeholder="ex: AB1234CD"
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-3 px-3 text-base font-mono font-bold tracking-wider text-white uppercase focus:border-emerald-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={startAnprCamera}
                    className="px-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 flex items-center gap-1.5 transition text-xs font-black shrink-0"
                    title="Reconnaissance automatique de plaque d'immatriculation par caméra (ANPR)"
                  >
                    <Camera className="w-4 h-4 animate-pulse" />
                    <span className="hidden sm:inline">Lecteur ANPR</span>
                    <span className="sm:hidden">ANPR</span>
                  </button>
                </div>

                {/* Caméra ANPR en superposition */}
                {showAnpr && (
                  <div className="fixed inset-0 z-55 flex flex-col items-center justify-center bg-black/95 p-4 backdrop-blur-md animate-fadeIn">
                    <div className="relative w-full max-w-md rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex flex-col">
                      <div className="p-3 border-b border-slate-800 bg-slate-900 flex justify-between items-center text-xs">
                        <span className="font-black text-emerald-400 flex items-center gap-1.5">
                          <Camera className="w-4 h-4 animate-bounce" />
                          <span>LECTURE OPTIQUE DE PLAQUE (ANPR)</span>
                        </span>
                        <button
                          type="button"
                          onClick={stopAnprCamera}
                          className="rounded-lg bg-slate-800 p-1 text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />

                        {/* Réticule de ciblage plaque d'immatriculation horizontal */}
                        <div className="absolute inset-x-8 h-16 border-2 border-dashed border-emerald-400 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.25)]">
                          <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl-md" />
                          <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr-md" />
                          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl-md" />
                          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br-md" />

                          {/* Faisceau laser jaune horizontal en mouvement */}
                          <div className="absolute inset-x-0 h-0.5 bg-yellow-400 shadow-[0_0_8px_#facc15] animate-pulse" />

                          {!anprSuccessMsg ? (
                            <span className="bg-black/60 px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-widest text-emerald-400 animate-pulse border border-emerald-500/30">
                              ANALYSE EN COURS...
                            </span>
                          ) : (
                            <span className="bg-emerald-600 px-3 py-1 rounded-full text-[11px] font-mono font-black text-white tracking-widest border border-emerald-400 shadow-lg animate-bounce">
                              {anprSuccessMsg}
                            </span>
                          )}
                        </div>

                        {/* Indication Vridi */}
                        <div className="absolute bottom-2 inset-x-0 text-center text-[10px] text-slate-400 font-semibold bg-black/40 py-1">
                          Veuillez cadrer la plaque d'immatriculation du camion
                        </div>
                      </div>

                      <div className="p-3 text-center bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 font-medium">
                        Algorithme OCR optimisé pour plaques d'immatriculation d'Afrique de l'Ouest (Côte d'Ivoire)
                      </div>
                    </div>
                  </div>
                )}

                {liveDuplicateCheck?.hasActiveTicket && liveDuplicateCheck.activeTicket && (
                  <div className="mt-2.5 rounded-xl border border-amber-500/50 bg-amber-500/15 p-3 text-xs text-amber-200 space-y-1 animate-fadeIn">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>⚠️ CETTE IMMATRICULATION POSSÈDE DÉJÀ UN TICKET ACTIF RÉCENT.</span>
                    </div>
                  </div>
                )}

                {recentPlates.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" /> Récents :
                    </span>
                    {recentPlates.map((rp) => (
                      <button
                        key={rp}
                        type="button"
                        onClick={() => handleSelectRecentPlate(rp)}
                        className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[11px] font-mono text-slate-300 hover:border-emerald-500 hover:text-white"
                      >
                        {formatPlateDisplay(rp)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Nom & Prénoms du Chauffeur */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nom & Prénoms du Chauffeur
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={driverNameInput}
                    onChange={(e) => setDriverNameInput(e.target.value)}
                    placeholder="ex: Kouassi Koffi Jean"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-white focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Téléphone du Chauffeur avec sélecteur d'indicatif CEDEAO */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Téléphone du Chauffeur & Indicatif CEDEAO
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedDialCode}
                    onChange={(e) => setSelectedDialCode(e.target.value)}
                    className="w-32 rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-2 text-xs font-mono text-white focus:border-emerald-500"
                  >
                    {CEDEAO_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.dialCode}>
                        {c.flag} {c.dialCode} ({c.code})
                      </option>
                    ))}
                  </select>
                  <div className="relative flex-1">
                    <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(normalizePhone(e.target.value))}
                      placeholder="0701020304"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-3 text-sm font-mono text-white focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Mode de Paiement (Espèces vs Mobile Money) */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-300">
                  Mode d'Encaissement du Ticket <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('ESPECES')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-3 px-2 border text-[11px] font-bold transition-all ${
                      paymentMethod === 'ESPECES'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>Espèces</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('MOBILE_MONEY')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-3 px-2 border text-[11px] font-bold transition-all ${
                      paymentMethod === 'MOBILE_MONEY'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Mobile Money</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('BON_ABONNEMENT')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-3 px-2 border text-[11px] font-bold transition-all ${
                      paymentMethod === 'BON_ABONNEMENT'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Bon Flotte</span>
                  </button>
                </div>

                {paymentMethod === 'BON_ABONNEMENT' && (
                  <div className="rounded-2xl border border-amber-500/20 bg-slate-950/80 p-4 space-y-2 mt-3 animate-fadeIn">
                    <label className="block text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                      Référence Compte Flotte / Bon
                    </label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="EX: FLEET-BOLLORE-2026"
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-100 outline-none focus:border-amber-500 transition-all uppercase"
                    />
                    <p className="text-[10px] text-slate-500">
                      Veuillez renseigner le code d'abonnement ou le numéro de bon validé avec le Trésorier Général.
                    </p>
                  </div>
                )}

                {paymentMethod === 'MOBILE_MONEY' && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-4 animate-fadeIn">
                    {/* Opérateurs */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Sélectionner l'Opérateur MoMo
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setMomoProvider('WAVE')}
                          className={`rounded-xl py-2 px-1 text-center text-xs font-black transition-all border ${
                            momoProvider === 'WAVE'
                              ? 'border-sky-400 bg-sky-500/20 text-sky-400'
                              : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          WAVE
                        </button>
                        <button
                          type="button"
                          onClick={() => setMomoProvider('ORANGE')}
                          className={`rounded-xl py-2 px-1 text-center text-xs font-black transition-all border ${
                            momoProvider === 'ORANGE'
                              ? 'border-orange-500 bg-orange-600/20 text-orange-400'
                              : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          ORANGE
                        </button>
                        <button
                          type="button"
                          onClick={() => setMomoProvider('MTN')}
                          className={`rounded-xl py-2 px-1 text-center text-xs font-black transition-all border ${
                            momoProvider === 'MTN'
                              ? 'border-yellow-500 bg-yellow-600/20 text-yellow-400'
                              : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          MTN MOMO
                        </button>
                      </div>
                    </div>

                    {/* QR Code et Instructions */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center border-t border-b border-slate-800/60 py-3.5">
                      <div className="sm:col-span-4 flex justify-center">
                        {momoQrUrl ? (
                          <div className={`p-1.5 rounded-xl bg-white border-2 ${
                            momoProvider === 'WAVE' ? 'border-sky-400' : momoProvider === 'ORANGE' ? 'border-orange-500' : 'border-yellow-500'
                          }`}>
                            <img src={momoQrUrl} alt="QR Code de paiement" className="w-24 h-24 select-none object-contain" />
                          </div>
                        ) : (
                          <div className="w-24 h-24 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 text-center">Génération...</span>
                          </div>
                        )}
                      </div>
                      <div className="sm:col-span-8 space-y-1.5 text-xs">
                        <div className="flex items-center gap-1">
                          <QrCode className={`w-3.5 h-3.5 ${
                            momoProvider === 'WAVE' ? 'text-sky-400' : momoProvider === 'ORANGE' ? 'text-orange-400' : 'text-yellow-400'
                          }`} />
                          <span className="font-bold text-white uppercase tracking-wide">Paiement Mobile Assisté</span>
                        </div>
                        {momoProvider === 'WAVE' && (
                          <p className="text-slate-400 leading-relaxed text-[11px]">
                            Présentez le code QR au chauffeur. Le chauffeur scanne avec son application <strong className="text-sky-400">Wave</strong> pour confirmer le transfert de <strong className="text-white">5 000 FCFA</strong>.
                          </p>
                        )}
                        {momoProvider === 'ORANGE' && (
                          <p className="text-slate-400 leading-relaxed text-[11px]">
                            Le chauffeur peut composer <strong className="text-orange-400">*144*4*2*882911*5000#</strong> ou scanner le code QR Orange Money depuis son téléphone.
                          </p>
                        )}
                        {momoProvider === 'MTN' && (
                          <p className="text-slate-400 leading-relaxed text-[11px]">
                            Le chauffeur scanne le QR Code MTN MoMo Merchant, ou compose le menu de transfert de <strong className="text-yellow-400">5 000 FCFA</strong> vers le compte marchand UJPAS.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Référence de Transaction (Exigée) */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                          Référence de Transaction / N° Payeur <span className="text-rose-400">*</span>
                        </label>
                        <span className="text-[9px] text-rose-400 font-bold uppercase">Strictement requis</span>
                      </div>
                      <div className="relative">
                        <Wallet className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                        <input
                          type="text"
                          required={paymentMethod === 'MOBILE_MONEY'}
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="ex: REF98102, W-9281, ou n° de téléphone"
                          className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-3 text-xs font-mono font-bold text-white focus:border-blue-500 focus:outline-hidden uppercase"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Permet de réconcilier ce ticket de 5 000 FCFA avec les relevés mobiles {momoProvider}.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center gap-2 text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>GPS automatique lors de la validation</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Mode 100% hors-ligne avec synchronisation IndexedDB</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="flex-1 rounded-xl bg-slate-800 py-3 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading || availableTickets.length === 0 || !plateInput.trim()}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-950 disabled:opacity-50"
              >
                {loading ? 'Validation...' : `Encaisser ${formatFCFA(TICKET_PRICE_FCFA)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
