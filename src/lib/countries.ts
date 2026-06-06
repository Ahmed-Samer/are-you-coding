export type State = {
  id: string;
  name: string;
};

export type Country = {
  id: string;
  name: string;
  states: State[];
};

export const ARAB_COUNTRIES: Country[] = [
  {
    id: "EG",
    name: "مصر (Egypt)",
    states: [
      { id: "EG-C", name: "القاهرة (Cairo)" },
      { id: "EG-GZ", name: "الجيزة (Giza)" },
      { id: "EG-ALX", name: "الإسكندرية (Alexandria)" },
      { id: "EG-QHM", name: "القليوبية (Qalyubia)" },
      { id: "EG-SHR", name: "الشرقية (Al Sharqia)" },
      { id: "EG-DKQ", name: "الدقهلية (Dakahlia)" },
      { id: "EG-GHR", name: "الغربية (Gharbia)" },
      { id: "EG-MNF", name: "المنوفية (Monufia)" },
      { id: "EG-KFS", name: "كفر الشيخ (Kafr El Sheikh)" },
      { id: "EG-BH", name: "البحيرة (Beheira)" },
      { id: "EG-MAT", name: "مطروح (Matrouh)" },
      { id: "EG-IS", name: "الإسماعيلية (Ismailia)" },
      { id: "EG-SUZ", name: "السويس (Suez)" },
      { id: "EG-PTS", name: "بورسعيد (Port Said)" },
      { id: "EG-NS", name: "شمال سيناء (North Sinai)" },
      { id: "EG-SS", name: "جنوب سيناء (South Sinai)" },
      { id: "EG-BNS", name: "بني سويف (Beni Suef)" },
      { id: "EG-FJM", name: "الفيوم (Faiyum)" },
      { id: "EG-MN", name: "المنيا (Minya)" },
      { id: "EG-AST", name: "أسيوط (Assiut)" },
      { id: "EG-SWG", name: "سوهاج (Sohag)" },
      { id: "EG-QNA", name: "قنا (Qena)" },
      { id: "EG-LX", name: "الأقصر (Luxor)" },
      { id: "EG-ASW", name: "أسوان (Aswan)" },
      { id: "EG-WAD", name: "الوادي الجديد (New Valley)" },
      { id: "EG-BA", name: "البحر الأحمر (Red Sea)" }
    ]
  },
  {
    id: "SA",
    name: "السعودية (Saudi Arabia)",
    states: [
      { id: "SA-01", name: "الرياض (Riyadh)" },
      { id: "SA-02", name: "مكة المكرمة (Makkah)" },
      { id: "SA-03", name: "المدينة المنورة (Madinah)" },
      { id: "SA-04", name: "المنطقة الشرقية (Eastern Province)" },
      { id: "SA-05", name: "القصيم (Al Qassim)" },
      { id: "SA-06", name: "عسير (Asir)" },
      { id: "SA-07", name: "تبوك (Tabuk)" },
      { id: "SA-08", name: "حائل (Hail)" },
      { id: "SA-09", name: "الحدود الشمالية (Northern Borders)" },
      { id: "SA-10", name: "جازان (Jazan)" },
      { id: "SA-11", name: "نجران (Najran)" },
      { id: "SA-12", name: "الباحة (Al Bahah)" },
      { id: "SA-13", name: "الجوف (Al Jawf)" }
    ]
  },
  {
    id: "AE",
    name: "الإمارات (UAE)",
    states: [
      { id: "AE-AZ", name: "أبوظبي (Abu Dhabi)" },
      { id: "AE-DU", name: "دبي (Dubai)" },
      { id: "AE-SH", name: "الشارقة (Sharjah)" },
      { id: "AE-AJ", name: "عجمان (Ajman)" },
      { id: "AE-UQ", name: "أم القيوين (Umm Al Quwain)" },
      { id: "AE-RK", name: "رأس الخيمة (Ras Al Khaimah)" },
      { id: "AE-FU", name: "الفجيرة (Fujairah)" }
    ]
  },
  {
    id: "KW",
    name: "الكويت (Kuwait)",
    states: [
      { id: "KW-KU", name: "العاصمة (Al Asimah)" },
      { id: "KW-HA", name: "حولي (Hawalli)" },
      { id: "KW-FA", name: "الفروانية (Al Farwaniyah)" },
      { id: "KW-AH", name: "الأحمدي (Al Ahmadi)" },
      { id: "KW-JA", name: "الجهراء (Al Jahra)" },
      { id: "KW-MU", name: "مبارك الكبير (Mubarak Al-Kabeer)" }
    ]
  }
];
