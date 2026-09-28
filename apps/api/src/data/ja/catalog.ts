export interface Department {
  name: string;
  /** Price range in yen. */
  price: readonly [number, number];
  products: readonly string[];
  variants: readonly string[];
}

/** Products a Japanese online shop would plausibly list, grouped by department. */
export const DEPARTMENTS: readonly Department[] = [
  {
    name: '食品',
    price: [300, 5000],
    products: [
      '静岡県産 深蒸し煎茶',
      '宇治抹茶',
      '新潟県産 コシヒカリ',
      '信州味噌',
      '本醸造醤油',
      '南部せんべい',
      '讃岐うどん',
      '十割そば',
      '紀州南高梅 梅干し',
      '有明海産 焼き海苔',
      '小倉羊羹',
      '北海道 ミルククッキー',
    ],
    variants: ['', ' 詰め合わせ', ' お徳用', ' 季節限定', ' ギフト用'],
  },
  {
    name: '家電',
    price: [2000, 60000],
    products: [
      'IH炊飯器',
      '電気ケトル',
      'コードレス掃除機',
      '空気清浄機',
      'ヘアドライヤー',
      'オーブンレンジ',
      'サーキュレーター',
      'スチーム加湿器',
      'ワイヤレスイヤホン',
      'Bluetoothスピーカー',
    ],
    variants: ['', ' ホワイト', ' ブラック', ' コンパクトモデル', ' 2026年モデル'],
  },
  {
    name: '日用品',
    price: [100, 3000],
    products: [
      '泡ハンドソープ',
      '液体洗濯洗剤',
      '今治タオル',
      '歯ブラシ',
      'アミノ酸シャンプー',
      'ボックスティッシュ',
      'キッチンスポンジ',
      '薬用入浴剤',
    ],
    variants: ['', ' 詰め替え用', ' 大容量', ' 3個パック', ' 無香料'],
  },
  {
    name: '文房具',
    price: [100, 30000],
    products: [
      'ゲルインクボールペン',
      '方眼ノート',
      '万年筆',
      '2027年 手帳',
      '付箋',
      '消しゴム',
      '筆ペン',
      'マスキングテープ',
    ],
    variants: ['', ' 黒', ' 青', ' 限定色', ' 5個セット'],
  },
  {
    name: 'キッチン用品',
    price: [500, 30000],
    products: [
      '南部鉄器 急須',
      'ヒノキ まな板',
      '三徳包丁',
      '有田焼 茶碗',
      '若狭塗 箸',
      '伊賀焼 土鍋',
      '波佐見焼 湯呑み',
      '曲げわっぱ 弁当箱',
    ],
    variants: ['', ' 大', ' 小', ' 2個セット', ' ギフト箱入り'],
  },
];

export const PRODUCT_NOTES: readonly string[] = [
  '毎日の暮らしに欠かせない定番商品です。',
  '職人がひとつひとつ丁寧に仕上げました。',
  'ギフトにもおすすめです。',
  '使いやすさにこだわった人気の一品。',
  '送料無料でお届けします。',
  '数量限定のお買い得品です。',
  'レビュー高評価の売れ筋商品。',
  '国内の工場で生産しています。',
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
  '看護師',
  '教員',
  '薬剤師',
  '研究員',
  'プロジェクトマネージャー',
  'カスタマーサポート',
  '一般事務',
  'コンサルタント',
];
