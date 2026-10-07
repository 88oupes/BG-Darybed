import React, { useState, useEffect } from 'react';
import {
  CITIES,
  MATTRESS_MODELS,
  ProductType,
  MattressModel,
} from './catalog.ts';
import { generateWarrantyReference } from './validation.ts';
import {
  initAuth,
  googleSignIn,
  logout as googleLogout,
  getAccessToken,
} from './auth.ts';
import {
  appendWarrantyToSheet,
  TARGET_SPREADSHEET_ID,
  WarrantyRowData,
} from './services/sheets.ts';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BedDouble,
  Armchair,
  FileCheck,
  Phone,
  Mail,
  MapPin,
  User,
  Printer,
  ChevronRight,
  Info,
  Table,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';

interface FormData {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  ville: string;
  type: ProductType;
  modele: string;
  dimensions: string;
  consent: boolean;
}

interface ConfirmedWarranty {
  reference: string;
  id?: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  ville: string;
  type: ProductType;
  modele?: string;
  dimensions?: string;
  createdAt: string;
  sheetSynced?: boolean;
}

export default function App() {
  const [formData, setFormData] = useState<FormData>({
    nom: '',
    prenom: '',
    telephone: '',
    email: '',
    ville: 'casablanca',
    type: 'matelas',
    modele: 'Feelsoft Hr+',
    dimensions: '160 × 190',
    consent: false,
  });

  const [availableDimensions, setAvailableDimensions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmedWarranty, setConfirmedWarranty] = useState<ConfirmedWarranty | null>(null);

  // Google Sheets Auth State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState<boolean>(false);

  // Initialize auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setGoogleToken(token);
      },
      () => {
        setCurrentUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Update available dimensions when mattress model changes
  useEffect(() => {
    if (formData.type === 'matelas') {
      const selectedModelObj = MATTRESS_MODELS.find(
        (m) => m.name.toLowerCase() === formData.modele.toLowerCase()
      );
      if (selectedModelObj) {
        setAvailableDimensions(selectedModelObj.dimensions);
        // If current dimensions not available in new model, select first available
        if (!selectedModelObj.dimensions.includes(formData.dimensions)) {
          setFormData((prev) => ({
            ...prev,
            dimensions: selectedModelObj.dimensions[0] || '',
          }));
        }
      }
    }
  }, [formData.modele, formData.type]);

  const handleTypeChange = (newType: ProductType) => {
    setFormData((prev) => ({
      ...prev,
      type: newType,
      ...(newType === 'matelas'
        ? {
            modele: prev.modele || 'Feelsoft Hr+',
            dimensions: prev.dimensions || '160 × 190',
          }
        : {
            modele: '',
            dimensions: '',
          }),
    }));
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy.type;
      delete copy.modele;
      delete copy.dimensions;
      return copy;
    });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModelName = e.target.value;
    const modelObj = MATTRESS_MODELS.find((m) => m.name === newModelName);
    const validDims = modelObj ? modelObj.dimensions : [];

    setFormData((prev) => ({
      ...prev,
      modele: newModelName,
      dimensions: validDims.includes(prev.dimensions) ? prev.dimensions : validDims[0] || '',
    }));

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy.modele;
      delete copy.dimensions;
      return copy;
    });
  };

  const validateClientSide = (): boolean => {
    const errs: Record<string, string> = {};

    if (!formData.nom.trim() || formData.nom.trim().length < 2) {
      errs.nom = 'Le nom est obligatoire (min. 2 lettres) / الاسم العائلي إجباري';
    }

    if (!formData.prenom.trim() || formData.prenom.trim().length < 2) {
      errs.prenom = 'Le prénom est obligatoire (min. 2 lettres) / الاسم الشخصي إجباري';
    }

    const cleanPhone = formData.telephone.replace(/[\s.-]/g, '');
    const phoneValid = /^(?:\+?212|0)[5-7]\d{8}$/.test(cleanPhone);
    if (!formData.telephone.trim() || !phoneValid) {
      errs.telephone = 'Numéro de téléphone marocain invalide / رقم هاتف مغربي غير صالح (ex: 0612345678)';
    }

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim());
    if (!formData.email.trim() || !emailValid) {
      errs.email = 'Adresse e-mail valide requise / بريد إلكتروني صالح مطلوب';
    }

    if (!formData.ville) {
      errs.ville = 'Veuillez sélectionner la ville d’achat / يرجى اختيار مدينة الشراء';
    }

    if (formData.type === 'matelas') {
      if (!formData.modele) {
        errs.modele = 'Le modèle de matelas est obligatoire / نموذج المرتبة إجباري';
      }
      if (!formData.dimensions) {
        errs.dimensions = 'Les dimensions sont obligatoires / مقاسات المرتبة إجبارية';
      }
    }

    if (!formData.consent) {
      errs.consent = 'Vous devez accepter les conditions de garantie / يجب الموافقة على شروط الضمان';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleConnectGoogle = async () => {
    setIsSigningInGoogle(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setGoogleToken(res.accessToken);
      }
    } catch (err) {
      console.error('Google Sign In failed:', err);
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    await googleLogout();
    setCurrentUser(null);
    setGoogleToken(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validateClientSide()) {
      return;
    }

    setLoading(true);

    try {
      // 1. Get or prompt Google access token to write to the requested Sheet
      let activeToken = googleToken || (await getAccessToken());
      if (!activeToken) {
        try {
          const authRes = await googleSignIn();
          if (authRes) {
            activeToken = authRes.accessToken;
            setCurrentUser(authRes.user);
            setGoogleToken(authRes.accessToken);
          }
        } catch (authErr) {
          console.warn('Google Auth skipped or canceled:', authErr);
        }
      }

      const reference = generateWarrantyReference();
      const nowIso = new Date().toISOString();
      const dateFormatted = nowIso.slice(0, 19).replace('T', ' ');

      const matchedCity = CITIES.find((c) => c.id === formData.ville);
      const villeName = matchedCity ? `${matchedCity.fr} (${matchedCity.ar})` : formData.ville;

      const sheetRow: WarrantyRowData = {
        date: dateFormatted,
        reference,
        nom: formData.nom.trim(),
        prenom: formData.prenom.trim(),
        telephone: formData.telephone.trim(),
        email: formData.email.trim(),
        ville: villeName,
        produit: formData.type === 'matelas' ? 'Matelas' : 'Salon',
        modele: formData.type === 'matelas' ? formData.modele : '-',
        dimensions: formData.type === 'matelas' ? formData.dimensions : '-',
        consentement: formData.consent ? 'Oui' : 'Non',
      };

      let sheetSyncSuccess = false;

      // 2. Append to target Google Sheet: 148zAkd_M-LR9NpQmq0rP4BEeMT9lGqx2qCwX4a2TKug
      if (activeToken) {
        const sheetRes = await appendWarrantyToSheet(activeToken, sheetRow, TARGET_SPREADSHEET_ID);
        if (sheetRes.success) {
          sheetSyncSuccess = true;
          console.log(`[Google Sheets] Ligne ajoutée avec succès sur ${TARGET_SPREADSHEET_ID}`);
        } else {
          console.error(`[Google Sheets] Erreur écriture :`, sheetRes.error);
        }
      }

      // 3. Attempt server endpoint (POST /api/garantie) for full persistence
      const payload: Record<string, unknown> = {
        nom: formData.nom.trim(),
        prenom: formData.prenom.trim(),
        telephone: formData.telephone.trim(),
        email: formData.email.trim(),
        ville: formData.ville,
        type: formData.type,
        consent: formData.consent,
      };

      if (formData.type === 'matelas') {
        payload.modele = formData.modele;
        payload.dimensions = formData.dimensions;
      }

      try {
        const response = await fetch('/api/garantie', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => ({}));
        if (result && result.reference) {
          // If server confirmed reference
          sheetRow.reference = result.reference;
        }
      } catch (backendErr) {
        console.warn('Backend persistence status:', backendErr);
      }

      // If either Google Sheets synced or submission prepared, display confirmed warranty
      setConfirmedWarranty({
        reference: sheetRow.reference,
        nom: formData.nom.trim(),
        prenom: formData.prenom.trim(),
        telephone: formData.telephone.trim(),
        email: formData.email.trim(),
        ville: villeName,
        type: formData.type,
        modele: formData.type === 'matelas' ? formData.modele : undefined,
        dimensions: formData.type === 'matelas' ? formData.dimensions : undefined,
        createdAt: nowIso,
        sheetSynced: sheetSyncSuccess,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setServerError(`Erreur lors de l'enregistrement : ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setConfirmedWarranty(null);
    setServerError(null);
    setErrors({});
    setFormData({
      nom: '',
      prenom: '',
      telephone: '',
      email: '',
      ville: 'casablanca',
      type: 'matelas',
      modele: 'Feelsoft Hr+',
      dimensions: '160 × 190',
      consent: false,
    });
  };

  return (
    <div className="min-h-screen bg-[#F7F2EB] text-[#292331] flex flex-col font-latin">
      {/* Top Brand Navigation */}
      <header className="bg-white border-b border-[#EDE4F2] sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-22 sm:h-24 flex items-center justify-between">
          <div className="flex items-center">
            <img
              src="https://res.cloudinary.com/psbqhe7h/image/upload/v1791384101/logo_dary.png"
              alt="Dary Bed"
              className="h-16 sm:h-20 w-auto object-contain"
            />
          </div>

          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-2 bg-[#EDE4F2] px-3 py-1.5 rounded-full border border-[#61218B]/20 text-xs">
                <Table className="w-3.5 h-3.5 text-[#61218B]" />
                <span className="font-semibold text-[#61218B] hidden sm:inline">
                  Google Sheets connecté
                </span>
                <button
                  type="button"
                  onClick={handleDisconnectGoogle}
                  title="Déconnecter Google"
                  className="text-slate-400 hover:text-red-600 transition-colors ml-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogle}
                disabled={isSigningInGoogle}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-[#61218B] border border-[#61218B]/30 hover:bg-[#EDE4F2] transition-colors cursor-pointer"
              >
                <Table className="w-3.5 h-3.5 text-[#61218B]" />
                <span>Connecter Google Sheets</span>
              </button>
            )}

            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#EDE4F2] text-[#61218B] border border-[#61218B]/20">
              <ShieldCheck className="w-4 h-4 text-[#61218B]" />
              <span>Garantie Officielle</span>
              <span className="font-arabic font-bold" dir="rtl">ضمان رسمي</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          {confirmedWarranty ? (
            /* Confirmation Certificate View */
            <section aria-labelledby="confirmation-heading" className="bg-white rounded-2xl border-2 border-[#61218B]/30 shadow-xl p-6 sm:p-10 text-center animate-in fade-in duration-300">
              <div className="w-16 h-16 bg-[#EDE4F2] text-[#61218B] rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-[#61218B]" />
              </div>

              <span className="inline-block px-3.5 py-1 bg-green-50 text-green-700 font-bold text-xs rounded-full border border-green-200 mb-3">
                Activation Confirmée / تم تفعيل الضمان بنجاح
              </span>

              <h1 id="confirmation-heading" className="text-2xl sm:text-3xl font-extrabold text-[#34134F] tracking-tight mb-2">
                Bulletin de Garantie Enregistré
              </h1>
              <p className="font-arabic text-lg text-[#61218B] mb-6" dir="rtl">
                تم تسجيل بطاقة الضمان الرسمية في قاعدة بيانات داري
              </p>

              {/* Reference Card */}
              <div className="bg-[#EDE4F2]/50 border border-[#61218B]/20 rounded-xl p-5 mb-6 text-center">
                <span className="text-xs uppercase tracking-wider text-[#61218B] font-bold block mb-1">
                  Numéro de Référence Officiel / رقم المرجع
                </span>
                <span className="text-2xl sm:text-3xl font-mono font-extrabold text-[#34134F] tracking-wider select-all">
                  {confirmedWarranty.reference}
                </span>
                <p className="text-xs text-[#6F7072] mt-2">
                  Conservez précieusement cette référence pour toute demande au service après-vente Dary.
                </p>
              </div>

              {/* Google Sheets Sync Status Card */}
              <div className="bg-white border border-[#EDE4F2] rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-50 text-green-700 flex items-center justify-center shrink-0 border border-green-200">
                    <Table className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Enregistré sur votre fichier Google Sheets
                    </span>
                    <span className="text-xs text-slate-500 font-mono truncate max-w-xs block">
                      ID: {TARGET_SPREADSHEET_ID}
                    </span>
                  </div>
                </div>

                <a
                  href={`https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                >
                  <span>Ouvrir le fichier</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Recap Grid */}
              <div className="bg-[#F7F2EB] border border-[#EDE4F2] rounded-xl p-5 mb-8 text-left text-sm">
                <h3 className="font-bold text-[#34134F] mb-4 pb-2 border-b border-[#EDE4F2] flex justify-between items-center">
                  <span>Détails du bulletin enregistré</span>
                  <span className="font-arabic font-normal text-xs text-[#6F7072]" dir="rtl">
                    تفاصيل البطاقة المسجلة
                  </span>
                </h3>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
                  <div>
                    <dt className="text-xs text-[#6F7072]">Client / الزبون</dt>
                    <dd className="font-semibold text-[#292331]">
                      {confirmedWarranty.prenom} {confirmedWarranty.nom}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#6F7072]">Téléphone / الهاتف</dt>
                    <dd className="font-semibold text-[#292331]">{confirmedWarranty.telephone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#6F7072]">E-mail / البريد</dt>
                    <dd className="font-semibold text-[#292331]">{confirmedWarranty.email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#6F7072]">Ville d’achat / مدينة الشراء</dt>
                    <dd className="font-semibold text-[#292331]">{confirmedWarranty.ville}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#6F7072]">Type de produit / نوع المنتوج</dt>
                    <dd className="font-semibold text-[#61218B] capitalize">
                      {confirmedWarranty.type === 'matelas' ? 'Matelas / مرتبة' : 'Salon / صالون'}
                    </dd>
                  </div>
                  {confirmedWarranty.type === 'matelas' && (
                    <>
                      <div>
                        <dt className="text-xs text-[#6F7072]">Modèle / النموذج</dt>
                        <dd className="font-semibold text-[#292331]">{confirmedWarranty.modele}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#6F7072]">Dimensions / المقاسات</dt>
                        <dd className="font-semibold text-[#292331]">{confirmedWarranty.dimensions}</dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt className="text-xs text-[#6F7072]">Date d&apos;activation / تاريخ التفعيل</dt>
                    <dd className="font-semibold text-[#292331]">
                      {new Date(confirmedWarranty.createdAt).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[#EDE4F2] font-semibold text-[#292331] bg-white hover:bg-[#F7F2EB] transition-colors"
                >
                  <Printer className="w-4 h-4 text-[#61218B]" />
                  <span>Imprimer le certificat</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#61218B] font-semibold text-white hover:bg-[#34134F] shadow-md transition-colors"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Enregistrer un autre produit</span>
                </button>
              </div>
            </section>
          ) : (
            /* Registration Form View */
            <div className="space-y-8">
              {/* Hero Banner Header */}
              <div className="relative rounded-3xl overflow-hidden shadow-lg border border-[#EDE4F2] bg-linear-to-r from-[#34134F] via-[#61218B] to-[#34134F] text-white p-6 sm:p-10">
                <div className="relative z-10 max-w-xl">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#34134F]/80 text-[#EDE4F2] border border-[#EDE4F2]/30 mb-3">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#EDE4F2]" />
                    <span>Portail d&apos;activation officiel Dary</span>
                  </span>

                  <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight mb-2">
                    Enregistrement de Garantie
                  </h1>
                  <h2 className="text-xl sm:text-2xl font-bold font-arabic text-[#EDE4F2] mb-4" dir="rtl">
                    تسجيل وتفعيل بطاقة الضمان الرسمية
                  </h2>

                  <p className="text-sm sm:text-base text-purple-100 leading-relaxed font-normal">
                    Activez votre garantie constructeur pour vos matelas et salons Dary afin de bénéficier de notre service après-vente agréé partout au Maroc.
                  </p>
                </div>

                {/* Subtle background bedroom image with purple fade */}
                <img
                  src="/bedroom.png"
                  alt="Chambre Dary"
                  className="absolute right-0 top-0 h-full w-2/5 object-cover opacity-20 pointer-events-none hidden sm:block mix-blend-luminosity"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              {/* Target Sheet Indicator */}
              <div className="bg-[#EDE4F2]/60 border border-[#61218B]/20 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <Table className="w-4 h-4 text-[#61218B] shrink-0" />
                  <div>
                    <span className="font-semibold text-[#34134F] block">
                      Enregistrement automatique sur Google Sheets
                    </span>
                    <span className="text-[#6F7072] font-mono text-[11px]">
                      Fichier ID : {TARGET_SPREADSHEET_ID}
                    </span>
                  </div>
                </div>

                <a
                  href={`https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#61218B] hover:text-[#34134F] font-semibold transition-colors"
                >
                  <span>Voir la feuille</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Server or Storage Error Alert */}
              {serverError && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl shadow-xs text-red-800 flex items-start gap-3 animate-in fade-in">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-bold">Échec de l&apos;activation / تعذر تفعيل الضمان</p>
                    <p className="mt-1">{serverError}</p>
                  </div>
                </div>
              )}

              {/* Form Card */}
              <form
                onSubmit={handleSubmit}
                noValidate
                className="bg-white rounded-3xl border border-[#EDE4F2] shadow-xl p-6 sm:p-10 space-y-8"
              >
                {/* SECTION 1: Product Selection */}
                <div className="space-y-4">
                  <div className="border-b border-[#EDE4F2] pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-[#EDE4F2] text-[#61218B] font-bold text-xs flex items-center justify-center">
                        1
                      </span>
                      <h2 className="text-base sm:text-lg font-bold text-[#34134F]">
                        Type de Produit
                      </h2>
                    </div>
                    <span className="text-sm font-arabic font-bold text-[#61218B]" dir="rtl">
                      نوع المنتوج
                    </span>
                  </div>

                  {/* Two boxes: Matelas or Salon (Single choice) */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <button
                      type="button"
                      onClick={() => handleTypeChange('matelas')}
                      className={`relative p-4 sm:p-5 rounded-2xl border-2 text-left flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                        formData.type === 'matelas'
                          ? 'border-[#61218B] bg-[#EDE4F2]/50 shadow-md ring-2 ring-[#61218B]/20'
                          : 'border-slate-200 hover:border-[#61218B]/40 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2.5 ${
                          formData.type === 'matelas'
                            ? 'bg-[#61218B] text-white'
                            : 'bg-[#EDE4F2] text-[#61218B]'
                        }`}
                      >
                        <BedDouble className="w-6 h-6" />
                      </div>
                      <span className="font-bold text-[#292331] text-sm sm:text-base">
                        Matelas
                      </span>
                      <span className="font-arabic font-bold text-xs sm:text-sm text-[#61218B] mt-0.5" dir="rtl">
                        مرتبة
                      </span>
                      {formData.type === 'matelas' && (
                        <span className="absolute top-3 right-3 text-[#61218B]">
                          <CheckCircle2 className="w-5 h-5 fill-[#61218B] text-white" />
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTypeChange('salon')}
                      className={`relative p-4 sm:p-5 rounded-2xl border-2 text-left flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                        formData.type === 'salon'
                          ? 'border-[#61218B] bg-[#EDE4F2]/50 shadow-md ring-2 ring-[#61218B]/20'
                          : 'border-slate-200 hover:border-[#61218B]/40 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2.5 ${
                          formData.type === 'salon'
                            ? 'bg-[#61218B] text-white'
                            : 'bg-[#EDE4F2] text-[#61218B]'
                        }`}
                      >
                        <Armchair className="w-6 h-6" />
                      </div>
                      <span className="font-bold text-[#292331] text-sm sm:text-base">
                        Salon
                      </span>
                      <span className="font-arabic font-bold text-xs sm:text-sm text-[#61218B] mt-0.5" dir="rtl">
                        صالون
                      </span>
                      {formData.type === 'salon' && (
                        <span className="absolute top-3 right-3 text-[#61218B]">
                          <CheckCircle2 className="w-5 h-5 fill-[#61218B] text-white" />
                        </span>
                      )}
                    </button>
                  </div>

                  {errors.type && (
                    <p className="text-xs text-red-600 mt-1 font-medium">{errors.type}</p>
                  )}

                  {/* If Matelas: Modèle & Dimensions REQUIRED */}
                  {formData.type === 'matelas' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 bg-[#F7F2EB] p-4 sm:p-5 rounded-2xl border border-[#EDE4F2]">
                      {/* Model Select */}
                      <div>
                        <label
                          htmlFor="modele-select"
                          className="bilingual-label text-xs font-bold text-[#292331] mb-1.5"
                        >
                          <span>Modèle de matelas *</span>
                          <span className="font-arabic font-bold text-[#61218B]" dir="rtl">
                            نموذج المرتبة *
                          </span>
                        </label>
                        <select
                          id="modele-select"
                          value={formData.modele}
                          onChange={handleModelChange}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EDE4F2] text-sm font-semibold text-[#292331] focus:outline-none focus:ring-2 focus:ring-[#61218B] focus:border-transparent transition-all"
                        >
                          {MATTRESS_MODELS.map((model: MattressModel) => (
                            <option key={model.id} value={model.name}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                        {errors.modele && (
                          <p className="text-xs text-red-600 mt-1 font-medium">{errors.modele}</p>
                        )}
                      </div>

                      {/* Dimensions Select */}
                      <div>
                        <label
                          htmlFor="dimensions-select"
                          className="bilingual-label text-xs font-bold text-[#292331] mb-1.5"
                        >
                          <span>Dimensions (cm) *</span>
                          <span className="font-arabic font-bold text-[#61218B]" dir="rtl">
                            المقاسات (سم) *
                          </span>
                        </label>
                        <select
                          id="dimensions-select"
                          value={formData.dimensions}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, dimensions: e.target.value }))
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EDE4F2] text-sm font-semibold text-[#292331] focus:outline-none focus:ring-2 focus:ring-[#61218B] focus:border-transparent transition-all"
                        >
                          {availableDimensions.map((dim: string) => (
                            <option key={dim} value={dim}>
                              {dim}
                            </option>
                          ))}
                        </select>
                        {errors.dimensions && (
                          <p className="text-xs text-red-600 mt-1 font-medium">
                            {errors.dimensions}
                          </p>
                        )}
                        <p className="text-[11px] text-[#6F7072] mt-1 font-medium">
                          Options autorisées pour {formData.modele}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* If Salon: Note for Salon coverage */
                    <div className="bg-[#EDE4F2]/50 border border-[#61218B]/20 p-4 rounded-2xl flex items-start gap-3 text-xs text-[#34134F]">
                      <Info className="w-4 h-4 text-[#61218B] shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold mb-0.5">
                          Garantie Salon Dary : Les dimensions ne sont pas requises pour ce produit.
                        </p>
                        <p className="font-arabic text-[#61218B]" dir="rtl">
                          ضمان الصالون يشمل الهيكل والإسفنج عالي الكثافة دون الحاجة لإدخال المقاسات.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION 2: Client Personal Details */}
                <div className="space-y-4">
                  <div className="border-b border-[#EDE4F2] pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-[#EDE4F2] text-[#61218B] font-bold text-xs flex items-center justify-center">
                        2
                      </span>
                      <h2 className="text-base sm:text-lg font-bold text-[#34134F]">
                        Informations de l&apos;Acheteur
                      </h2>
                    </div>
                    <span className="text-sm font-arabic font-bold text-[#61218B]" dir="rtl">
                      معلومات المشتري
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Nom */}
                    <div>
                      <label
                        htmlFor="nom"
                        className="bilingual-label text-xs font-bold text-[#292331] mb-1.5"
                      >
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-[#6F7072]" />
                          <span>Nom *</span>
                        </span>
                        <span className="font-arabic font-bold text-[#61218B]" dir="rtl">
                          الاسم العائلي *
                        </span>
                      </label>
                      <input
                        id="nom"
                        type="text"
                        value={formData.nom}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, nom: e.target.value }))
                        }
                        placeholder="Ex: Alaoui"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-[#292331] focus:outline-none focus:ring-2 focus:ring-[#61218B] transition-all ${
                          errors.nom ? 'border-red-400 bg-red-50/30' : 'border-[#EDE4F2] bg-white'
                        }`}
                      />
                      {errors.nom && (
                        <p className="text-xs text-red-600 mt-1 font-medium">{errors.nom}</p>
                      )}
                    </div>

                    {/* Prénom */}
                    <div>
                      <label
                        htmlFor="prenom"
                        className="bilingual-label text-xs font-bold text-[#292331] mb-1.5"
                      >
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-[#6F7072]" />
                          <span>Prénom *</span>
                        </span>
                        <span className="font-arabic font-bold text-[#61218B]" dir="rtl">
                          الاسم الشخصي *
                        </span>
                      </label>
                      <input
                        id="prenom"
                        type="text"
                        value={formData.prenom}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, prenom: e.target.value }))
                        }
                        placeholder="Ex: Mohammed"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-[#292331] focus:outline-none focus:ring-2 focus:ring-[#61218B] transition-all ${
                          errors.prenom ? 'border-red-400 bg-red-50/30' : 'border-[#EDE4F2] bg-white'
                        }`}
                      />
                      {errors.prenom && (
                        <p className="text-xs text-red-600 mt-1 font-medium">{errors.prenom}</p>
                      )}
                    </div>

                    {/* Téléphone */}
                    <div>
                      <label
                        htmlFor="telephone"
                        className="bilingual-label text-xs font-bold text-[#292331] mb-1.5"
                      >
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-[#6F7072]" />
                          <span>Téléphone *</span>
                        </span>
                        <span className="font-arabic font-bold text-[#61218B]" dir="rtl">
                          رقم الهاتف *
                        </span>
                      </label>
                      <input
                        id="telephone"
                        type="tel"
                        value={formData.telephone}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, telephone: e.target.value }))
                        }
                        placeholder="0612345678"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-[#292331] focus:outline-none focus:ring-2 focus:ring-[#61218B] transition-all ${
                          errors.telephone ? 'border-red-400 bg-red-50/30' : 'border-[#EDE4F2] bg-white'
                        }`}
                      />
                      {errors.telephone && (
                        <p className="text-xs text-red-600 mt-1 font-medium">{errors.telephone}</p>
                      )}
                    </div>

                    {/* Email */}
                    <div>
                      <label
                        htmlFor="email"
                        className="bilingual-label text-xs font-bold text-[#292331] mb-1.5"
                      >
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-[#6F7072]" />
                          <span>E-mail *</span>
                        </span>
                        <span className="font-arabic font-bold text-[#61218B]" dir="rtl">
                          البريد الإلكتروني *
                        </span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, email: e.target.value }))
                        }
                        placeholder="client@dary.ma"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-[#292331] focus:outline-none focus:ring-2 focus:ring-[#61218B] transition-all ${
                          errors.email ? 'border-red-400 bg-red-50/30' : 'border-[#EDE4F2] bg-white'
                        }`}
                      />
                      {errors.email && (
                        <p className="text-xs text-red-600 mt-1 font-medium">{errors.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Ville d'achat parmi les 52 villes bilingues */}
                  <div>
                    <label
                      htmlFor="ville"
                      className="bilingual-label text-xs font-bold text-[#292331] mb-1.5"
                    >
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#6F7072]" />
                        <span>Ville d’achat (52 villes du catalogue) *</span>
                      </span>
                      <span className="font-arabic font-bold text-[#61218B]" dir="rtl">
                        مدينة الشراء *
                      </span>
                    </label>
                    <select
                      id="ville"
                      value={formData.ville}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, ville: e.target.value }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EDE4F2] text-sm font-semibold text-[#292331] focus:outline-none focus:ring-2 focus:ring-[#61218B] transition-all"
                    >
                      {CITIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fr} — {c.ar}
                        </option>
                      ))}
                    </select>
                    {errors.ville && (
                      <p className="text-xs text-red-600 mt-1 font-medium">{errors.ville}</p>
                    )}
                  </div>
                </div>

                {/* SECTION 3: Consent Checkbox */}
                <div className="pt-2">
                  <label className="flex items-start gap-3 p-4 rounded-2xl border border-[#EDE4F2] bg-[#EDE4F2]/30 hover:bg-[#EDE4F2]/50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.consent}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, consent: e.target.checked }))
                      }
                      className="mt-1 w-4 h-4 rounded text-[#61218B] focus:ring-[#61218B] border-[#EDE4F2]"
                    />
                    <div className="text-xs leading-relaxed text-[#292331] space-y-1">
                      <p className="font-semibold text-[#34134F]">
                        J&apos;atteste de l&apos;exactitude des informations fournies et j&apos;accepte les conditions générales de garantie Dary.
                      </p>
                      <p className="font-arabic font-bold text-[#61218B]" dir="rtl">
                        أؤكد صحة المعلومات المدلى بها وأوافق على الشروط العامة لضمان داري.
                      </p>
                    </div>
                  </label>
                  {errors.consent && (
                    <p className="text-xs text-red-600 mt-1.5 font-medium">{errors.consent}</p>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 px-6 rounded-2xl font-bold text-white bg-[#61218B] hover:bg-[#34134F] active:bg-[#34134F] shadow-lg shadow-[#61218B]/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed text-base sm:text-lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Enregistrement sur Google Sheets...</span>
                    </>
                  ) : (
                    <>
                      <span>Activer ma garantie</span>
                      <span className="font-arabic font-normal text-sm" dir="rtl">
                        / تفعيل الضمان
                      </span>
                      <ChevronRight className="w-5 h-5 ml-1" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-[#EDE4F2] py-6 text-xs text-[#6F7072] mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div>
            <span className="font-bold text-[#34134F]">DARY Bed</span> © {new Date().getFullYear()} — Tous droits réservés.
          </div>
          <div className="font-arabic font-bold text-[#61218B]" dir="rtl">
            ضمان الجودة والراحة لمراتب وصالونات داري
          </div>
        </div>
      </footer>
    </div>
  );
}
