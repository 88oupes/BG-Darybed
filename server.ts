import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Firestore } from '@google-cloud/firestore';
import { validateWarrantyData, generateWarrantyReference } from './src/validation.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());

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
    firestore = new Firestore({
      projectId,
    });
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

// Diagnostic endpoint to check Firebase status
app.get('/api/status', async (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    firebaseConnected: Boolean(firestore && !firestoreInitError),
    projectId: projectId || null,
    firestoreInitError: firestoreInitError || null,
  });
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

  // Check if Firestore is configured and connected
  if (!firestore) {
    res.status(503).json({
      success: false,
      storageAvailable: false,
      message:
        "Le stockage Firebase Firestore n'est pas encore connecté. Configurez FIREBASE_PROJECT_ID côté serveur pour permettre l'enregistrement persistant des garanties. Aucun bulletin n'a été activé fictivement.",
      error: 'FIREBASE_NOT_CONFIGURED',
      details: firestoreInitError,
    });
    return;
  }

  try {
    const reference = generateWarrantyReference();
    const warrantyRecord = {
      ...validation.sanitizedData,
      reference,
      status: 'active',
      createdAt: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || null,
      clientIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
    };

    const docRef = await firestore.collection('warranties').add(warrantyRecord);

    console.log(
      `[Garantie] Enregistrement réussi dans Firestore: ${docRef.id} - Réf: ${reference}`
    );

    res.status(201).json({
      success: true,
      reference,
      id: docRef.id,
      message: 'Bulletin de garantie enregistré avec succès dans Firestore.',
      data: {
        nom: warrantyRecord.nom,
        prenom: warrantyRecord.prenom,
        telephone: warrantyRecord.telephone,
        email: warrantyRecord.email,
        ville: warrantyRecord.ville,
        type: warrantyRecord.type,
        modele: warrantyRecord.modele,
        dimensions: warrantyRecord.dimensions,
        reference,
        createdAt: warrantyRecord.createdAt,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Garantie] Échec d'enregistrement Firestore:`, err);

    res.status(503).json({
      success: false,
      storageAvailable: false,
      message: `Échec d'enregistrement dans Firestore : ${errorMsg}. Aucun bulletin n'a été validé.`,
      error: 'FIRESTORE_WRITE_ERROR',
      details: errorMsg,
    });
  }
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
  });
}

startServer().catch((err) => {
  console.error('Erreur au démarrage du serveur:', err);
  process.exit(1);
});
