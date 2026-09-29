export interface CatalogItem {
  name: string;
  /** Price range in yen. */
  price: readonly [number, number];
  /** Suffixes that make sense for this item. An empty string means the plain name. */
  variants: readonly string[];
}

export interface Department {
  name: string;
  items: readonly CatalogItem[];
  /** Product-page lines that suit everything in the department. */
  notes: readonly string[];
}

const GIFT = ['', ' 詰め合わせ', ' お徳用', ' 季節限定', ' ギフト用'];
const COLOURS = ['', ' ホワイト', ' ブラック', ' 2026年モデル'];
const REFILLS = ['', ' 詰め替え用', ' 大容量', ' 無香料'];
const PENS = ['', ' 黒', ' 限定色', ' 3本セット'];
const TABLEWARE = ['', ' 夫婦セット', ' ギフト箱入り'];

/** Products a Japanese online shop would plausibly list, grouped by department. */
export const DEPARTMENTS: readonly Department[] = [
  {
    name: '食品',
    items: [
      { name: '静岡県産 深蒸し煎茶', price: [800, 3000], variants: GIFT },
      { name: '宇治抹茶', price: [1000, 5000], variants: GIFT },
      { name: '新潟県産 コシヒカリ 5kg', price: [2500, 5000], variants: ['', ' 新米', ' ギフト用'] },
      { name: '信州味噌', price: [400, 1500], variants: ['', ' 減塩', ' お徳用'] },
      { name: '本醸造醤油', price: [300, 1200], variants: ['', ' 減塩', ' お徳用'] },
      { name: '南部せんべい', price: [400, 2000], variants: GIFT },
      { name: '讃岐うどん', price: [500, 3000], variants: GIFT },
      { name: '十割そば', price: [600, 3000], variants: GIFT },
      { name: '紀州南高梅 梅干し', price: [1000, 5000], variants: ['', ' はちみつ漬け', ' ギフト用'] },
      { name: '有明海産 焼き海苔', price: [800, 4000], variants: GIFT },
      { name: '小倉羊羹', price: [500, 3000], variants: GIFT },
      { name: '北海道 ミルククッキー', price: [500, 2500], variants: GIFT },
    ],
    notes: [
      '毎日の食卓に欠かせない定番の味です。',
      'ギフトにもおすすめです。',
      '産地直送でお届けします。',
      '数量限定のお買い得品です。',
    ],
  },
  {
    name: '家電',
    items: [
      { name: 'IH炊飯器', price: [8000, 60000], variants: COLOURS },
      { name: '電気ケトル', price: [2000, 10000], variants: COLOURS },
      { name: 'コードレス掃除機', price: [10000, 60000], variants: COLOURS },
      { name: '空気清浄機', price: [10000, 50000], variants: COLOURS },
      { name: 'ヘアドライヤー', price: [3000, 30000], variants: COLOURS },
      { name: 'オーブンレンジ', price: [15000, 60000], variants: COLOURS },
      { name: 'サーキュレーター', price: [3000, 15000], variants: COLOURS },
      { name: 'スチーム加湿器', price: [5000, 20000], variants: COLOURS },
      { name: 'ワイヤレスイヤホン', price: [3000, 30000], variants: COLOURS },
      { name: 'Bluetoothスピーカー', price: [3000, 25000], variants: COLOURS },
    ],
    notes: [
      '使いやすさにこだわった人気の一品。',
      'メーカー保証1年付き。',
      'レビュー高評価の売れ筋商品。',
      '省エネ設計で電気代を抑えます。',
    ],
  },
  {
    name: '日用品',
    items: [
      { name: '泡ハンドソープ', price: [200, 800], variants: REFILLS },
      { name: '液体洗濯洗剤', price: [300, 1500], variants: REFILLS },
      { name: '食器用洗剤', price: [150, 600], variants: REFILLS },
      { name: '柔軟剤', price: [300, 1200], variants: REFILLS },
      { name: 'アミノ酸シャンプー', price: [800, 3000], variants: REFILLS },
      { name: '薬用入浴剤', price: [400, 2000], variants: ['', ' 無香料', ' 詰め合わせ'] },
      { name: '今治タオル', price: [1000, 5000], variants: ['', ' フェイスタオル', ' バスタオル', ' ギフト箱入り'] },
      { name: 'ボックスティッシュ', price: [300, 1000], variants: ['', ' 5箱パック'] },
    ],
    notes: [
      '毎日の暮らしに欠かせない定番商品です。',
      'まとめ買いがお得です。',
      'レビュー高評価の売れ筋商品。',
      '国内の工場で生産しています。',
    ],
  },
  {
    name: '文房具',
    items: [
      { name: 'ゲルインクボールペン', price: [100, 1000], variants: PENS },
      { name: 'シャープペンシル', price: [200, 2000], variants: PENS },
      { name: '蛍光ペン', price: [100, 800], variants: PENS },
      { name: '筆ペン', price: [300, 1500], variants: ['', ' 黒', ' 薄墨'] },
      { name: '万年筆', price: [3000, 30000], variants: ['', ' 黒', ' 限定色', ' ギフト箱入り'] },
      { name: '方眼ノート', price: [150, 1000], variants: ['', ' A5', ' B5', ' 5冊パック'] },
      { name: '2026年版 手帳', price: [800, 4000], variants: ['', ' A5', ' B6'] },
      { name: 'マスキングテープ', price: [150, 800], variants: ['', ' 和柄', ' 5巻セット'] },
    ],
    notes: [
      '書きやすさにこだわりました。',
      '学生から社会人まで人気です。',
      'ギフトにもおすすめです。',
      'レビュー高評価の売れ筋商品。',
    ],
  },
  {
    name: 'キッチン用品',
    items: [
      { name: '南部鉄器 急須', price: [5000, 20000], variants: ['', ' ギフト箱入り'] },
      { name: 'ヒノキ まな板', price: [2000, 8000], variants: ['', ' 大', ' 小'] },
      { name: '三徳包丁', price: [3000, 20000], variants: ['', ' 刃渡り16.5cm', ' ギフト箱入り'] },
      { name: '有田焼 茶碗', price: [1500, 8000], variants: TABLEWARE },
      { name: '若狭塗 箸', price: [1000, 6000], variants: TABLEWARE },
      { name: '伊賀焼 土鍋', price: [4000, 20000], variants: ['', ' 6号', ' 8号'] },
      { name: '波佐見焼 湯呑み', price: [1200, 6000], variants: TABLEWARE },
      { name: '曲げわっぱ 弁当箱', price: [3000, 12000], variants: ['', ' 一段', ' 二段'] },
    ],
    notes: [
      '職人がひとつひとつ丁寧に仕上げました。',
      'ギフトにもおすすめです。',
      '長く使える確かな品質です。',
      '日本の伝統工芸品です。',
    ],
  },
];

