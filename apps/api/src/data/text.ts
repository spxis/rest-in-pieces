/**
 * Words for the related datasets. Faker has no to-do lists or product reviews, and its Japanese lorem is a
 * string of unrelated words, so these are hand-written: English for every locale but Japanese, and Japanese
 * for `ja`. Posts and comments in other locales are Faker's lorem in that locale, as JSONPlaceholder's are.
 */
import type { Stream } from './random.ts';

export const TODOS_EN = [
  'Book a dentist appointment',
  'Renew the passport',
  'Send the invoice to the client',
  'Buy milk and eggs',
  'Call the bank about the card',
  'Clean out the garage',
  'Water the plants',
  'Pay the electricity bill',
  'Reply to the landlord',
  'Prepare slides for Monday',
  'Back up the laptop',
  'Return the library books',
  'Schedule the car service',
  'Pick up the dry cleaning',
  'Write the quarterly report',
  'Update the project README',
  'Review the pull request',
  'Plan the weekend trip',
  'Order a birthday present',
  'Cancel the unused subscription',
  'Fix the leaking tap',
  'Sort the tax receipts',
  'Book flights for the conference',
  'Change the smoke alarm battery',
  'Take the recycling out',
  'Email the team about the release',
  'Read the onboarding guide',
  'Set up the new phone',
  'Try the new recipe',
  'Go for a 5 km run',
] as const;

export const TODOS_JA = [
  '歯医者の予約をする',
  'パスポートを更新する',
  '取引先に請求書を送る',
  '牛乳と卵を買う',
  'カードの件で銀行に電話する',
  '物置を片付ける',
  '植木に水をやる',
  '電気代を払う',
  '大家さんに返事をする',
  '月曜日の資料を作る',
  'パソコンのバックアップを取る',
  '図書館に本を返す',
  '車の点検を予約する',
  'クリーニングを取りに行く',
  '四半期の報告書を書く',
  'READMEを更新する',
  'プルリクエストをレビューする',
  '週末の旅行の計画を立てる',
  '誕生日プレゼントを注文する',
  '使っていないサブスクを解約する',
  '水漏れしている蛇口を直す',
  '確定申告の領収書を整理する',
  '学会の航空券を予約する',
  '火災報知器の電池を替える',
  '資源ごみを出す',
  'リリースについてチームにメールする',
  '新人研修の資料を読む',
  '新しいスマホの設定をする',
  '新しいレシピを試す',
  '5km走る',
] as const;

/** Review titles and sentences by how the reviewer felt: 0 for one or two stars, 1 for three, 2 for four or five. */
const REVIEWS_EN = {
  titles: [
    ['Disappointed', 'Not as described', 'Stopped working', 'Would not buy again', 'Poor quality'],
    ['It is fine', 'Does the job', 'Average', 'Mixed feelings', 'OK for the price'],
    ['Exactly what I needed', 'Worth every penny', 'Better than expected', 'Would buy again', 'Excellent quality'],
  ],
  sentences: [
    [
      'Stopped working after two weeks.',
      'The colour is nothing like the photos.',
      'I returned it for a refund.',
      'The instructions were missing.',
      'It arrived scratched and the box was crushed.',
      'Customer service never answered my email.',
    ],
    [
      'It works, but it feels a bit cheap.',
      'Smaller than I expected from the photos.',
      'Not bad for the price.',
      'Delivery took longer than promised.',
      'Does what it says and nothing more.',
      'I would look around before buying another.',
    ],
    [
      'Arrived quickly and well packed.',
      'Does exactly what the description says.',
      'I have used it every day for a month.',
      'The quality is better than the price suggests.',
      'I bought a second one as a gift.',
      'Easy to set up and easy to clean.',
    ],
  ],
} as const;

