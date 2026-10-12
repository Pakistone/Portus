import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatFCFA,
  normalizePlate,
  normalizePhone,
  formatPlateDisplay,
  formatDate,
  formatDateTime,
} from '../src/utils/normalization';

describe('Suite de Tests Normalisation et Utilitaires Métier (PORTUS)', () => {
  it('doit formater correctement les montants en FCFA avec séparateurs de milliers', () => {
    assert.equal(formatFCFA(5000).replace(/\s/g, ' '), '5 000 FCFA');
    assert.equal(formatFCFA(150000).replace(/\s/g, ' '), '150 000 FCFA');
    assert.equal(formatFCFA(0), '0 FCFA');
  });

  it('doit normaliser les plaques d’immatriculation de Côte d’Ivoire et CEDEAO', () => {
    // Espaces, tirets, minuscules
    assert.equal(normalizePlate(' 1234  ab 01 '), '1234AB01');
    assert.equal(normalizePlate('12-34-AB-01'), '1234AB01');
    assert.equal(normalizePlate('ci-5678-cd-02'), 'CI5678CD02');
  });

  it('doit afficher une immatriculation aérée et lisible', () => {
    const formatted = formatPlateDisplay('1234AB01');
    assert.ok(formatted.includes('1234') && formatted.includes('AB') && formatted.includes('01'));
  });

  it('doit formater les numéros de téléphone au format chiffres purs', () => {
    assert.equal(normalizePhone('0708091011'), '0708091011');
    assert.equal(normalizePhone('+225 07 08 09 10 11'), '2250708091011');
  });

  it('doit formater les dates sans planter sur entrées nulles ou invalides', () => {
    const nowIso = new Date('2026-10-12T10:30:00Z').toISOString();
    assert.ok(formatDate(nowIso).length > 0);
    assert.ok(formatDateTime(nowIso).length > 0);
    assert.equal(formatDate(''), '—');
    assert.equal(formatDateTime(''), '—');
  });
});
