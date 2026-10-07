import { GoogleAuth } from 'google-auth-library';

export const TARGET_SPREADSHEET_ID = '148zAkd_M-LR9NpQmq0rP4BEeMT9lGqx2qCwX4a2TKug';

export const EXPECTED_HEADERS = [
  'Date',
  'Référence',
  'Nom',
  'Prénom',
  'Téléphone',
  'E-mail',
  'Ville',
  'Produit',
  'Modèle',
  'Dimensions',
  'Consentement',
];

export interface WarrantyEntry {
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

export interface SheetsResult {
  success: boolean;
  sheetTitle?: string;
  updatedRange?: string;
  error?: string;
  details?: unknown;
}

export async function getServiceAccountDetails(): Promise<{ email: string; projectId: string }> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  let email = process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL || '';
  let projectId = '';

  try {
    projectId = await auth.getProjectId();
  } catch {
    projectId = 'inconnu';
  }

  if (!email) {
    try {
      const res = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
        { headers: { 'Metadata-Flavor': 'Google' } }
      );
      if (res.ok) {
        email = (await res.text()).trim();
      }
    } catch {
      // ignore
    }
  }

  return { email, projectId };
}

export async function writeWarrantyToGoogleSheets(
  entry: WarrantyEntry,
  spreadsheetId: string = TARGET_SPREADSHEET_ID
): Promise<SheetsResult> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;

  if (!token) {
    return {
      success: false,
      error: "Impossible d'obtenir un jeton d'accès Google côté serveur.",
    };
  }

  // 1. Récupérer les métadonnées pour trouver l'onglet avec sheetId === 0
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    const errorBody = await metaRes.json().catch(() => ({}));
    const errorMsg =
      errorBody.error?.message ||
      `Erreur Google Sheets (${metaRes.status} ${metaRes.statusText})`;
    return {
      success: false,
      error: errorMsg,
      details: errorBody.error,
    };
  }

  const metaData = await metaRes.json();
  const sheetsList = metaData.sheets || [];
  const targetSheet = sheetsList.find((s: any) => s.properties?.sheetId === 0) || sheetsList[0];

  if (!targetSheet || !targetSheet.properties?.title) {
    return {
      success: false,
      error: 'Aucun onglet valide trouvé dans ce fichier Google Sheets.',
    };
  }

  const sheetTitle = targetSheet.properties.title;

  // 2. Vérifier la première ligne (A1:K1)
  const headerCheckUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    sheetTitle
  )}!A1:K1`;
  const headerRes = await fetch(headerCheckUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!headerRes.ok) {
    const errJson = await headerRes.json().catch(() => ({}));
    return {
      success: false,
      error: `Erreur de lecture de l'en-tête : ${errJson.error?.message || headerRes.statusText}`,
    };
  }

  const headerData = await headerRes.json();
  const existingRows = headerData.values || [];

  if (existingRows.length === 0 || existingRows[0].length === 0) {
    // Onglet vide -> Création des en-têtes officiels
    const initHeaderRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        sheetTitle
      )}!A1:K1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [EXPECTED_HEADERS] }),
      }
    );

    if (!initHeaderRes.ok) {
      const errJson = await initHeaderRes.json().catch(() => ({}));
      return {
        success: false,
        error: `Erreur lors de la création des en-têtes : ${errJson.error?.message || initHeaderRes.statusText}`,
      };
    }
  } else {
    // L'en-tête existe déjà -> Vérifier la cohérence sans écraser
    const actualHeaders = existingRows[0].map((h: any) => String(h).trim().toLowerCase());
    const expectedNormalized = EXPECTED_HEADERS.map((h) => h.toLowerCase());

    // Vérifier si au moins les premières colonnes correspondent
    const isDifferent = expectedNormalized.some((expected, idx) => {
      const actual = actualHeaders[idx];
      if (!actual) return true;
      // tolérance e-mail vs email
      const normActual = actual.replace('-', '').replace('é', 'e');
      const normExpected = expected.replace('-', '').replace('é', 'e');
      return normActual !== normExpected;
    });

    if (isDifferent) {
      return {
        success: false,
        error: `Les colonnes actuelles de l'onglet « ${sheetTitle} » diffèrent des colonnes attendues (${EXPECTED_HEADERS.join(
          ' | '
        )}). Les données existantes n'ont pas été écrasées.`,
      };
    }
  }

  // 3. Préparer la ligne à insérer (valeurs avec valueInputOption RAW)
  // Pour Salon : Modèle et Dimensions doivent être vides ("")
  const row = [
    entry.date,
    entry.reference,
    entry.nom,
    entry.prenom,
    entry.telephone,
    entry.email,
    entry.ville,
    entry.produit,
    entry.modele || '',
    entry.dimensions || '',
    entry.consentement || 'Oui',
  ];

  // 4. Ajouter la ligne
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    sheetTitle
  )}!A:K:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  const appendRes = await fetch(appendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  });

  if (!appendRes.ok) {
    const errJson = await appendRes.json().catch(() => ({}));
    return {
      success: false,
      error: `Erreur d'écriture dans Google Sheets : ${errJson.error?.message || appendRes.statusText}`,
      details: errJson.error,
    };
  }

  const appendData = await appendRes.json();
  const updatedRange = appendData.updates?.updatedRange;

  return {
    success: true,
    sheetTitle,
    updatedRange,
  };
}
