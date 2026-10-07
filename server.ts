import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { validateWarrantyData, generateWarrantyReference } from './src/validation.ts';
import {
  TARGET_SPREADSHEET_ID,
  writeWarrantyToGoogleSheets,
  getServiceAccountDetails,
  WarrantyEntry,
} from './src/services/sheetsServer.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID || TARGET_SPREADSHEET_ID;

// Parse JSON bodies
app.use(express.json());

// In-memory anti-duplication cache (persists for 10 minutes)
interface DuplicateCacheItem {
  reference: string;
  createdAt: string;
  timestamp: number;
}
const recentSubmissions = new Map<string, DuplicateCacheItem>();

function getSubmissionFingerprint(data: {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  ville: string;
  type: string;
  modele?: string;
  dimensions?: string;
}): string {
  return `${data.telephone.trim()}_${data.type}_${data.modele || ''}_${data.dimensions || ''}_${data.nom.trim().toLowerCase()}_${data.prenom.trim().toLowerCase()}`;
}

// 1. Diagnostic endpoint for Google Sheets & Service Account
app.get('/api/sheets-status', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { email, projectId } = await getServiceAccountDetails();

    res.json({
      success: true,
      googleSheetsId: GOOGLE_SHEETS_ID,
      serviceAccountEmail: email,
      projectId,
      instructions:
        "Partagez le fichier Google Sheets avec cette adresse de compte de service en tant qu'Éditeur pour autoriser l'écriture.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: msg,
    });
  }
});

// 2. Real test endpoint to add and verify a TEST entry in Google Sheets
app.post('/api/test-bulletin', async (_req: Request, res: Response): Promise<void> => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const testReference = `TEST-${Date.now().toString().slice(-6)}`;
    const nowFormatted = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const testEntry: WarrantyEntry = {
      date: nowFormatted,
      reference: testReference,
      nom: 'TEST_NOM',
      prenom: 'TEST_PRENOM',
      telephone: '0600000000',
      email: 'test@dary.ma',
      ville: 'Casablanca',
      produit: 'Matelas',
      modele: 'Feelsoft Hr+',
      dimensions: '160 × 190',
      consentement: 'Oui',
    };

    const writeResult = await writeWarrantyToGoogleSheets(testEntry, GOOGLE_SHEETS_ID);

    if (!writeResult.success) {
      const { email } = await getServiceAccountDetails();
      res.status(503).json({
        success: false,
        message: `Échec de l'écriture du test dans Google Sheets : ${writeResult.error}`,
        serviceAccountEmail: email,
        googleSheetsId: GOOGLE_SHEETS_ID,
        details: writeResult.details,
      });
      return;
    }

    res.json({
      success: true,
      message: 'Bulletin de TEST inséré et vérifié avec succès dans Google Sheets.',
      reference: testReference,
      sheetTitle: writeResult.sheetTitle,
      updatedRange: writeResult.updatedRange,
      entry: testEntry,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      message: `Erreur interne lors du test : ${msg}`,
    });
  }
});

// 3. Warranty registration endpoint (Pure Google Sheets API)
app.post('/api/garantie', async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Content-Type', 'application/json');

  const validation = validateWarrantyData(req.body);

  if (!validation.isValid || !validation.sanitizedData) {
    res.status(400).json({
      success: false,
      message: 'Données de formulaire invalides / بيانات النموذج غير صالحة',
      errors: validation.errors,
    });
    return;
  }

  // Anti-duplication check: if identical submission within 10 minutes
  const fingerprint = getSubmissionFingerprint(validation.sanitizedData);
  const now = Date.now();
  const existing = recentSubmissions.get(fingerprint);

  if (existing && now - existing.timestamp < 10 * 60 * 1000) {
    console.log(`[Anti-Doublon] Soumission identique détectée, référence réutilisée: ${existing.reference}`);
    res.status(200).json({
      success: true,
      reference: existing.reference,
      message: 'Votre bulletin est déjà enregistré dans Google Sheets (doublon évité).',
      data: {
        ...validation.sanitizedData,
        reference: existing.reference,
        createdAt: existing.createdAt,
      },
    });
    return;
  }

  const reference = generateWarrantyReference();
  const dateFormatted = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Préparation de l'entrée conforme aux 11 colonnes :
  // Date | Référence | Nom | Prénom | Téléphone | E-mail | Ville | Produit | Modèle | Dimensions | Consentement
  const sheetEntry: WarrantyEntry = {
    date: dateFormatted,
    reference,
    nom: validation.sanitizedData.nom,
    prenom: validation.sanitizedData.prenom,
    telephone: validation.sanitizedData.telephone,
    email: validation.sanitizedData.email,
    ville: validation.sanitizedData.ville,
    produit: validation.sanitizedData.type === 'matelas' ? 'Matelas' : 'Salon',
    modele: validation.sanitizedData.type === 'matelas' ? validation.sanitizedData.modele || '' : '',
    dimensions: validation.sanitizedData.type === 'matelas' ? validation.sanitizedData.dimensions || '' : '',
    consentement: 'Oui',
  };

  try {
    const sheetsResult = await writeWarrantyToGoogleSheets(sheetEntry, GOOGLE_SHEETS_ID);

    if (!sheetsResult.success) {
      const { email } = await getServiceAccountDetails();
      console.error(`[Google Sheets Error]`, sheetsResult.error);

      res.status(503).json({
        success: false,
        message: `Échec d'enregistrement dans Google Sheets : ${sheetsResult.error}`,
        serviceAccountEmail: email,
        googleSheetsId: GOOGLE_SHEETS_ID,
        error: sheetsResult.error,
        details: sheetsResult.details,
      });
      return;
    }

    // Enregistrement réussi et confirmé dans Google Sheets
    recentSubmissions.set(fingerprint, {
      reference,
      createdAt: dateFormatted,
      timestamp: now,
    });

    console.log(
      `[Google Sheets] Bulletin enregistré avec succès: Réf ${reference} sur l'onglet ${sheetsResult.sheetTitle} (${sheetsResult.updatedRange})`
    );

    res.status(201).json({
      success: true,
      reference,
      message: 'Votre bulletin est enregistré dans Google Sheets.',
      sheetTitle: sheetsResult.sheetTitle,
      updatedRange: sheetsResult.updatedRange,
      data: {
        nom: sheetEntry.nom,
        prenom: sheetEntry.prenom,
        telephone: sheetEntry.telephone,
        email: sheetEntry.email,
        ville: sheetEntry.ville,
        type: validation.sanitizedData.type,
        modele: sheetEntry.modele,
        dimensions: sheetEntry.dimensions,
        reference,
        createdAt: dateFormatted,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[API /api/garantie] Exception:`, err);

    res.status(500).json({
      success: false,
      message: `Erreur inattendue du serveur : ${msg}`,
    });
  }
});

// Generic JSON error handler for any /api route
app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(500).json({
    success: false,
    message: err?.message || 'Erreur interne du serveur.',
  });
});

// Setup Vite for Dev or Static files for Production (Mounted strictly AFTER /api)
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

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Dary Server] Serveur démarré sur http://0.0.0.0:${PORT}`);
    const { email } = await getServiceAccountDetails();
    console.log(`[Google Sheets] ID cible : ${GOOGLE_SHEETS_ID}`);
    console.log(`[Compte de service Google] : ${email || 'Non détecté'}`);
  });
}

startServer().catch((err) => {
  console.error('Erreur au démarrage du serveur:', err);
  process.exit(1);
});
