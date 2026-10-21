/**
 * Utilitaire de notification sonore et haptique pour les alertes terrain en direct
 * PORTUS — U.J.P.A.S. (Union des Jeunes du Port pour l'Assistance et la Sécurité)
 * Architecture résiliente : Singleton Web Audio réutilisable sans fuite mémoire.
 */

let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioCtx();
    }

    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {
        // Ignoré si le navigateur attend un geste utilisateur
      });
    }

    return sharedAudioContext;
  } catch {
    return null;
  }
}

function scheduleTone(
  ctx: AudioContext,
  type: OscillatorType,
  frequencyHz: number,
  startTime: number,
  durationSec: number,
  peakGain: number
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequencyHz, startTime);

  gainNode.gain.setValueAtTime(peakGain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.onended = () => {
    try {
      oscillator.disconnect();
      gainNode.disconnect();
    } catch {
      // Déconnexion déjà effectuée
    }
  };

  oscillator.start(startTime);
  oscillator.stop(startTime + durationSec);
}

/**
 * Signal sonore d'urgence SOS / Incident terrain (Double tonalité montante + vibration).
 */
export function playIncidentAlertSound(): void {
  try {
    const ctx = getSharedAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      // Premier bip d'appel (880 Hz - La5)
      scheduleTone(ctx, 'triangle', 880, now, 0.2, 0.22);
      // Deuxième bip d'urgence (1174.66 Hz - Ré6)
      scheduleTone(ctx, 'sine', 1174.66, now + 0.18, 0.32, 0.3);
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([200, 100, 250]);
    }
  } catch {
    // Tolérance matérielle silencieuse si l'audio est verrouillé
  }
}

/**
 * Alerte sonore critique de Fraude / Ticket Expiré (> 14 jours) ou Signature HMAC falsifiée.
 * Sirène dissonante à trois impulsions + vibration longue pour alerter le contrôleur.
 */
export function playFraudAlertSound(): void {
  try {
    const ctx = getSharedAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      // Triple impulsion d'alerte grave/stridente (Sirène de rejet)
      scheduleTone(ctx, 'sawtooth', 620, now, 0.18, 0.28);
      scheduleTone(ctx, 'sawtooth', 440, now + 0.2, 0.18, 0.28);
      scheduleTone(ctx, 'sawtooth', 620, now + 0.4, 0.28, 0.32);
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([300, 120, 300, 120, 400]);
    }
  } catch {
    // Tolérance matérielle silencieuse
  }
}
