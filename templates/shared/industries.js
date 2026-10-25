// 行業設定（唯一來源）：所有行業共用同一套版型，只換用詞、頁名、網址名稱與 schema.org 類型。
// 新增行業：在 INDUSTRIES 加一列即可（資料庫只檢查 key 的格式，不必改 SQL）。
// rental_sites.template 存的就是這裡的 key；舊網站的 'cafe' 照常可用。

// 「價目」頁的幾種說法（菜單、服務、課程、商品、診療、房型）
const OFFERS = {
  menu:      { label: '菜單與價格', nav: '菜單', path: 'menu/', item: '品項', provide: '店內提供', note: '價格以現場公告為準。', more: '看完整菜單' },
  service:   { label: '服務與價格', nav: '服務項目', path: 'services/', item: '服務', provide: '提供', note: '實際價格依現場評估為準。', more: '看所有服務' },
  course:    { label: '課程與費用', nav: '課程', path: 'courses/', item: '課程', provide: '開設', note: '費用以最新公告為準。', more: '看所有課程' },
  product:   { label: '商品與價格', nav: '商品', path: 'products/', item: '商品', provide: '販售', note: '價格以門市公告為準。', more: '看更多商品' },
  treatment: { label: '診療項目', nav: '診療項目', path: 'treatments/', item: '項目', provide: '提供', note: '費用依實際診療內容為準。', more: '看所有診療項目' },
  room:      { label: '房型與價格', nav: '房型', path: 'rooms/', item: '房型', provide: '提供', note: '房價依日期與方案調整，以訂房時為準。', more: '看所有房型' }
};
// 「照片」頁的幾種說法
const SPACES = {
  store:     { label: '店內環境', path: 'space/', more: '看更多照片' },
  space:     { label: '環境介紹', path: 'space/', more: '看更多照片' },
  classroom: { label: '教室環境', path: 'space/', more: '看更多照片' },
  clinic:    { label: '診所環境', path: 'space/', more: '看更多照片' },
  school:    { label: '園所環境', path: 'space/', more: '看更多照片' },
  lodging:   { label: '空間介紹', path: 'space/', more: '看更多照片' },
  portfolio: { label: '作品集', path: 'works/', more: '看更多作品' }
};
// 「來店資訊」頁的幾種說法
const VISITS = {
  store:   { label: '來店資訊', path: 'visit/', intro: '來店', ask: '如果想先確認座位或詢問細節' },
  clinic:  { label: '看診資訊', path: 'visit/', intro: '看診', ask: '如果想先確認看診時間或預約' },
  school:  { label: '交通與聯絡', path: 'visit/', intro: '參觀', ask: '如果想預約參觀或詢問課程' },
  contact: { label: '聯絡我們', path: 'contact/', intro: '洽詢', ask: '如果想詢問報價或預約時間' },
  lodging: { label: '交通與入住', path: 'visit/', intro: '入住', ask: '如果想詢問空房或交通方式' }
};