const REVIEWS_JA = {
  titles: [
    ['期待はずれでした', '説明と違いました', 'すぐに壊れました', '二度と買いません', '品質に不満があります'],
    ['まあまあです', '普通に使えます', '可もなく不可もなく', '良い点も悪い点もあります', '値段なりです'],
    ['買ってよかったです', '値段以上の価値があります', '想像以上でした', 'リピート決定です', '品質がとても良いです'],
  ],
  sentences: [
    [
      '2週間で動かなくなりました。',
      '写真と色がまったく違いました。',
      '返品して返金してもらいました。',
      '説明書が入っていませんでした。',
      '箱がつぶれていて、本体に傷がありました。',
      '問い合わせても返事がありませんでした。',
    ],
    [
      '使えますが、少し安っぽく感じます。',
      '写真で見たより小さかったです。',
      'この値段なら悪くないと思います。',
      '届くまでに予定より時間がかかりました。',
      '説明どおりですが、それ以上ではありません。',
      '次に買うときは他も比べてみます。',
    ],
    [
      'すぐに届き、梱包も丁寧でした。',
      '説明どおりの商品でした。',
      '1か月、毎日使っています。',
      '値段の割に品質が良いです。',
      'プレゼント用にもう1つ買いました。',
      'セットアップもお手入れも簡単です。',
    ],
  ],
} as const;

/** The mood a star rating speaks in: 0 unhappy, 1 lukewarm, 2 happy. */
export const moodOf = (rating: number) => (rating <= 2 ? 0 : rating === 3 ? 1 : 2);

/** A review's title and body, two or three sentences long, in English or Japanese. */
export function reviewText(random: Stream, rating: number, japanese: boolean): { title: string; body: string } {
  const pool = japanese ? REVIEWS_JA : REVIEWS_EN;
  const mood = moodOf(rating);
  const sentences = [...pool.sentences[mood]];
  const chosen: string[] = [];
  for (let n = random.int(2, 3); n > 0; n--) chosen.push(...sentences.splice(random.int(0, sentences.length - 1), 1));
  return { title: random.pick(pool.titles[mood]), body: chosen.join(japanese ? '' : ' ') };
}

const TOPICS_JA = [
  '家庭菜園',
  'ランニング',
  'パン作り',
  'キャンプ',
  '読書',
  '写真',
  '料理',
  'ヨガ',
  '一人旅',
  'ピアノ',
  'プログラミング',
  '英会話',
] as const;

const TITLES_JA = [
  '{topic}について思うこと',
  '{topic}を始めた理由',
  '{topic}の記録',
  '{topic}で気づいたこと',
  '今週の{topic}',
  '{topic}を続けるコツ',
] as const;

const OPENERS_JA = [
  '最近、{topic}を始めました。',
  '{topic}を続けて半年になります。',
  '久しぶりに{topic}の話を書きます。',
  '今日は{topic}について書いてみます。',
] as const;

const SENTENCES_JA = [
  '思っていたよりも時間がかかりましたが、楽しく続けています。',
  '同じことを考えている方の参考になればうれしいです。',
  '詳しいことは、また次回にまとめます。',
  'まだまだ試行錯誤の途中です。',
  'やってみないとわからないことが多いですね。',
  '失敗もありましたが、いい経験になりました。',
  '友人に勧められたのがきっかけでした。',
  '少しずつでも続けることが大切だと思います。',
  'わからないことは本やネットで調べながら進めています。',
  'まだまだ初心者ですが、少しずつ慣れてきました。',
] as const;

const COMMENTS_JA = [
  '参考になりました。',
  '私も同じことで悩んでいました。',
  '続きを楽しみにしています。',
  '写真があるともっとわかりやすいと思います。',
  '私も始めてみたくなりました。',
  'とても読みやすい記事でした。',
  '初心者でもできるでしょうか？',
  'わかります。最初は大変ですよね。',
  '私は少し違うやり方をしていますが、これも良さそうですね。',
  '丁寧な説明をありがとうございます。',
] as const;

/** Takes `count` different entries from `items`. */
function some<T>(random: Stream, items: readonly T[], count: number): T[] {
  const left = [...items];
  return Array.from(
    { length: Math.min(count, left.length) },
    () => left.splice(random.int(0, left.length - 1), 1)[0] as T,
  );
}

/** A Japanese blog post: a title about one topic, an opening line about it and two or three more sentences. */
export function postTextJa(random: Stream): { title: string; body: string } {
  const topic = random.pick(TOPICS_JA);
  const title = random.pick(TITLES_JA).replace('{topic}', topic);
  const body = [random.pick(OPENERS_JA).replace('{topic}', topic), ...some(random, SENTENCES_JA, random.int(2, 3))];
  return { title, body: body.join('') };
}

/** A Japanese comment: one or two short lines. */
export function commentTextJa(random: Stream): string {
  return some(random, COMMENTS_JA, random.int(1, 2)).join('');
}
