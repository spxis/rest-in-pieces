export interface Prefecture {
  name: string;
  romaji: string;
  /** Rough population in hundreds of thousands, used to weight where people live. */
  weight: number;
  /** Real cities in the prefecture, with romaji. */
  cities: readonly (readonly [string, string])[];
}

/** All 47 prefectures, in the standard JIS order. */
export const PREFECTURES: readonly Prefecture[] = [
  {
    name: '北海道',
    romaji: 'Hokkaido',
    weight: 51,
    cities: [
      ['札幌市', 'Sapporo'],
      ['函館市', 'Hakodate'],
      ['旭川市', 'Asahikawa'],
    ],
  },
  {
    name: '青森県',
    romaji: 'Aomori',
    weight: 12,
    cities: [
      ['青森市', 'Aomori'],
      ['弘前市', 'Hirosaki'],
    ],
  },
  { name: '岩手県', romaji: 'Iwate', weight: 12, cities: [['盛岡市', 'Morioka']] },
  {
    name: '宮城県',
    romaji: 'Miyagi',
    weight: 23,
    cities: [
      ['仙台市', 'Sendai'],
      ['石巻市', 'Ishinomaki'],
    ],
  },
  { name: '秋田県', romaji: 'Akita', weight: 9, cities: [['秋田市', 'Akita']] },
  { name: '山形県', romaji: 'Yamagata', weight: 10, cities: [['山形市', 'Yamagata']] },
  {
    name: '福島県',
    romaji: 'Fukushima',
    weight: 18,
    cities: [
      ['福島市', 'Fukushima'],
      ['郡山市', 'Koriyama'],
    ],
  },
  {
    name: '茨城県',
    romaji: 'Ibaraki',
    weight: 28,
    cities: [
      ['水戸市', 'Mito'],
      ['つくば市', 'Tsukuba'],
    ],
  },
  {
    name: '栃木県',
    romaji: 'Tochigi',
    weight: 19,
    cities: [
      ['宇都宮市', 'Utsunomiya'],
      ['日光市', 'Nikko'],
    ],
  },
  {
    name: '群馬県',
    romaji: 'Gunma',
    weight: 19,
    cities: [
      ['前橋市', 'Maebashi'],
      ['高崎市', 'Takasaki'],
    ],
  },
  {
    name: '埼玉県',
    romaji: 'Saitama',
    weight: 73,
    cities: [
      ['さいたま市', 'Saitama'],
      ['川越市', 'Kawagoe'],
      ['所沢市', 'Tokorozawa'],
    ],
  },
  {
    name: '千葉県',
    romaji: 'Chiba',
    weight: 63,
    cities: [
      ['千葉市', 'Chiba'],
      ['船橋市', 'Funabashi'],
      ['柏市', 'Kashiwa'],
    ],
  },
  {
    name: '東京都',
    romaji: 'Tokyo',
    weight: 140,
    cities: [
      ['新宿区', 'Shinjuku'],
      ['渋谷区', 'Shibuya'],
      ['世田谷区', 'Setagaya'],
      ['品川区', 'Shinagawa'],
      ['八王子市', 'Hachioji'],
    ],
  },
  {
    name: '神奈川県',
    romaji: 'Kanagawa',
    weight: 92,
    cities: [
      ['横浜市', 'Yokohama'],
      ['川崎市', 'Kawasaki'],
      ['鎌倉市', 'Kamakura'],
    ],
  },
  {
    name: '新潟県',
    romaji: 'Niigata',
    weight: 21,
    cities: [
      ['新潟市', 'Niigata'],
      ['長岡市', 'Nagaoka'],
    ],
  },
  { name: '富山県', romaji: 'Toyama', weight: 10, cities: [['富山市', 'Toyama']] },
  { name: '石川県', romaji: 'Ishikawa', weight: 11, cities: [['金沢市', 'Kanazawa']] },
  { name: '福井県', romaji: 'Fukui', weight: 7, cities: [['福井市', 'Fukui']] },
  { name: '山梨県', romaji: 'Yamanashi', weight: 8, cities: [['甲府市', 'Kofu']] },
  {
    name: '長野県',
    romaji: 'Nagano',
    weight: 20,
    cities: [
      ['長野市', 'Nagano'],
      ['松本市', 'Matsumoto'],
    ],
  },
  {
    name: '岐阜県',
    romaji: 'Gifu',
    weight: 19,
    cities: [
      ['岐阜市', 'Gifu'],
      ['高山市', 'Takayama'],
    ],
  },
  {
    name: '静岡県',
    romaji: 'Shizuoka',
    weight: 36,
    cities: [
      ['静岡市', 'Shizuoka'],
      ['浜松市', 'Hamamatsu'],
    ],
  },
  {
    name: '愛知県',
    romaji: 'Aichi',
    weight: 75,
    cities: [
      ['名古屋市', 'Nagoya'],
      ['豊田市', 'Toyota'],
      ['岡崎市', 'Okazaki'],
    ],
  },
  {
    name: '三重県',
    romaji: 'Mie',
    weight: 17,
    cities: [
      ['津市', 'Tsu'],
      ['四日市市', 'Yokkaichi'],
      ['伊勢市', 'Ise'],
    ],
  },
  { name: '滋賀県', romaji: 'Shiga', weight: 14, cities: [['大津市', 'Otsu']] },
  {
    name: '京都府',
    romaji: 'Kyoto',
    weight: 25,
    cities: [
      ['京都市', 'Kyoto'],
      ['宇治市', 'Uji'],
    ],
  },
  {
    name: '大阪府',
    romaji: 'Osaka',
    weight: 88,
    cities: [
      ['大阪市', 'Osaka'],
      ['堺市', 'Sakai'],
      ['豊中市', 'Toyonaka'],
    ],
  },
  {
    name: '兵庫県',
    romaji: 'Hyogo',
    weight: 54,
    cities: [
      ['神戸市', 'Kobe'],
      ['姫路市', 'Himeji'],
      ['西宮市', 'Nishinomiya'],
    ],
  },
  { name: '奈良県', romaji: 'Nara', weight: 13, cities: [['奈良市', 'Nara']] },
  { name: '和歌山県', romaji: 'Wakayama', weight: 9, cities: [['和歌山市', 'Wakayama']] },
  { name: '鳥取県', romaji: 'Tottori', weight: 5, cities: [['鳥取市', 'Tottori']] },
  {
    name: '島根県',
    romaji: 'Shimane',
    weight: 6,
    cities: [
      ['松江市', 'Matsue'],
      ['出雲市', 'Izumo'],
    ],
  },
  {
    name: '岡山県',
    romaji: 'Okayama',
    weight: 18,
    cities: [
      ['岡山市', 'Okayama'],
      ['倉敷市', 'Kurashiki'],
    ],
  },
  {
    name: '広島県',
    romaji: 'Hiroshima',
    weight: 27,
    cities: [
      ['広島市', 'Hiroshima'],
      ['福山市', 'Fukuyama'],
    ],
  },
  {
    name: '山口県',
    romaji: 'Yamaguchi',
    weight: 13,
    cities: [
      ['山口市', 'Yamaguchi'],
      ['下関市', 'Shimonoseki'],
    ],
  },
  { name: '徳島県', romaji: 'Tokushima', weight: 7, cities: [['徳島市', 'Tokushima']] },
  { name: '香川県', romaji: 'Kagawa', weight: 9, cities: [['高松市', 'Takamatsu']] },
  { name: '愛媛県', romaji: 'Ehime', weight: 13, cities: [['松山市', 'Matsuyama']] },
  { name: '高知県', romaji: 'Kochi', weight: 7, cities: [['高知市', 'Kochi']] },
  {
    name: '福岡県',
    romaji: 'Fukuoka',
    weight: 51,
    cities: [
      ['福岡市', 'Fukuoka'],
      ['北九州市', 'Kitakyushu'],
      ['久留米市', 'Kurume'],
    ],
  },
  { name: '佐賀県', romaji: 'Saga', weight: 8, cities: [['佐賀市', 'Saga']] },
  {
    name: '長崎県',
    romaji: 'Nagasaki',
    weight: 13,
    cities: [
      ['長崎市', 'Nagasaki'],
      ['佐世保市', 'Sasebo'],
    ],
  },
  { name: '熊本県', romaji: 'Kumamoto', weight: 17, cities: [['熊本市', 'Kumamoto']] },
  {
    name: '大分県',
    romaji: 'Oita',
    weight: 11,
    cities: [
      ['大分市', 'Oita'],
      ['別府市', 'Beppu'],
    ],
  },
  { name: '宮崎県', romaji: 'Miyazaki', weight: 11, cities: [['宮崎市', 'Miyazaki']] },
  { name: '鹿児島県', romaji: 'Kagoshima', weight: 16, cities: [['鹿児島市', 'Kagoshima']] },
  {
    name: '沖縄県',
    romaji: 'Okinawa',
    weight: 15,
    cities: [
      ['那覇市', 'Naha'],
      ['沖縄市', 'Okinawa'],
    ],
  },
];
