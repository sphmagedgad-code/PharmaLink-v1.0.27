/**
 * PharmaLink OS - Message Keywords
 * Arabic keyword lists and extraction regexes used to classify raw
 * WhatsApp export lines into buy/sell/urgent signals. Ported directly
 * from the approved reference implementation (PharmaLink.html) - this
 * is real business/domain data, not visual styling, and is reused
 * verbatim rather than re-invented.
 */

export const BUY_KEYWORDS = [
  'محتاج', 'مطلوب', 'طلوب', 'نريد', 'عايز', 'ابحث', 'نشتري', 'عاوز',
  'نطلب', 'محتاجين', 'هل يوجد', 'فين',
];

export const SELL_KEYWORDS = [
  'متوفر', 'عندي', 'عندنا', 'يوجد', 'للبيع', 'بسعر', 'كمية', 'معنا',
  'عرض', 'موجود معي', 'نبيع', 'لدينا',
];

export const URGENT_KEYWORDS = [
  'فوري', 'عاجل', 'اليوم', 'الآن', 'الان', 'تنفيذ', 'سريع', 'ضروري', 'فورا', 'فورًا',
];

export const KNOWN_DRUGS = [
  'مونجارو', 'أوزمبيك', 'اوزمبيك', 'أوزومبيك', 'اوزومبيك', 'ساكسندا', 'ويجوفي',
  'ترولسيتي', 'فيكتوزا', 'ميرونام', 'meronem', 'meropenem', 'أنتيفيو',
  'سوماتروبين', 'نورديتروبين', 'هيرموز', 'أكساتندي', 'xtandi', 'ليمبارزا',
  'lynparza', 'مابثيرا', 'mabthera', 'كيترودا', 'keytruda', 'انهيرتو', 'enhertu',
  'أفاستين', 'avastin', 'ترسيبا', 'tresiba', 'ريزوديج', 'ryzodeg', 'لانتوس',
  'lantus', 'توجيو', 'toujeo', 'مكستارد', 'mixtard', 'أكتراف', 'actrapid',
  'نوفومكس', 'novomix', 'ليفيمير', 'levemir', 'انتريستو', 'entresto', 'فورسيجا',
  'forxiga', 'إليكويس', 'eliquis', 'كزاريلتو', 'xarelto', 'بلافيكس', 'plavix',
  'نيورال', 'neoral', 'سيكلوسبورين', 'ريكوريمون', 'recormon', 'أرانسب', 'aranesp',
  'كوريومون', 'choriomon', 'بونفوري', 'profasi', 'سيتروتايد', 'cetrotide',
  'زولادكس', 'zoladex', 'أكتيمرا', 'actemra', 'انبريل', 'enbrel', 'هيرميرا',
  'humira', 'رميكيد', 'remicade', 'افرسدي', 'evrysdi', 'دوبيكسنت', 'dupixent',
  'إيبرانس', 'ibrance', 'كيسقالي', 'kisqali', 'زيلودا', 'xeloda', 'تاسيجنا',
  'tasigna', 'غليفك', 'gleevec', 'ليكيفو', 'lixiana', 'جارديانس', 'jardiance',
  'سينجاردي', 'synjardy', 'أوجمنتين', 'augmentin', 'زيثروماكس', 'زينات',
  'zinnat', 'سيلسيبت', 'cellcept', 'بروجراف', 'prograf', 'ريفوليد', 'revolade',
  'نبلاست', 'neupogen', 'نيولاستا', 'neulasta', 'كونكور', 'concor', 'بيسوبرولول',
  'ليبيتور', 'lipitor', 'كريستور', 'crestor', 'نيكسيوم', 'nexium', 'فالتريكس',
  'valtrex', 'سيربرولايسين', 'cerebrolysin', 'نوتروبيل', 'nootropil',
  'بالميكورت', 'pulmicort', 'سيريتيد', 'seretide', 'إتروفنت', 'atrovent',
  'سبيريفا', 'spiriva', 'هيالجان', 'hyalgan', 'لاميكتال', 'lamictal', 'ديباكين',
  'depakine', 'تيجريتول', 'tegretol', 'كيبرا', 'keppra', 'توبماكس', 'topamax',
  'اريبيدكس', 'arimidex', 'فيمارا', 'femara', 'أروماسين', 'aromasin', 'هرسبتين',
  'herceptin', 'بيرجيتا', 'perjeta', 'كادسيلا', 'kadcyla', 'رينفوك', 'rinvoq',
];

/** Matches a price like "3200 ج" or "3200 جنيه". */
export const PRICE_RE = /(\d[\d,.]*?)\s*(ج|جنيه)/;

/** Matches Egyptian mobile numbers, with or without country code, globally. */
export const PHONE_RE = /\+?2?01(\d{9})/g;

/** Matches a quantity like "10 علبة" or "5 كرتون". */
export const QTY_RE = /(\d+)\s*(علبة|علب|كرتون|فايل)/;