// [key, 名稱, 群組, schema.org 類型, 價目, 照片, 來店]
const ROWS = [
  ['cafe', '咖啡店', '餐飲', 'CafeOrCoffeeShop', 'menu', 'store', 'store'],
  ['bakery', '烘焙坊', '餐飲', 'Bakery', 'menu', 'store', 'store'],
  ['drink', '飲料店', '餐飲', 'FoodEstablishment', 'menu', 'store', 'store'],
  ['dessert', '甜點店', '餐飲', 'FoodEstablishment', 'menu', 'store', 'store'],
  ['restaurant', '餐廳', '餐飲', 'Restaurant', 'menu', 'store', 'store'],
  ['brunch', '早午餐店', '餐飲', 'Restaurant', 'menu', 'store', 'store'],
  ['bar', '酒吧', '餐飲', 'BarOrPub', 'menu', 'store', 'store'],
  ['tea', '茶館', '餐飲', 'FoodEstablishment', 'menu', 'store', 'store'],
  ['salon', '美髮沙龍', '美業', 'HairSalon', 'service', 'store', 'store'],
  ['beauty', '美容美體', '美業', 'BeautySalon', 'service', 'store', 'store'],
  ['nail', '美甲美睫', '美業', 'NailSalon', 'service', 'store', 'store'],
  ['spa', '按摩 SPA', '美業', 'DaySpa', 'service', 'store', 'store'],
  ['pet', '寵物美容', '美業', 'PetStore', 'service', 'store', 'store'],
  ['gym', '健身房', '運動與健康', 'ExerciseGym', 'course', 'space', 'store'],
  ['yoga', '瑜珈教室', '運動與健康', 'SportsActivityLocation', 'course', 'classroom', 'school'],
  ['medical', '診所', '運動與健康', 'MedicalClinic', 'treatment', 'clinic', 'clinic'],
  ['dental', '牙醫診所', '運動與健康', 'Dentist', 'treatment', 'clinic', 'clinic'],
  ['tcm', '中醫診所', '運動與健康', 'MedicalClinic', 'treatment', 'clinic', 'clinic'],
  ['physio', '物理治療所', '運動與健康', 'Physiotherapy', 'treatment', 'clinic', 'clinic'],
  ['vet', '動物醫院', '運動與健康', 'VeterinaryCare', 'treatment', 'clinic', 'clinic'],
  ['edu', '補習班', '教育', 'EducationalOrganization', 'course', 'classroom', 'school'],
  ['arts', '才藝教室', '教育', 'EducationalOrganization', 'course', 'classroom', 'school'],
  ['music', '音樂教室', '教育', 'EducationalOrganization', 'course', 'classroom', 'school'],
  ['kindergarten', '幼兒園', '教育', 'Preschool', 'course', 'school', 'school'],
  ['daycare', '托嬰中心', '教育', 'ChildCare', 'course', 'school', 'school'],
  ['fashion', '服飾店', '零售', 'ClothingStore', 'product', 'store', 'store'],
  ['furniture', '家具店', '零售', 'FurnitureStore', 'product', 'store', 'store'],
  ['florist', '花店', '零售', 'Florist', 'product', 'store', 'store'],
  ['bookstore', '書店', '零售', 'BookStore', 'product', 'store', 'store'],
  ['eyewear', '眼鏡行', '零售', 'Optician', 'product', 'store', 'store'],
  ['gift', '選物店', '零售', 'Store', 'product', 'store', 'store'],
  ['grocery', '雜貨店', '零售', 'GroceryStore', 'product', 'store', 'store'],
  ['car-detailing', '汽車美容', '生活服務', 'AutoWash', 'service', 'store', 'store'],
  ['auto-repair', '汽車維修', '生活服務', 'AutoRepair', 'service', 'store', 'store'],
  ['motorcycle', '機車行', '生活服務', 'MotorcycleRepair', 'service', 'store', 'store'],
  ['laundry', '洗衣店', '生活服務', 'DryCleaningOrLaundry', 'service', 'store', 'store'],
  ['cleaning', '居家清潔', '生活服務', 'ProfessionalService', 'service', 'portfolio', 'contact'],
  ['photo', '攝影工作室', '生活服務', 'ProfessionalService', 'service', 'portfolio', 'contact'],
  ['interior', '室內設計', '生活服務', 'HomeAndConstructionBusiness', 'service', 'portfolio', 'contact'],
  ['renovation', '裝修工程', '生活服務', 'GeneralContractor', 'service', 'portfolio', 'contact'],
  ['lodging', '民宿', '住宿', 'BedAndBreakfast', 'room', 'lodging', 'lodging'],
  ['law', '法律事務所', '專業服務', 'LegalService', 'service', 'space', 'contact'],
  ['accounting', '會計記帳', '專業服務', 'AccountingService', 'service', 'space', 'contact'],
  ['realestate', '房屋仲介', '專業服務', 'RealEstateAgent', 'service', 'space', 'contact'],
  ['other', '其他店家', '其他', 'LocalBusiness', 'service', 'store', 'store']
];

export const INDUSTRIES = ROWS.map(([key, label, group, schemaType, offer, space, visit]) => ({
  key, label, group, schemaType, kindLabel: label,
  offer: OFFERS[offer], space: SPACES[space], visit: VISITS[visit]
}));
export const INDUSTRY_KEYS = INDUSTRIES.map((i) => i.key);
export const INDUSTRY_GROUPS = [...new Set(INDUSTRIES.map((i) => i.group))];
// 與資料庫 011 的格式檢查一致
export const INDUSTRY_KEY_RE = /^[a-z][a-z-]{1,23}$/;

const BY_KEY = Object.fromEntries(INDUSTRIES.map((i) => [i.key, i]));
export function getIndustry(key) { return BY_KEY[key] || null; }
