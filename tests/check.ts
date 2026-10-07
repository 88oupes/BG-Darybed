import assert from 'node:assert/strict';
import { createApp } from '../backend/app.ts';
import type { WarrantyEntry, SheetsResult } from '../src/services/sheetsServer.ts';

async function runTests() {
  console.log('Running Dary tests...');

  let writtenEntry: any = null;
  const mockWriter = async (entry: WarrantyEntry, _id?: string): Promise<SheetsResult> => {
    writtenEntry = entry;
    return {
      success: true,
      sheetTitle: 'Feuille 1',
      updatedRange: 'Feuille 1!A2:K2',
    };
  };

  const app = createApp(mockWriter);
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Test /api/health
    const healthRes = await fetch(`${base}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('content-type')?.includes('application/json'), true);
    const healthData = await healthRes.json();
    assert.equal(healthData.success, true);
    assert.equal(healthData.service, 'dary-google-sheets');
    console.log('✓ GET /api/health returns valid JSON');

    // 2. Test /api/garantie with invalid input
    const badRes = await fetch(`${base}/api/garantie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: '' }),
    });
    assert.equal(badRes.status, 400);
    assert.equal(badRes.headers.get('content-type')?.includes('application/json'), true);
    const badData = await badRes.json();
    assert.equal(badData.success, false);
    console.log('✓ POST /api/garantie rejects invalid data with JSON');

    // 3. Test /api/garantie valid mattress submission
    const validId = '12345678-1234-1234-1234-123456789abc';
    const goodRes = await fetch(`${base}/api/garantie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: validId,
        nom: 'Benali',
        prenom: 'Karim',
        telephone: '0661234567',
        email: 'karim@dary.ma',
        ville: 'casablanca',
        type: 'matelas',
        modele: 'Feelsoft Hr+',
        dimensions: '160 × 190',
        consent: true,
      }),
    });
    assert.equal(goodRes.status, 201);
    assert.equal(goodRes.headers.get('content-type')?.includes('application/json'), true);
    const goodData = await goodRes.json();
    assert.equal(goodData.success, true);
    assert.equal(goodData.reference, `DRY-${validId}`);
    assert.notEqual(writtenEntry, null);
    if (!writtenEntry) throw new Error('writtenEntry is null');
    assert.equal(writtenEntry.produit, 'Matelas');
    assert.equal(writtenEntry.modele, 'Feelsoft Hr+');
    assert.equal(writtenEntry.dimensions, '160 × 190');
    console.log('✓ POST /api/garantie records mattress with correct fields');

    // 4. Test Salon submission leaves modele & dimensions empty
    const salonId = '87654321-4321-4321-4321-cba987654321';
    writtenEntry = null;
    const salonRes = await fetch(`${base}/api/garantie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: salonId,
        nom: 'Tazi',
        prenom: 'Samira',
        telephone: '0701234567',
        email: 'samira@dary.ma',
        ville: 'rabat',
        type: 'salon',
        consent: true,
      }),
    });
    assert.equal(salonRes.status, 201);
    assert.equal(salonRes.headers.get('content-type')?.includes('application/json'), true);
    assert.notEqual(writtenEntry, null);
    if (!writtenEntry) throw new Error('writtenEntry is null');
    assert.equal(writtenEntry.produit, 'Salon');
    assert.equal(writtenEntry.modele, '');
    assert.equal(writtenEntry.dimensions, '');
    console.log('✓ POST /api/garantie leaves Salon modele and dimensions empty');

    console.log('All tests passed successfully!');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
