/* githito.xapi: what is never published, whatever the pages' own switches say.

   Three lists, used by news.mjs (headlines and replies) and humor.mjs (the Reply News stories). The
   pages (news-shorts: src/never.js) hold the same lists and apply them again to what they read, so that
   a change holds at once and not only from the next run. Change the two together.

   CRUEL     cruel news: killing, bodies, torture, sexual violence, abuse, suicide, violence done to
             children. A headline that matches is not kept.
   PERSONAL  news that touches one person's honour or private life: an arrest, a suspect, a charge, a
             sentence; an allegation, an exposure, an affair, a scandal; a pile-on. The papers may report
             these; a page of short videos repeating them under a person's name can amount to defaming
             that person, so they are not kept.
   SLANDER   in what people themselves write (replies, the Reply News stories): insults, slurs, charges
             against a person, threats, and anything that points at where somebody lives or works.

   The words are Japanese because what is collected is Japanese. A word that is part of harmless ones is
   written with what must follow or must not (殺 alone would catch 殺到 and 殺菌; 切断 a cable). No
   lookbehind is used: the pages run on browsers that do not have it. */

export const CRUEL_WORDS = [
  /* killing and bodies */
  '殺害|殺人|強殺|殺傷|刺殺|射殺|銃殺|絞殺|撲殺|惨殺|虐殺|毒殺|爆殺|殺し(?!文句)|殺され|殺そう|殺した',
  '遺体|死体|変死|白骨|バラバラ(?:殺人|遺体|事件|にされ)|(?:遺体|手足|指|腕|脚|首|頭部)[^。]{0,6}切断|斬首|首を切|首を絞|拷問|処刑|死刑',
  '心中|自殺|自死|自傷|飛び降り|飛び込み自|首つり|首吊',
  '焼死|水死|溺死|圧死|餓死|衰弱死|凍死|窒息死|暴行死|傷害致死|過失致死|致死(?!率|量)|死なせ|死傷',
  '刺され[^。]{0,8}(?:死亡|重傷|重体|けが|ケガ|負傷|搬送)|(?:包丁|ナイフ|刃物|日本刀|カッター)[^。]{0,14}(?:刺|切|襲)|刺[^。]{0,10}(?:死亡|重傷|重体|殺|逮捕)|刺傷|切りつけ|斬りつけ|通り魔',
  '無差別(?:殺|に|テロ|襲撃|攻撃)|銃撃|銃乱射|乱射|発砲|自爆テロ|自爆攻撃|爆弾テロ|人質|監禁|誘拐|人身売買|臓器売買',
  /* sexual violence and abuse */
  'わいせつ|性的(?!少数|マイノリティ|指向)|性被害|性加害|性暴力|性犯罪|不同意|レイプ|強姦|強制性交|性交|買春|売春|淫行|児童ポルノ|盗撮|痴漢|下着泥棒|ストーカー',
  '虐待|暴行|ＤＶ|(?:^|[^A-Za-z])DV(?![A-Za-z])|体罰|リンチ|血まみれ|血だらけ|流血',
  /* violence that reached children */
  '(?:乳児|幼児|園児|児童|女児|男児|赤ちゃん|子ども|子供|小学生|中学生|高校生)[^。]{0,14}(?:死亡|死なせ|重体|放置|遺棄|置き去り|連れ去)',
  '(?:^|[^0-9０-９])(?:[0-9０-９]|1[0-7]|１[０-７])歳[^。]{0,14}(?:死亡|死なせ|重体|放置|遺棄|置き去り|連れ去)',
  /* attacks counted in deaths */
  '(?:空爆|砲撃|爆撃|攻撃|襲撃|銃撃|テロ|乱闘)[^。]{0,14}(?:死亡|死者|犠牲|死傷)',
];
export const PERSONAL_WORDS = [
  /* a person before the law */
  '容疑|被告|受刑者|死刑囚|逮捕|書類送検|送検|起訴|摘発|有罪|実刑|懲役|執行猶予|禁錮|罰金刑|前科|指名手配|出頭|自首|家宅捜索|強制捜査|任意同行|事情聴取|取り調べ',
  /* allegations, exposures, private life */
  '疑惑|告発|暴露|スキャンダル|不祥事|文春砲|週刊誌報道|不倫|浮気|二股|略奪愛|隠し子|密会|お泊まり|熱愛',
  'パワハラ|セクハラ|モラハラ|いじめ|懲戒|停職|免職|解任要求|辞任要求|更迭要求',
  '薬物|大麻|覚醒剤|覚せい剤|コカイン|合成麻薬|闇営業|反社|裏社会',
  /* pile-ons and remarks on a person */
  '炎上|批判殺到|バッシング|物議|誹謗|中傷|袋叩き|晒し|ネットリンチ|整形(?!外科)|激太り|激ヤセ|老けた|不仲|確執|黒歴史|嘘つき',
];
export const SLANDER_WORDS = [
  /* threats and wishing harm */
  '死ね|氏ね|しねよ|殺す|殺し(?!文句)|ころす|消えろ|失せろ|くたばれ|地獄に落ち|呪[うっ]',
  /* insults and slurs */
  'クズ|カス(?!タ|テ|ミ|ピ|ケ)|ゴミ(?!箱|出し|袋|拾い)|(?:^|[^ダ])クソ|くそ(?!う)|糞|ブス|デブ|ハゲ|ババア|ばばあ|ジジイ|じじい|老害|無能|低能|ガイジ|キチガイ|きちがい|精神病|メンヘラ|障害者|チョン|シナ人|土人|底辺|負け犬|陰キャ|不細工|キモ[いっすオ]?|きもい|気持ち悪|変態|ビッチ|売女|淫乱|ヤリマン|ヤリチン',
  /* charges against a person */
  '嘘つき|うそつき|詐欺師|犯罪者|前科|泥棒|盗人|パクリ|盗作|売名|ステマ|整形|枕営業|不倫して|浮気して|二股|虐待して|脱税|横領',
  /* pointing at a person */
  '晒[しすせそ]|特定(?:した|して|しま|班|完了)|住所|本名|実名|勤務先|職場に|学校名|電話番号|通報し|訴えて|訴える|開示請求|慰謝料',
  /* talk about running somebody down */
  '誹謗|中傷|悪口|陰口|アンチ(?!エイジ)|袋叩き|叩かれ|嫌われ|ハブられ|仲間はずれ|いじめ|虐め|無視され|ブロックされ',
];
/* Talk about alcohol (Reply News: a loving greeting is no place for drinking). 酒井, 酒田 are names. */
export const ALCOHOL = new RegExp('お酒|酒(?![井田々])|飲酒|禁酒|晩酌|泥酔|酔っ|酔い|酔う|酔え|二日酔|ほろ酔|ほろよい|呑[みむまん]|飲み会|飲みに|飲み過ぎ|飲みすぎ|飲んだくれ|宅飲み|家飲み|居酒屋|酒場|乾杯|カンパイ|かんぱい|ビール|ビアガーデン|ビアホール|ビアバー|ワイン|日本酒|焼酎|ハイボール|チューハイ|酎ハイ|サワー|カクテル|ウイスキー|ウィスキー|ウォッカ|テキーラ|シャンパン|梅酒|生中(?!継)|ストゼロ|アルコール|酒豪|ベロンベロン|🍺|🍻|🥂|🍷|🍸|🍹|🥃|🍶|\\b(?:beers?|wine|drunk|alcohol|whiske?y|vodka|tequila|cocktails?|hangover|tipsy|booze|sake)\\b', 'i');
/* (Car and sea sickness are no drinking.) */
export const alcohol = text => ALCOHOL.test(String(text || '').replace(/(?:車|船|乗り物)酔い/g, ''));
/* Talk about smoking, its words and its emoji (the pages are read by the young too). */
export const TOBACCO = new RegExp('タバコ|たばこ|煙草|喫煙|禁煙|分煙|加熱式|アイコス|IQOS|ベイプ|VAPE|ヤニ(?!ヤ)|一服|紫煙|吸い殻|吸殻|灰皿|葉巻|シガー|シーシャ|ニコチン|スモーカー|🚬|\\b(?:cigarettes?|cigars?|smok(?:e|es|ed|ing)|vap(?:e|es|ing)|nicotine|tobacco|juul)\\b', 'i');
export const tobacco = text => TOBACCO.test(String(text || ''));
/* News about alcohol or smoking is left out too, unless it is a company's news (アサヒビール's results, a
   new beer on sale, JT's price rise): the name of a maker, or the words of business. */