/** Company name endings, each with the romaji used for its web domain and the industry it implies. */
export const COMPANY_KINDS: readonly { suffix: string; romaji: string; industry: string }[] = [
  { suffix: '商事', romaji: 'shoji', industry: '卸売業' },
  { suffix: '物産', romaji: 'bussan', industry: '卸売業' },
  { suffix: '工業', romaji: 'kogyo', industry: '製造業' },
  { suffix: '製作所', romaji: 'seisakusho', industry: '製造業' },
  { suffix: '精機', romaji: 'seiki', industry: '精密機器' },
  { suffix: '電機', romaji: 'denki', industry: '電気機器' },
  { suffix: '化学', romaji: 'kagaku', industry: '化学' },
  { suffix: '建設', romaji: 'kensetsu', industry: '建設業' },
  { suffix: '不動産', romaji: 'fudosan', industry: '不動産業' },
  { suffix: '運輸', romaji: 'unyu', industry: '運輸業' },
  { suffix: '食品', romaji: 'shokuhin', industry: '食料品' },
  { suffix: '薬品', romaji: 'yakuhin', industry: '医薬品' },
  { suffix: '印刷', romaji: 'insatsu', industry: '印刷業' },
  // Real firms spell this one "system" in their domains, so it stays in English.
  { suffix: 'システム', romaji: 'system', industry: '情報・通信業' },
];

export const CATCH_PHRASES: readonly string[] = [
  '未来をつくる、確かな技術。',
  '暮らしに寄り添うものづくり。',
  '品質第一、お客様第一。',
  '地域とともに歩み続けます。',
  '信頼をかたちに。',
  '技術で社会に貢献する。',
  'つなぐ、ひろげる、ささえる。',
  'ひとりひとりに最適な提案を。',
  '安心と安全をお届けします。',
  '挑戦し続ける企業へ。',
  '新しい価値を、世界へ。',
  '毎日の「当たり前」を支える。',
];

export const JOB_TITLES: readonly string[] = [
  '営業部長',
  '営業担当',
  'ソフトウェアエンジニア',
  'デザイナー',
  '経理担当',
  '人事担当',
  'マーケティング担当',
  '店長',
  '研究員',
  'プロジェクトマネージャー',
  'カスタマーサポート',
  '一般事務',
  '総務担当',
  '品質管理',
  '広報担当',
  'コンサルタント',
];
