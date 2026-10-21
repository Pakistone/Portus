/**
 * Annuaire et utilitaires CEDEAO pour PORTUS — U.J.P.A.S.
 * Union des Jeunes du Port pour l'Assistance et la Sécurité
 * Zone Portuaire & Industrielle d'Abidjan
 * Gestion des indicatifs téléphoniques, formats de plaques et quittances WhatsApp officielles (validité 14j).
 */

import {
  TICKET_VALIDITY_DAYS,
  computeExpirationDate,
  formatExpirationDateFR,
} from './expiration';

export interface CedeaoCountry {
  readonly name: string;
  readonly code: string;
  readonly dialCode: string;
  readonly flag: string;
  readonly placeholder: string;
}

export const CEDEAO_COUNTRIES: CedeaoCountry[] = [
  { name: "Côte d'Ivoire", code: 'CI', dialCode: '+225', flag: '\u{1F1E8}\u{1F1EE}', placeholder: '0701020304' },
  { name: 'Mali', code: 'ML', dialCode: '+223', flag: '\u{1F1F2}\u{1F1F1}', placeholder: '70123456' },
  { name: 'Burkina Faso', code: 'BF', dialCode: '+226', flag: '\u{1F1E7}\u{1F1EB}', placeholder: '70123456' },
  { name: 'Ghana', code: 'GH', dialCode: '+233', flag: '\u{1F1EC}\u{1F1ED}', placeholder: '241234567' },
  { name: 'Guinée', code: 'GN', dialCode: '+224', flag: '\u{1F1EC}\u{1F1F3}', placeholder: '620123456' },
  { name: 'Sénégal', code: 'SN', dialCode: '+221', flag: '\u{1F1F8}\u{1F1F3}', placeholder: '771234567' },
  { name: 'Togo', code: 'TG', dialCode: '+228', flag: '\u{1F1F9}\u{1F1EC}', placeholder: '90123456' },
  { name: 'Bénin', code: 'BJ', dialCode: '+229', flag: '\u{1F1E7}\u{1F1EF}', placeholder: '97123456' },
  { name: 'Niger', code: 'NE', dialCode: '+227', flag: '\u{1F1F3}\u{1F1EA}', placeholder: '90123456' },
  { name: 'Nigéria', code: 'NG', dialCode: '+234', flag: '\u{1F1F3}\u{1F1EC}', placeholder: '8031234567' },
  { name: 'Liberia', code: 'LR', dialCode: '+231', flag: '\u{1F1F1}\u{1F1F7}', placeholder: '881234567' },
  { name: 'Sierra Leone', code: 'SL', dialCode: '+232', flag: '\u{1F1F8}\u{1F1F1}', placeholder: '76123456' },
  { name: 'Gambie', code: 'GM', dialCode: '+220', flag: '\u{1F1EC}\u{1F1F2}', placeholder: '7012345' },
  { name: 'Cap-Vert', code: 'CV', dialCode: '+238', flag: '\u{1F1E8}\u{1F1FB}', placeholder: '9912345' },
  { name: 'Guinée-Bissau', code: 'GW', dialCode: '+245', flag: '\u{1F1EC}\u{1F1FC}', placeholder: '961234567' },
];

export function formatE164Phone(dialCode: string, phoneNumber: string): string {
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const cleanDial = dialCode.replace(/\D/g, '');
  if (!cleanPhone) return '';
  if (cleanPhone.startsWith(cleanDial) && cleanPhone.length > cleanDial.length + 5) {
    return `+${cleanPhone}`;
  }
  return `+${cleanDial}${cleanPhone}`;
}

export function detectCedeaoCountryFromPhone(rawPhone?: string | null): CedeaoCountry {
  const defaultCountry = CEDEAO_COUNTRIES[0];
  if (!rawPhone) return defaultCountry;
  const digits = rawPhone.replace(/\D/g, '');
  for (const country of CEDEAO_COUNTRIES) {
    const dialDigits = country.dialCode.replace(/\D/g, '');
    if (digits.startsWith(dialDigits) && digits.length >= dialDigits.length + 7) {
      return country;
    }
  }
  return defaultCountry;
}

export function generateWhatsAppReceiptUrl(params: {
  dialCode: string;
  phoneNumber: string;
  ticketNumber: string;
  plateNumber: string;
  amount: number;
  agentName: string;
  dateStr: string;
  soldAtIso?: string;
  expiresAtStr?: string;
  paymentMethod?: string;
}): string {
  const fullPhone = params.phoneNumber.replace(/\D/g, '');
  if (!fullPhone) return '';
  const cleanDial = params.dialCode.replace(/\D/g, '');
  const targetNumber =
    fullPhone.startsWith(cleanDial) && fullPhone.length > cleanDial.length + 5
      ? fullPhone
      : `${cleanDial}${fullPhone}`;

  const expirationDisplay =
    params.expiresAtStr ||
    formatExpirationDateFR(computeExpirationDate(params.soldAtIso || new Date().toISOString()));

  const paymentBadge = params.paymentMethod ? ` (${params.paymentMethod})` : '';

  const message =
    `*U.J.P.A.S. — PORTUS* %0A` +
    `_Quittance Officielle de Stationnement (Poids Lourd)_ %0A%0A` +
    `\u{1F3AB} *Ticket N° :* ${encodeURIComponent(params.ticketNumber)} %0A` +
    `\u{1F69B} *Immatriculation :* ${encodeURIComponent(params.plateNumber)} %0A` +
    `\u{1F4B0} *Montant réglé :* ${encodeURIComponent(params.amount.toLocaleString('fr-FR'))} FCFA${encodeURIComponent(paymentBadge)} %0A` +
    `\u{1F464} *Agent percepteur :* ${encodeURIComponent(params.agentName)} %0A` +
    `\u{1F4C5} *Date & Heure :* ${encodeURIComponent(params.dateStr)} %0A` +
    `\u{23F3} *Valable jusqu'au :* ${encodeURIComponent(expirationDisplay)} (${TICKET_VALIDITY_DAYS} jours) %0A%0A` +
    `\u{1F4CD} _Zone Portuaire & Industrielle d'Abidjan (Port Autonome d'Abidjan)_ %0A` +
    `\u{1F4DE} _Contacts : +225 07 77 91 78 04 / +225 01 03 31 37 68_`;

  return `https://wa.me/${targetNumber}?text=${message}`;
}