export const COMPANY = /アサヒ|キリン|サッポロ|サントリー|宝酒造|宝ホールディングス|白鶴|月桂冠|菊正宗|大関|黄桜|獺祭|旭酒造|オエノン|メルシャン|ニッカ|JT|日本たばこ|日本たばこ産業|フィリップ・?モリス|ブリティッシュ・?アメリカン・?タバコ|BAT|ハイネケン|ディアジオ|ペルノ|アンハイザー|バドワイザー|カールスバーグ|モルソン|コンステレーション|鳥貴族|ワタミ|串カツ田中|酒造|醸造|株式会社|ホールディングス|HD|グループ|社長|会長|CEO|決算|売上|業績|株価|株主|上場|買収|合併|提携|新商品|新製品|発売|値上げ|値下げ|出荷|工場|事業|市場|シェア|増益|減益|増収|減収|黒字|赤字|最高益|純利益|営業利益|輸出|販売|出店|閉店|店舗|メーカー|ブランド|企業/;
export const adultNews = text => (alcohol(text) || tobacco(text)) && !COMPANY.test(String(text || ''));
export const CRUEL = new RegExp(CRUEL_WORDS.join('|'));
export const PERSONAL = new RegExp(PERSONAL_WORDS.join('|'));
export const SLANDER = new RegExp(SLANDER_WORDS.join('|'));
/* Harmless sayings are taken out before the words are looked for (a nail driven home is a warning). */
const SAYINGS = /(?:くぎ|釘|クギ|とどめ|トドメ)を?刺|(?:蚊|ハチ|蜂|虫|クラゲ)に刺/g;
const plain = text => String(text || '').replace(SAYINGS, '');
/* The same in English (English news, english.mjs): killing and bodies, sexual violence and abuse, harm
   to children; a person before the law, allegations, private life. */
