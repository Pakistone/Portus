import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Camera,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Flashlight,
  FlashlightOff,
  RefreshCw,
  Sun,
  ShieldCheck,
  Check,
  Edit3,
} from 'lucide-react';
import { createWorker, type Worker } from 'tesseract.js';
import {
  normalizePlate,
  formatPlateDisplay,
  isValidIvoirianPlate,
} from '../../utils/normalization';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onPlateDetected: (plate: string) => void;
  initialPlate?: string;
  title?: string;
}

export const AnprCameraScannerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onPlateDetected,
  initialPlate = '',
  title = "Scanner ANPR — Reconnaissance Plaques Camions U.J.P.A.S.",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const isScanningRef = useRef(false);
  const isOcrInFlightRef = useRef(false);
  const scanIntervalRef = useRef<number | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [antiGlareActive, setAntiGlareActive] = useState(true);

  // État de détection Human-In-The-Loop
  const [detectedPlate, setDetectedPlate] = useState(initialPlate);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [detectionSuccess, setDetectionSuccess] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  // Émission d'un son de confirmation lors de la détection conforme
  const playBeep = () => {
    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
        setTimeout(() => {
          ctx.close().catch(() => {});
        }, 200);
      }
    } catch {}
  };

  const stopCamera = useCallback(() => {
    isScanningRef.current = false;
    isOcrInFlightRef.current = false;
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setTorchOn(false);
  }, []);

  const terminateWorker = useCallback(async () => {
    isScanningRef.current = false;
    isOcrInFlightRef.current = false;
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (workerRef.current) {
      const w = workerRef.current;
      workerRef.current = null;
      try {
        await w.terminate();
      } catch {}
    }
  }, []);

  // Initialisation de Tesseract.js avec whitelist caractères plaques [A-Z0-9]
  const initOcrWorker = useCallback(async () => {
    if (workerRef.current) return workerRef.current;
    try {
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      });
      workerRef.current = worker;
      return worker;
    } catch (err) {
      console.warn('[ANPR OCR] Échec initialisation Worker Tesseract:', err);
      workerRef.current = null;
      return null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasPermission(false);
      setErrorMessage("La caméra n'est pas supportée sur ce navigateur.");
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }

      setHasPermission(true);

      // Support Flash/Lampe torche
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = (track as any).getCapabilities ? (track as any).getCapabilities() : {};
        if (capabilities.torch) {
          setTorchSupported(true);
        }
      }

      // Initialiser Tesseract
      await initOcrWorker();
      isScanningRef.current = true;

      // Boucle d'analyse d'images toutes les 600ms
      scanIntervalRef.current = window.setInterval(processVideoFrame, 600);
    } catch (err: any) {
      console.warn('Erreur caméra ANPR:', err);
      setHasPermission(false);
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? "Permission d'accès à la caméra refusée par l'utilisateur."
          : "Impossible d'accéder à la caméra arrière de l'appareil."
      );
    }
  }, [stopCamera, initOcrWorker]);

  // Traitement d'un cadre vidéo avec filtres d'image anti-reflet & validation Regex Stricte
  const processVideoFrame = async () => {
    if (
      !isScanningRef.current ||
      isOcrInFlightRef.current ||
      !videoRef.current ||
      !canvasRef.current ||
      !workerRef.current ||
      videoRef.current.readyState !== 4
    ) {
      return;
    }

    const worker = workerRef.current;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;

    // Application du filtre anti-reflet / contraste élevé sur les camions-citernes
    ctx.filter = antiGlareActive
      ? 'contrast(220%) brightness(110%) grayscale(100%)'
      : 'contrast(130%) grayscale(50%)';

    // Rognage ciblé sur la Zone de Bounding Box centrale (Zone d'immatriculation)
    const cropWidth = Math.floor(width * 0.7);
    const cropHeight = Math.floor(height * 0.28);
    const cropX = Math.floor((width - cropWidth) / 2);
    const cropY = Math.floor((height - cropHeight) / 2);

    ctx.drawImage(
      video,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    isOcrInFlightRef.current = true;
    setIsOcrProcessing(true);

    try {
      if (!isScanningRef.current || workerRef.current !== worker) {
        return;
      }

      const { data } = await worker.recognize(canvas);
      if (!isScanningRef.current || workerRef.current !== worker) {
        return;
      }

      const rawText = data?.text || '';
      const confidence = data?.confidence || 0;

      // Clean & Normalise la chaîne brute
      const cleanedCandidate = normalizePlate(rawText);

      // VALIDATION STRICTE REGEX : N'accepte JAMAIS les chaînes hors format CEDEAO/CI
      if (cleanedCandidate && isValidIvoirianPlate(cleanedCandidate)) {
        playBeep();
        setDetectedPlate(cleanedCandidate);
        setOcrConfidence(confidence);
        setDetectionSuccess(true);

        // Pause de scan temporaire pour laisser l'agent valider
        isScanningRef.current = false;
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
      }
    } catch (ocrErr) {
      console.warn('[ANPR OCR Frame Error]:', ocrErr);
    } finally {
      isOcrInFlightRef.current = false;
      setIsOcrProcessing(false);
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current || !torchSupported) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (err) {
        console.warn('Erreur activation torche:', err);
      }
    }
  };

  const handleResumeScan = () => {
    setDetectionSuccess(false);
    setOcrConfidence(null);
    isScanningRef.current = true;
    if (!scanIntervalRef.current) {
      scanIntervalRef.current = window.setInterval(processVideoFrame, 600);
    }
  };

  const handleConfirmAndApply = () => {
    const finalClean = normalizePlate(detectedPlate);
    if (!finalClean) {
      setErrorMessage("Veuillez saisir ou détecter une immatriculation valide.");
      return;
    }
    onPlateDetected(finalClean);
    stopCamera();
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setDetectedPlate(initialPlate);
      setDetectionSuccess(false);
      setOcrConfidence(null);
      startCamera();
    } else {
      stopCamera();
      terminateWorker();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, initialPlate, startCamera, stopCamera, terminateWorker]);

  if (!isOpen) return null;

  const isFormPlateValid = isValidIvoirianPlate(detectedPlate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 sm:p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl text-slate-100 flex flex-col overflow-hidden max-h-[95vh]">
        {/* EN-TÊTE MODALE */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">{title}</h3>
              <p className="text-[11px] text-slate-400">
                Mode Human-in-the-Loop • Reconnaissance Filtre Anti-Reflet
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CIBLEURS ET VIEWPORT CAMÉRA */}
        <div className="relative bg-black flex items-center justify-center min-h-[260px] sm:min-h-[300px] overflow-hidden">
          {hasPermission === false ? (
            <div className="p-6 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
              <p className="text-xs text-rose-300 font-medium">
                {errorMessage || "Accès caméra impossible."}
              </p>
              <button
                onClick={startCamera}
                className="rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
              >
                Réessayer la caméra
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover max-h-[320px]"
                muted
                playsInline
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* OVERLAY GUIDE VISUEL DE CAPTURE (BOUNDING BOX TARGETING FRAME) */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                {/* Masque assombri extérieur */}
                <div className="absolute inset-0 bg-black/40" />

                {/* ZONE DE CIBLAGE CENTRAL (CADRE PLAQUE RECTANGULAIRE) */}
                <div
                  className={`relative w-[85%] max-w-[340px] h-[75px] rounded-xl border-2 transition-all duration-300 z-10 flex items-center justify-center shadow-2xl ${
                    detectionSuccess
                      ? 'border-emerald-400 bg-emerald-500/20 ring-4 ring-emerald-500/40'
                      : 'border-amber-400/80 bg-amber-500/5 ring-2 ring-amber-400/20'
                  }`}
                >
                  {/* Coins renforcés style HUD Vision */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-amber-400" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-amber-400" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-amber-400" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-amber-400" />

                  {/* Ligne laser de balayage */}
                  {!detectionSuccess && isScanningRef.current && (
                    <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse shadow-md" />
                  )}

                  <span className="text-[10px] font-mono font-bold tracking-wider text-amber-200 uppercase bg-black/70 px-2 py-0.5 rounded border border-amber-500/30">
                    {detectionSuccess ? 'PLAQUE DÉTECTÉE & VALIDÉE' : 'CADRER LA PLAQUE DU CAMION'}
                  </span>
                </div>

                <p className="z-10 mt-3 text-[10px] font-medium text-slate-300 bg-black/80 px-3 py-1 rounded-full border border-slate-800">
                  Positionnez l'immatriculation au centre du cadre
                </p>
              </div>

              {/* COMMANDES DE CONTRÔLE SUR LA VIDÉO */}
              <div className="absolute top-3 right-3 z-20 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAntiGlareActive((prev) => !prev)}
                  className={`p-2 rounded-xl border text-xs font-bold transition shadow-lg cursor-pointer ${
                    antiGlareActive
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                  title="Activer/Désactiver le filtre Anti-Reflet Camion"
                >
                  <Sun className="w-4 h-4" />
                </button>

                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2 rounded-xl border text-xs font-bold transition shadow-lg cursor-pointer ${
                      torchOn
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                    title="Lampe torche"
                  >
                    {torchOn ? <FlashlightOff className="w-4 h-4" /> : <Flashlight className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* INTERFACE HUMAN-IN-THE-LOOP (PRÉ-REMPLISSAGE ET CORRECTION MANUELLE) */}
        <div className="p-4 space-y-3 bg-slate-900 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
              Contrôle et Ajustement de l'Immatriculation
            </span>
            {detectionSuccess ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" />
                Regex Valide
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 italic">
                {isOcrProcessing ? 'Analyse OCR...' : 'En attente de détection'}
              </span>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              value={detectedPlate}
              onChange={(e) => {
                setDetectedPlate(normalizePlate(e.target.value));
                setDetectionSuccess(false);
              }}
              placeholder="Ex: 5829HZ01 ou CI-1234-AB"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 px-4 font-mono text-base font-bold tracking-widest text-center text-white focus:border-amber-500 focus:outline-hidden uppercase"
            />
            {detectedPlate && (
              <div className="mt-1 text-center">
                <span className="text-xs font-mono text-amber-300 font-bold">
                  Format lisible : {formatPlateDisplay(detectedPlate)}
                </span>
              </div>
            )}
          </div>

          {/* INDICATEUR DE VALIDITÉ FORMAT CEDEAO */}
          {detectedPlate ? (
            isFormPlateValid ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  <strong>Format Réglémentaire Valide :</strong> Conforme aux normes Côte d'Ivoire / CEDEAO.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  <strong>Format Incomplet ou Inconnu :</strong> Ajustez les lettres et chiffres au format officiel (ex: 5829HZ01).
                </span>
              </div>
            )
          ) : null}

          {/* BOUTONS D'ACTION HUMAN-IN-THE-LOOP */}
          <div className="pt-2 flex gap-2">
            {detectionSuccess && (
              <button
                type="button"
                onClick={handleResumeScan}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2.5 text-xs font-bold text-slate-300 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Rescanner</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleConfirmAndApply}
              disabled={!detectedPlate.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 py-3 px-4 text-xs font-bold text-slate-950 transition disabled:opacity-40 shadow-lg shadow-amber-950/40 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Valider et Appliquer l'Immatriculation</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
