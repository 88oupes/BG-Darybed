export const TARGET_SPREADSHEET_ID = '148zAkd_M-LR9NpQmq0rP4BEeMT9lGqx2qCwX4a2TKug';

export interface WarrantyRowData {
  date: string;
  reference: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  ville: string;
  produit: string;
  modele: string;
  dimensions: string;
  consentement: string;
}

/**
 * Appends a warranty registration row to the Google Sheet.
 * Columns: Date, Référence, Nom, Prénom, Téléphone, E-Mail, Ville, Produit, Modèle, Dimensions, Consentement
 */
export async function appendWarrantyToSheet(
  accessToken: string,
  data: WarrantyRowData,
  spreadsheetId: string = TARGET_SPREADSHEET_ID
): Promise<{ success: boolean; updatedRange?: string; error?: string }> {
  try {
    // 1. Fetch spreadsheet metadata to get the first sheet's title
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!metaRes.ok) {
      const errJson = await metaRes.json().catch(() => ({}));
      const msg = errJson.error?.message || `Erreur accès feuille Google Sheet (${metaRes.status})`;
      return { success: false, error: msg };
    }

    const metaData = await metaRes.json();
    const firstSheetTitle =
      metaData.sheets && metaData.sheets.length > 0
        ? metaData.sheets[0].properties?.title || 'Sheet1'
        : 'Sheet1';

    // 2. Prepare row values according to requested columns
    const values = [
      [
        data.date,
        data.reference,
        data.nom,
        data.prenom,
        data.telephone,
        data.email,
        data.ville,
        data.produit,
        data.modele || '-',
        data.dimensions || '-',
        data.consentement || 'Oui',
      ],
    ];

    // 3. Append row
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      firstSheetTitle
    )}!A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    });

    if (!appendRes.ok) {
      const errJson = await appendRes.json().catch(() => ({}));
      const msg = errJson.error?.message || `Erreur d'écriture dans Google Sheets (${appendRes.status})`;
      return { success: false, error: msg };
    }

    const appendData = await appendRes.json();
    return {
      success: true,
      updatedRange: appendData.updates?.updatedRange,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