export const CRUEL_EN = /\b(?:kill(?:s|ed|ing|er|ers)?|murder(?:s|ed|er|ers)?|dead|death(?:s)?|died|dies|dying|bod(?:y|ies)|corpse|massacre|slaughter|behead\w*|tortur\w*|execut(?:e|ed|ion|ions)|suicid\w*|stab(?:s|bed|bing)?|shoot(?:s|ing|ings|er)?|shot|gunm(?:a|e)n|gunfire|bomb(?:s|ing|ings|ed)?|blast|rape[ds]?|raping|sexual(?:ly)? (?:assault|abuse)\w*|molest\w*|abus(?:e|ed|es|ing)|traffick\w*|kidnap\w*|hostage(?:s)?|genocide|war crime(?:s)?|casualt(?:y|ies)|wounded|injur(?:ed|ies|y))\b/i;
export const PERSONAL_EN = /\b(?:arrest(?:s|ed|ing)?|charged|charges|indict\w*|convict\w*|sentenc(?:e|ed|ing)|jail(?:s|ed)?|prison|suspect(?:s|ed)?|accus(?:e|ed|es|ation|ations)|alleg(?:e|ed|es|ation|ations)|scandal(?:s)?|affair|lawsuit|sued|sues|fraud|bribe\w*|harass\w*|probe|investigat\w*|drug(?:s)?|cocaine|cannabis|overdose)\b/i;
export const cruel = text => CRUEL.test(plain(text)) || CRUEL_EN.test(String(text || ''));
export const personal = text => PERSONAL.test(plain(text)) || PERSONAL_EN.test(String(text || ''));
export const slander = text => SLANDER.test(plain(text));
