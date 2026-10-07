import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Firestore } from '@google-cloud/firestore';
import { GoogleAuth } from 'google-auth-library';
import { validateWarrantyData, generateWarrantyReference } from './src/validation.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';
const TARGET_SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_ID || '148zAkd_M-LR9NpQmq0rP4BEeMT9lGqx2qCwX4a2TKug';

app.use(express.json());

// Persistent storage directory for warranties backup
const DATA_DIR = path.resolve(__dirname, 'data');
const CSV_FILE = path.join(DATA_DIR, 'warranties.csv');
const JSON_FILE = path.join(DATA_DIR, 'warranties.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CSV_FILE)) {
    fs.writeFileSync(
      CSV_FILE,
      'Date,Référence,Nom,Prénom,Téléphone,E-Mail,Ville,Produit,Modèle,Dimensions,Consentement\n',
      'utf8'
    );
  }
} catch (err) {
  console.warn('[Data Dir] Init:', err);
}

// Initialize Firestore if configured
const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.PROJECT_ID;

let firestore: Firestore | null = null;
let firestoreInitError: string | null = null;

if (projectId) {
  try {
    firestore = new Firestore({ projectId });
    console.log(`[Firestore] Initialisé avec projectId: ${projectId}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    firestoreInitError = errorMsg;
    console.error(`[Firestore] Erreur d'initialisation:`, errorMsg);
  }
} else {
  firestoreInitError =
    "Variable FIREBASE_PROJECT_ID non configurée. Le stockage persistant Firestore n'est pas actif.";
  console.warn(`[Firestore] Avertissement: ${firestoreInitError}`);
}

// Helper to append a row to Google Sheets
async function syncToGoogleSheets(row: (string | number)[]): Promise<{ success: boolean; error?: string }> {
  // 1. If user provided a webhook URL (Google Apps Script Web App on their sheet)
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: TARGET_SPREADSHEET_ID,
          row,
        }),
      });
      if (res.ok) {
        return { success: true };
      }
    } catch (e) {
      console.warn('[Google Sheets Webhook]', e);
    }
  }

  // 2. Direct Google Sheets API via GoogleAuth
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    if (token.token) {
      // Find first sheet name or append directly
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${TARGET_SPREADSHEET_ID}/values/A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const res = await fetch(appendUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [row] }),
      });

      if (res.ok) {
        console.log(`[Google Sheets] Ligne ajoutée avec succès sur ${TARGET_SPREADSHEET_ID}`);
        return { success: true };
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.warn(`[Google Sheets API] ${res.status}:`, errJson.error?.message);
        return { success: false, error: errJson.error?.message };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Google Sheets API Error]:', msg);
    return { success: false, error: msg };
  }

  return { success: false, error: 'No active Google Sheets transport' };
}

// Diagnostic endpoint
app.get('/api/status', async (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    firebaseConnected: Boolean(firestore && !firestoreInitError),
    projectId: projectId || null,
    targetSpreadsheetId: TARGET_SPREADSHEET_ID,
  });
});

// Admin export endpoint (returns CSV with exact requested columns)
app.get('/api/admin/export-csv', (_req: Request, res: Response) => {
  if (fs.existsSync(CSV_FILE)) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="warranties-dary.csv"');
    fs.createReadStream(CSV_FILE).pipe(res);
  } else {
    res.status(404).send('Aucune donnée enregistrée.');
  }
});

// Warranty registration endpoint
app.post('/api/garantie', async (req: Request, res: Response): Promise<void> => {
  const validation = validateWarrantyData(req.body);

  if (!validation.isValid || !validation.sanitizedData) {
    res.status(400).json({
      success: false,
      message: 'Données de formulaire invalides / بيانات النموذج غير صالحة',
      errors: validation.errors,
    });
    return;
  }

  const reference = generateWarrantyReference();
  const dateFormatted = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const rowValues = [
    dateFormatted,
    reference,
    validation.sanitizedData.nom,
    validation.sanitizedData.prenom,
    validation.sanitizedData.telephone,
    validation.sanitizedData.email,
    validation.sanitizedData.ville,
    validation.sanitizedData.type === 'matelas' ? 'Matelas' : 'Salon',
    validation.sanitizedData.modele || '-',
    validation.sanitizedData.dimensions || '-',
    'Oui',
  ];

  // 1. Append locally to CSV & JSON backup so data is NEVER lost
  try {
    const csvLine = rowValues.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n';
    fs.appendFileSync(CSV_FILE, csvLine, 'utf8');

    let allJson: unknown[] = [];
    if (fs.existsSync(JSON_FILE)) {
      try {
        allJson = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      } catch {
        allJson = [];
      }
    }
    allJson.push({
      date: dateFormatted,
      reference,
      nom: validation.sanitizedData.nom,
      prenom: validation.sanitizedData.prenom,
      telephone: validation.sanitizedData.telephone,
      email: validation.sanitizedData.email,
      ville: validation.sanitizedData.ville,
      produit: validation.sanitizedData.type === 'matelas' ? 'Matelas' : 'Salon',
      modele: validation.sanitizedData.modele || '-',
      dimensions: validation.sanitizedData.dimensions || '-',
      consentement: 'Oui',
    });
    fs.writeFileSync(JSON_FILE, JSON.stringify(allJson, null, 2), 'utf8');
  } catch (fsErr) {
    console.warn('[Local Storage Backup]', fsErr);
  }

  // 2. Direct background sync to Google Sheets (spreadsheet 148zAkd_M-LR9NpQmq0rP4BEeMT9lGqx2qCwX4a2TKug)
  syncToGoogleSheets(rowValues).catch((err) => {
    console.warn('[Google Sheets Sync]', err);
  });

  // 3. Firestore persistence if connected
  let docId: string | undefined = undefined;
  if (firestore) {
    try {
      const docRef = await firestore.collection('warranties').add({
        ...validation.sanitizedData,
        reference,
        status: 'active',
        createdAt: new Date().toISOString(),
        userAgent: req.headers['user-agent'] || null,
        clientIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
      });
      docId = docRef.id;
    } catch (fsErr) {
      console.warn('[Firestore write failed, saved to CSV/Sheets]', fsErr);
    }
  }

  // 4. Return successful registration to client with reference
  res.status(201).json({
    success: true,
    reference,
    id: docId,
    message: 'Bulletin de garantie enregistré avec succès.',
    data: {
      nom: validation.sanitizedData.nom,
      prenom: validation.sanitizedData.prenom,
      telephone: validation.sanitizedData.telephone,
      email: validation.sanitizedData.email,
      ville: validation.sanitizedData.ville,
      type: validation.sanitizedData.type,
      modele: validation.sanitizedData.modele,
      dimensions: validation.sanitizedData.dimensions,
      reference,
      createdAt: dateFormatted,
    },
  });
});

// Setup Vite for Dev or Static files for Production
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Dary Server] Serveur démarré sur http://0.0.0.0:${PORT}`);
    console.log(`[Google Sheets] Fichier cible configuré : ${TARGET_SPREADSHEET_ID}`);
  });
}

startServer().catch((err) => {
  console.error('Erreur au démarrage du serveur:', err);
  process.exit(1);
});
