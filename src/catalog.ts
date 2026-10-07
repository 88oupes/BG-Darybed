/**
 * Catalogue officiel Dary - Villes et Produits
 */

export interface City {
  id: string;
  fr: string;
  ar: string;
}

export type ProductType = 'matelas' | 'salon';

export interface MattressModel {
  id: string;
  name: string;
  dimensions: string[];
}

export const CITIES: City[] = [
  { id: 'casablanca', fr: 'Casablanca', ar: 'الدار البيضاء' },
  { id: 'rabat', fr: 'Rabat', ar: 'الرباط' },
  { id: 'tanger', fr: 'Tanger', ar: 'طنجة' },
  { id: 'marrakech', fr: 'Marrakech', ar: 'مراكش' },
  { id: 'fes', fr: 'Fès', ar: 'فاس' },
  { id: 'agadir', fr: 'Agadir', ar: 'أكادير' },
  { id: 'meknes', fr: 'Meknès', ar: 'مكناس' },
  { id: 'oujda', fr: 'Oujda', ar: 'وجدة' },
  { id: 'kenitra', fr: 'Kénitra', ar: 'القنيطرة' },
  { id: 'tetouan', fr: 'Tétouan', ar: 'تطوان' },
  { id: 'sale', fr: 'Salé', ar: 'سلا' },
  { id: 'temara', fr: 'Témara', ar: 'تمارة' },
  { id: 'safi', fr: 'Safi', ar: 'آسفي' },
  { id: 'mohammedia', fr: 'Mohammédia', ar: 'المحمدية' },
  { id: 'el-jadida', fr: 'El Jadida', ar: 'الجديدة' },
  { id: 'beni-mellal', fr: 'Béni Mellal', ar: 'بني ملال' },
  { id: 'nador', fr: 'Nador', ar: 'الناظور' },
  { id: 'khouribga', fr: 'Khouribga', ar: 'خريبكة' },
  { id: 'settat', fr: 'Settat', ar: 'سطات' },
  { id: 'berrechid', fr: 'Berrechid', ar: 'برشيد' },
  { id: 'khemisset', fr: 'Khémisset', ar: 'الخميسات' },
  { id: 'taza', fr: 'Taza', ar: 'تازة' },
  { id: 'laayoune', fr: 'Laâyoune', ar: 'العيون' },
  { id: 'larache', fr: 'Larache', ar: 'العرائش' },
  { id: 'ksar-el-kebir', fr: 'Ksar El Kébir', ar: 'القصر الكبير' },
  { id: 'guelmim', fr: 'Guelmim', ar: 'كلميم' },
  { id: 'berkane', fr: 'Berkane', ar: 'بركان' },
  { id: 'khenifra', fr: 'Khénifra', ar: 'خنيفرة' },
  { id: 'taourirt', fr: 'Taourirt', ar: 'تاوريرت' },
  { id: 'bouskoura', fr: 'Bouskoura', ar: 'بوسكورة' },
  { id: 'fquih-ben-salah', fr: 'Fquih Ben Salah', ar: 'الفقيه بن صالح' },
  { id: 'dakhla', fr: 'Dakhla', ar: 'الداخلة' },
  { id: 'sidi-slimane', fr: 'Sidi Slimane', ar: 'سيدي سليمان' },
  { id: 'errachidia', fr: 'Errachidia', ar: 'الرشيدية' },
  { id: 'guercif', fr: 'Guercif', ar: 'جرسيف' },
  { id: 'ouarzazate', fr: 'Ouarzazate', ar: 'ورزازات' },
  { id: 'tiznit', fr: 'Tiznit', ar: 'تيزنيت' },
  { id: 'taroudant', fr: 'Taroudant', ar: 'تارودانت' },
  { id: 'essaouira', fr: 'Essaouira', ar: 'الصويرة' },
  { id: 'al-hoceima', fr: 'Al Hoceïma', ar: 'الحسيمة' },
  { id: 'midelt', fr: 'Midelt', ar: 'ميدلت' },
  { id: 'azrou', fr: 'Azrou', ar: 'أزرو' },
  { id: 'sefrou', fr: 'Sefrou', ar: 'صفرو' },
  { id: 'chefchaouen', fr: 'Chefchaouen', ar: 'شفشاون' },
  { id: 'sidi-kacem', fr: 'Sidi Kacem', ar: 'سيدي قاسم' },
  { id: 'youssoufia', fr: 'Youssoufia', ar: 'اليوسفية' },
  { id: 'tan-tan', fr: 'Tan-Tan', ar: 'طانطان' },
  { id: 'ouezzane', fr: 'Ouezzane', ar: 'وزان' },
  { id: 'martil', fr: 'Martil', ar: 'مرتيل' },
  { id: 'mdiq', fr: "M'diq", ar: 'المضيق' },
  { id: 'fnideq', fr: 'Fnideq', ar: 'الفنيدق' },
  { id: 'bouznika', fr: 'Bouznika', ar: 'بوزنيقة' },
];

export const STANDARD_MATTRESS_DIMENSIONS = [
  '90 × 190',
  '120 × 190',
  '140 × 190',
  '160 × 190',
  '160 × 200',
  '180 × 200',
  '200 × 200',
];

export const MATTRESS_MODELS: MattressModel[] = [
  {
    id: 'feelsoft-hr-plus',
    name: 'Feelsoft Hr+',
    dimensions: [
      '90 × 190',
      '120 × 190',
      '140 × 190',
      '160 × 190',
      '160 × 200',
      '180 × 200',
      '200 × 200',
    ],
  },
  {
    id: 'feelsoft-hr',
    name: 'Feelsoft Hr',
    dimensions: [
      '90 × 190',
      '120 × 190',
      '140 × 190',
      '160 × 190',
      '160 × 200',
      '180 × 200',
      '200 × 200',
    ],
  },
  {
    id: 'feelsoft-confort',
    name: 'Feelsoft Confort',
    dimensions: [
      '90 × 190',
      '120 × 190',
      '140 × 190',
      '160 × 190',
      '160 × 200',
      '180 × 200',
      '200 × 200',
    ],
  },
  {
    id: 'consoft-33',
    name: 'Consoft 33',
    dimensions: [
      '90 × 190',
      '120 × 190',
      '140 × 190',
      '160 × 190',
      '160 × 200',
      '200 × 200',
    ],
  },
  {
    id: 'yara',
    name: 'YARA',
    dimensions: [
      '90 × 190',
      '140 × 190',
    ],
  },
];
