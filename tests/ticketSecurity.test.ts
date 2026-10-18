import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCanonicalTicketString,
  generateTicketSecurityToken,
  buildTicketQRPayload,
  formatTicketQrForCameraScan,
  parseTicketQRPayload,
  verifyTicketSecurityToken,
  ALLOWED_TICKET_TRANSITIONS,
} from '../src/utils/ticketSecurity';

describe('Suite de Tests Cryptographiques et Sécurité Ticket (PORTUS UJPAS)', () => {
  it('doit générer une chaîne canonique strictement conforme au protocole officiel', () => {
    const canonical = buildCanonicalTicketString({
      ticketId: '550e8400-e29b-41d4-a716-446655440000',
      carnetNumber: 'C-2026-001',
      ticketNumber: 'VRD-000001',
      price: 5000,
    });

    assert.equal(
      canonical,
      'PORTUS|v1|550e8400-e29b-41d4-a716-446655440000|C-2026-001|VRD-000001|5000'
    );
  });

  it('doit générer un jeton cryptographique aléatoire sécurisé de format SEC-*', () => {
    const token1 = generateTicketSecurityToken('t1', 'c1', 'VRD-001');
    const token2 = generateTicketSecurityToken('t1', 'c1', 'VRD-001');

    assert.ok(token1.startsWith('SEC-'), 'Le token doit commencer par SEC-');
    assert.ok(token2.startsWith('SEC-'), 'Le token doit commencer par SEC-');
    assert.notEqual(token1, token2, 'Deux tokens générés doivent être distincts');
  });

  it('doit construire et parser un payload de QR Code JSON', () => {
    const payloadStr = buildTicketQRPayload({
      ticketId: 'uuid-1234',
      carnetId: 'carnet-999',
      carnetNumber: 'C-2026-042',
      ticketNumber: 'VRD-000042',
      price: 5000,
      signature: 'test_hmac_signature_hex',
    });

    const parsed = parseTicketQRPayload(payloadStr);
    assert.ok(parsed, 'Le parsing doit réussir');
    assert.equal(parsed?.ticket_id, 'uuid-1234');
    assert.equal(parsed?.carnet_number, 'C-2026-042');
    assert.equal(parsed?.ticket_number, 'VRD-000042');
    assert.equal(parsed?.price, 5000);
    assert.equal(parsed?.signature, 'test_hmac_signature_hex');
  });

  it('doit formater et parser un payload lisible pour appareil photo avec date de carnet et numéro de ticket', () => {
    const rawCameraQr = formatTicketQrForCameraScan({
      ticketNumber: 'VRDCH-000123',
      carnetNumber: 'C-2026-009',
      carnetCreatedAt: '2026-10-18T10:30:00.000Z',
      price: 5000,
    });

    assert.ok(rawCameraQr.includes('VRDCH-000123'), 'Doit contenir le numéro du ticket');
    assert.ok(rawCameraQr.includes('C-2026-009'), 'Doit contenir le numéro de carnet');
    assert.ok(rawCameraQr.includes('DATE CRÉATION CARNET'), 'Doit contenir la mention de la date de création');

    const parsed = parseTicketQRPayload(rawCameraQr);
    assert.ok(parsed, 'Le parsing du format appareil photo doit réussir');
    assert.equal(parsed?.ticket_number, 'VRDCH-000123');
    assert.equal(parsed?.carnet_number, 'C-2026-009');
    assert.ok(parsed?.carnet_date, 'La date de création du carnet doit être extraite');
    assert.equal(parsed?.price, 5000);
  });

  it('doit parser un format canonique direct avec signature', () => {
    const canonicalWithSig = 'PORTUS|v1|uuid-5678|C-2026-002|VRD-000002|5000|sig_hmac_abc123';
    const parsed = parseTicketQRPayload(canonicalWithSig);

    assert.ok(parsed);
    assert.equal(parsed?.ticket_id, 'uuid-5678');
    assert.equal(parsed?.carnet_number, 'C-2026-002');
    assert.equal(parsed?.ticket_number, 'VRD-000002');
    assert.equal(parsed?.signature, 'sig_hmac_abc123');
  });

  it('doit détecter immédiatement toute falsification ou divergence de jeton/signature', () => {
    const originalToken = 'SEC-VALID-TOKEN-12345';
    const storedPayload = JSON.stringify({ sig: originalToken });

    // 1. Signature concordante
    const validCheck = verifyTicketSecurityToken(storedPayload, originalToken);
    assert.equal(validCheck.isAuthentic, true);
    assert.equal(validCheck.forgeryDetected, false);

    // 2. Signature altérée (faux ticket)
    const forgedCheck = verifyTicketSecurityToken(storedPayload, 'SEC-ALTERED-FORGERY');
    assert.equal(forgedCheck.isAuthentic, false);
    assert.equal(forgedCheck.forgeryDetected, true);

    // 3. QR code sans signature
    const emptyCheck = verifyTicketSecurityToken(storedPayload, '');
    assert.equal(emptyCheck.isAuthentic, false);
    assert.equal(emptyCheck.forgeryDetected, true);
  });

  it('doit respecter strictement la matrice des transitions de statuts autorisées', () => {
    // GENERATED -> AVAILABLE (autorisé)
    assert.ok(ALLOWED_TICKET_TRANSITIONS.GENERATED.includes('AVAILABLE'));
    assert.ok(ALLOWED_TICKET_TRANSITIONS.GENERATED.includes('ASSIGNED_TO_RESPONSIBLE'));

    // AVAILABLE -> ASSIGNED_TO_AGENT (autorisé)
    assert.ok(ALLOWED_TICKET_TRANSITIONS.AVAILABLE.includes('ASSIGNED_TO_AGENT'));

    // ASSIGNED_TO_AGENT -> SOLD (autorisé)
    assert.ok(ALLOWED_TICKET_TRANSITIONS.ASSIGNED_TO_AGENT.includes('SOLD'));

    // SOLD -> CONTROLLED (autorisé)
    assert.ok(ALLOWED_TICKET_TRANSITIONS.SOLD.includes('CONTROLLED'));

    // CANCELLED est terminal (aucune transition autorisée)
    assert.equal(ALLOWED_TICKET_TRANSITIONS.CANCELLED.length, 0);
  });
});
