import { CITIES, MATTRESS_MODELS, ProductType } from './catalog.ts';

export interface WarrantySubmission {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  ville: string;
  type: ProductType;
  modele?: string;
  dimensions?: string;
  consent: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  sanitizedData?: WarrantySubmission;
}

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

export function validatePhone(phone: string): boolean {
  // Accepts Moroccan formats: 06XXXXXXXX, 07XXXXXXXX, 05XXXXXXXX, +2126XXXXXXXX, +2127XXXXXXXX, 212...
  const cleaned = phone.replace(/[\s.-]/g, '');
  const re = /^(?:\+?212|0)[5-7]\d{8}$/;
  return re.test(cleaned);
}

export function validateWarrantyData(input: unknown): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input || typeof input !== 'object') {
    return { isValid: false, errors: { form: 'Données invalides / بيانات غير صالحة' } };
  }

  const data = input as Record<string, unknown>;

  const nom = typeof data.nom === 'string' ? data.nom.trim() : '';
  const prenom = typeof data.prenom === 'string' ? data.prenom.trim() : '';
  const telephone = typeof data.telephone === 'string' ? data.telephone.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const ville = typeof data.ville === 'string' ? data.ville.trim() : '';
  const type = data.type as ProductType;
  const consent = data.consent === true;

  if (!nom || nom.length < 2 || nom.length > 100) {
    errors.nom = 'Le nom est obligatoire (au moins 2 caractères) / الاسم العائلي إجباري';
  }

  if (!prenom || prenom.length < 2 || prenom.length > 100) {
    errors.prenom = 'Le prénom est obligatoire (au moins 2 caractères) / الاسم الشخصي إجباري';
  }

  if (!telephone || !validatePhone(telephone)) {
    errors.telephone = 'Numéro de téléphone marocain invalide / رقم هاتف مغربي غير صالح';
  }

  if (!email || email.length > 254 || !validateEmail(email)) {
    errors.email = 'Adresse e-mail invalide / عنوان البريد الإلكتروني غير صالح';
  }

  const matchedCity = CITIES.find((c) => c.id === ville || c.fr.toLowerCase() === ville.toLowerCase());
  if (!ville || !matchedCity) {
    errors.ville = "Veuillez choisir une ville d'achat valide / يرجى اختيار مدينة شراء صالحة";
  }

  if (type !== 'matelas' && type !== 'salon') {
    errors.type = 'Veuillez sélectionner Matelas ou Salon / يرجى اختيار إما مرتبة أو صالون';
  }

  let finalModele: string | undefined = undefined;
  let finalDimensions: string | undefined = undefined;

  if (type === 'matelas') {
    const rawModele = typeof data.modele === 'string' ? data.modele.trim() : '';
    const rawDimensions = typeof data.dimensions === 'string' ? data.dimensions.trim() : '';

    const modelObj = MATTRESS_MODELS.find(
      (m) => m.id === rawModele || m.name.toLowerCase() === rawModele.toLowerCase()
    );

    if (!rawModele || !modelObj) {
      errors.modele = 'Le modèle de matelas est obligatoire / نموذج المرتبة إجباري';
    } else {
      finalModele = modelObj.name;
      if (!rawDimensions) {
        errors.dimensions = 'Les dimensions sont obligatoires pour un matelas / مقاسات المرتبة إجبارية';
      } else if (!modelObj.dimensions.includes(rawDimensions)) {
        errors.dimensions = `Dimensions non disponibles pour le modèle ${modelObj.name} / المقاسات غير متوفرة لهذا النموذج`;
      } else {
        finalDimensions = rawDimensions;
      }
    }
  } else if (type === 'salon') {
    // For salon, model and dimensions are completely excluded from the submission
    finalModele = undefined;
    finalDimensions = undefined;
  }

  if (!consent) {
    errors.consent = 'Vous devez accepter les conditions de garantie / يجب الموافقة على شروط الضمان';
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    errors,
    sanitizedData: isValid
      ? {
          nom,
          prenom,
          telephone,
          email,
          ville: matchedCity ? matchedCity.fr : ville,
          type,
          ...(type === 'matelas' ? { modele: finalModele, dimensions: finalDimensions } : {}),
          consent,
        }
      : undefined,
  };
}

export function generateWarrantyReference(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `DRY-${dateStr}-${rand}`;
}
