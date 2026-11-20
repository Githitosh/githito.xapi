# githito.xapi の考え方

githito.xapi は、**リプライを見て楽しみ、軽い気持ちでニュースを見られる場所**をつくるためのものです。
集めるもの、載せるもの、組み立て方は、すべてこの考え方に従います。迷ったときは、載せません。

1. **楽しく、軽い気持ちで見られること。**
   リプライのやりとりを楽しみ、ニュースを気軽に見られることを一番に考えます。
2. **広告や宣伝に考えを動かされる心配がないこと。**
   広告・宣伝・案件・PR・スポンサー・購入や登録や応募の呼びかけは載せません（著名人本人の投稿でも同じです）。
3. **誹謗中傷をする場所ではないこと。**
   人を傷つける言葉、悪く言う言葉、言い争いをあおるものは載せません。政治家・政党・政府・メディアへの攻撃も載せません。
4. **誰が見ても嫌な思いをしないこと。**
   残酷なニュース、一人の人の名誉や私生活に関わること、お酒・タバコ（未成年も見るため）は載せません。
5. **偏らないこと。**
   一つのところから大量に送られたら一時的に止め、頼まれたアカウントも同じ決まりで選びます。

この考え方は、プログラムでは `filters.mjs`（何を載せないか）と `compose.mjs`（どう組み立てるか）に書いてあり、
集めるときとカードにする直前の二回、確かめます。ページ（news-shorts）も同じ確かめをもう一度します。

---

# What githito.xapi is for

githito.xapi builds **a place to enjoy replies and to watch the news lightly**. What it collects, what it shows and how it
writes its cards all follow this. When in doubt, it leaves a thing out.

1. **Light and enjoyable.** Enjoying people's replies and watching the news with ease comes first.
2. **No fear of being swayed by advertising.** No advertisements, promotions, sponsored posts, PR, or calls to buy,
   sign up or enter (well-known people's own posts included).
3. **Not a place for slander.** Nothing that hurts or runs people down, nothing that stirs up a quarrel, no attacks on
   politicians, parties, the government or the media.
4. **Nothing that upsets anyone.** No cruel news, nothing about one person's honour or private life, no alcohol or
   smoking (the young watch too).
5. **Even-handed.** One source sending a great deal is paused, and accounts readers ask for follow the same rules.

In the program this is `filters.mjs` (what is never shown) and `compose.mjs` (how cards are written), checked twice:
when collected and just before a card is stocked. The pages (news-shorts) check once more.
