# AI quality test through OpenRouter (Plan 10, Task 3)

Date: 2026-10-16. Production request (zero-retention routing: data_collection deny, zdr true). 3 runs per task; prices per 1M tokens from OpenRouter's catalogue.

## Results (runs ok, median and slowest time)

| model | A2 writing score (JSON) | AI lesson: depuis vs pendant (JSON, 3 practice items) | Persian explanation (plain text) | B1 check-in writing score (JSON) | Arabic explanation (plain text) | Tutor reply at A2 (plain text, French) | Speaking score from a transcript (JSON) |
|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 3/3 ok, median 2.5s, max 3.6s | 3/3 ok, median 3.4s, max 4.8s | 3/3 ok, median 2.1s, max 2.2s | 3/3 ok, median 2.6s, max 2.6s | 3/3 ok, median 2.1s, max 2.2s | 3/3 ok, median 1.7s, max 4.5s | 3/3 ok, median 3.2s, max 3.3s |
| anthropic/claude-haiku-5.5 | 3/3 ok, median 3.8s, max 4.4s | 3/3 ok, median 2.7s, max 3.1s | 3/3 ok, median 5s, max 5.1s | 3/3 ok, median 3.6s, max 4.1s | 3/3 ok, median 3.4s, max 4.2s | 3/3 ok, median 1.2s, max 1.4s | 3/3 ok, median 5.6s, max 8.1s |
| google/gemini-3.1-flash-lite | 3/3 ok, median 1.4s, max 1.6s | 3/3 ok, median 2s, max 2s | 3/3 ok, median 1.7s, max 1.7s | 3/3 ok, median 1.6s, max 1.7s | 3/3 ok, median 1.8s, max 1.9s | 3/3 ok, median 1.2s, max 1.3s | 3/3 ok, median 1.5s, max 1.7s |
| nvidia/nemotron-3-super-120b-a12b | 3/3 ok, median 8.2s, max 18.5s | 2/3 ok, median 76s, max 120s | 3/3 ok, median 4.8s, max 4.8s | 3/3 ok, median 8.4s, max 10.9s | 3/3 ok, median 12.3s, max 18.3s | 3/3 ok, median 15.3s, max 19.8s | 3/3 ok, median 41.1s, max 53.6s |
| google/gemma-4-31b-it | 3/3 ok, median 6.7s, max 7.1s | 3/3 ok, median 13.6s, max 16.3s | 3/3 ok, median 18s, max 22.6s | 3/3 ok, median 7.8s, max 11s | 3/3 ok, median 7.2s, max 8.3s | 3/3 ok, median 7.6s, max 8.8s | 3/3 ok, median 19.2s, max 22.4s |

## Errors

- nvidia/nemotron-3-super-120b-a12b, AI lesson: depuis vs pendant (JSON, 3 practice items), run 1: error empty

## COO recommendation and founder decision

**Recommendation: `openai/gpt-6-luna` for both "standard" and "fast"** ($0.10 in / $0.50 out per 1M tokens, the
cheapest with Haiku 5.5; about $17 a month per 100 active learners with OpenRouter's fee).

- **GPT-6 Luna:** 21 of 21 valid, 1.7 to 4.8 s. The most careful scorer: the A2 weekend message A2 (grammar 3,
  noting the tense slips), the B1 opinion B1, and the spoken transcript with its errors ("parce que il") **A2**,
  which matches the learner. Persian and Arabic explanations clear and correct, with translated examples. Tutor reply
  short and natural, one follow-up question.
- **Claude Haiku 5.5:** 21 of 21 valid, 1.2 to 8.1 s. The best teacher in the tutor reply (praises the correct
  passé composé, then asks a follow-up). Scored the same spoken transcript **B1** (one level high). Its Persian
  opening says both words mean the same thing before separating them (slightly confusing). A close second.
- **Gemini 3.1 Flash-Lite:** 21 of 21 valid and the fastest (1.2 to 2 s), but the most lenient: the B1 opinion got
  4/4/4/4 and the spoken transcript **B1**. For learners preparing for TEF/TCF, generous estimates are the riskier
  error. 2.5 times the price.
- **Nemotron 3 Super (today) and Gemma 4 31B:** 4 to 120 s; Nemotron returned nothing once. Not suitable.

Founder decision (2026-10-16, decision #59): **GPT-6 Luna** (`openrouter:openai/gpt-6-luna`) for both "standard" and "fast".

## Answers (first run, first 1,200 characters)

### openai/gpt-6-luna - A2 writing score (JSON)
2.5 s, valid

```
{"level":"A2","feedback":"You clearly recount your weekend, include relevant details, and ask your friend a question. Watch the past tense: use “j’ai travaillé” and “j’ai regardé” for Sunday.","rubric":{"task_completion":4,"grammar":3,"vocabulary":3,"coherence":4}}
```

### openai/gpt-6-luna - AI lesson: depuis vs pendant (JSON, 3 practice items)
4.8 s, valid

```
{"reply":"Use **depuis** for an action or situation that began in the past and is still continuing; it often goes with the present tense. Example: *J’habite ici depuis 2022.* (I have lived here since 2022.)\n\nUse **pendant** to say how long an action lasted, especially when it is finished. Example: *J’ai étudié pendant deux heures.* (I studied for two hours.)","practice_items":[{"question":"J’habite à Montréal ___ 2022.","options":["depuis","pendant","dans"],"answer_index":0,"explanation":"Use *depuis* because the speaker began living in Montréal in 2022 and still lives there."},{"question":"Nous avons étudié ___ deux heures hier soir.","options":["pendant","depuis","dans"],"answer_index":0,"explanation":"Use *pendant* because the two-hour study session happened and ended yesterday evening."},{"question":"Elle travaille ici ___ trois mois et elle y travaille encore.","options":["pendant","depuis","il y a"],"answer_index":1,"explanation":"Use *depuis* because she started working here three months ago and still works here."}]}
```

### openai/gpt-6-luna - Persian explanation (plain text)
2.1 s, text

```
«Depuis» یعنی «از ... تا حالا» و برای کاری به‌کار می‌رود که در گذشته شروع شده و هنوز ادامه دارد. معمولاً فعل در زمان حال است.

«Pendant» یعنی «به‌مدتِ ...» و مدتِ انجام یک کار را نشان می‌دهد؛ کار می‌تواند تمام شده باشد.

1. J’habite ici depuis deux ans.  
دو سال است که اینجا زندگی می‌کنم.

2. J’ai étudié pendant une heure.  
یک ساعت درس خواندم.
```

### openai/gpt-6-luna - B1 check-in writing score (JSON)
1.8 s, valid

```
{"level":"B1","feedback":"You clearly express and support your opinion, with relevant advantages, disadvantages, and a personal example. Grammar and vocabulary are accurate but mostly straightforward; try using more varied expressions and sentence structures.","rubric":{"task_completion":4,"grammar":3.5,"vocabulary":3,"coherence":4}}
```

### openai/gpt-6-luna - Arabic explanation (plain text)
2.2 s, text

```
**depuis** تعني «منذ»، وتُستعمل لحدث بدأ في الماضي وما زال مستمرًا الآن. غالبًا نستخدم معها زمن الحاضر.

- J’habite ici depuis deux ans. — أسكن هنا منذ سنتين.
- Il travaille depuis lundi. — هو يعمل منذ يوم الاثنين.

**pendant** تعني «لمدة» أو «خلال»، وتُحدد مدة حدث انتهى أو نتحدث عنه كفترة زمنية.

- J’ai étudié pendant une heure. — درستُ لمدة ساعة.
- Nous sommes partis pendant les vacances. — سافرنا خلال العطلة.
```

### openai/gpt-6-luna - Tutor reply at A2 (plain text, French)
1.7 s, text

```
Ça a l’air amusant ! Quel était le titre du film ?
```

### openai/gpt-6-luna - Speaking score from a transcript (JSON)
3.1 s, valid

```
{"is_french":true,"criteria":{"task_completion":3,"vocabulary":2,"grammar":3,"coherence_fluency":3},"level":"A2","corrections":[{"said":"parce que il","better":"parce qu'il","reason":"Use the required contraction before a vowel sound."}],"tip":"Add one more detail about what you enjoyed or did after the café to make your account fuller."}
```

### anthropic/claude-haiku-5.5 - A2 writing score (JSON)
4.4 s, valid

```
{"level":"A2","feedback":"The message fully completes the task with a clear weekend narrative and a question to the friend. Grammar is mostly accurate, but the tense shifts from past to present in the garden sentence ('je travaille' should be 'j'ai travaillé'), and vocabulary is basic but adequate.","rubric":{"task_completion":4,"grammar":2,"vocabulary":3,"coherence":3}}
```

### anthropic/claude-haiku-5.5 - AI lesson: depuis vs pendant (JSON, 3 practice items)
2.7 s, valid

```
{"reply":"Use 'depuis' when an action or state started in the past and is still continuing in the present, usually with the present tense: \"J'habite à Montréal depuis deux ans\" (I have lived in Montreal for two years, and still do). Use 'pendant' when the duration is complete or viewed as finished, often with the passé composé: \"J'ai habité à Paris pendant deux ans\" (I lived in Paris for two years, and I no longer do). Quick test: if the situation is still ongoing, choose 'depuis'; if it has ended, choose 'pendant'.","practice_items":[{"question":"Je travaille dans cette entreprise ___ trois ans, et je compte y rester.","options":["depuis","pendant","il y a"],"answer_index":0,"explanation":"The work is ongoing in the present, so 'depuis' is needed to express a duration that continues up to now."},{"question":"Nous avons vécu à Lyon ___ cinq ans avant de déménager à Toronto.","options":["depuis","pendant","dans"],"answer_index":1,"explanation":"The stay in Lyon is finished (they moved away), so 'pendant' correctly describes a completed duration."},{"question":"Il pleut ___ ce matin, et il ne s'est pas arrêté.","options":["pendant","depuis","pour"],"answer_index":1,"explanation":
```

### anthropic/claude-haiku-5.5 - Persian explanation (plain text)
5 s, text

```
**depuis** و **pendant** هر دو به معنای «برای / از ... تا حالا» یا «مدت» هستند، اما کاربرد متفاوتی دارند:

- **depuis** برای کاری به کار می‌رود که **هنوز ادامه دارد** و تا لحظه‌ی حال امتداد پیدا کرده است. معمولاً با فعل حال کامل یا حال ساده می‌آید.
- **pendant** برای **مدت زمانی** به کار می‌رود که ممکن است **تمام شده** باشد یا به آینده مربوط باشد.

**مثال‌ها:**

1. J'habite à Paris depuis deux ans.
ترجمه: من دو سال است که در پاریس زندگی می‌کنم. (هنوز هم زندگی می‌کنم)

2. J'ai habité à Lyon pendant deux ans.
ترجمه: من دو سال در لیون زندگی کردم. (دیگر آنجا زندگی نمی‌کنم)
```

### anthropic/claude-haiku-5.5 - B1 check-in writing score (JSON)
3 s, valid

```
{"level":"B1","feedback":"The response meets the word count, gives a clear opinion, and organizes advantages, disadvantages, and a personal example with good connectors. Grammar and vocabulary are mostly accurate and varied, with only minor awkwardness such as \"se reposer plus\", which keeps it at B1 rather than B2.","rubric":{"task_completion":4,"grammar":3,"vocabulary":3,"coherence":4}}
```

### anthropic/claude-haiku-5.5 - Arabic explanation (plain text)
3.2 s, text

```
**depuis** و **pendant** كلاهما يعني "منذ" أو "لمدة"، لكن استعمالهما مختلف:

**depuis**: تستعمله للحدث الذي بدأ في الماضي ومازال مستمرًا إلى الآن. وغالبًا ما يأتي مع الفعل في المضارع.
مثال: J'habite à Paris depuis deux ans.
الترجمة: أسكن في باريس منذ سنتين. (وما زلت أسكن فيها)

**pendant**: تستعمله لمدة حدث انتهى، أو لمدة محددة في الماضي أو المستقبل.
مثال: J'ai habité à Londres pendant deux ans.
الترجمة: سكنت في لندن لمدة سنتين. (وقد انتهت الإقامة)

**تذكّر**: إذا كان الحدث ما زال مستمرًا، استعمل depuis. وإذا انتهى أو كانت المدة محددة، استعمل pendant.
```

### anthropic/claude-haiku-5.5 - Tutor reply at A2 (plain text, French)
1.4 s, text

```
Très bien ! Tu as bien utilisé le passé composé avec « être » pour « je suis allé », et « avoir » pour « nous avons vu ». Qu'est-ce que vous avez mangé ou fait après le film ?
```

### anthropic/claude-haiku-5.5 - Speaking score from a transcript (JSON)
5.6 s, valid

```
{"is_french":true,"criteria":{"task_completion":3,"vocabulary":2,"grammar":2,"coherence_fluency":3},"level":"B1","corrections":[{"said":"parce que il faisait très beau","better":"parce qu'il faisait très beau","reason":"Use the elision qu' before il (parce qu'il)."}],"tip":"Add one or two more details, such as how you felt or what you thought of the day, to go beyond the basic sequence. Also vary your connectors with ensuite, puis, or finalement instead of relying mainly on après."}
```

### google/gemini-3.1-flash-lite - A2 writing score (JSON)
1.6 s, valid

```
{
  "level": "A2",
  "feedback": "The message successfully covers all required points with good vocabulary and flow. There is a minor tense inconsistency when switching between past and present, but the meaning remains clear.",
  "rubric": {
    "task_completion": 4,
    "grammar": 3,
    "vocabulary": 4,
    "coherence": 4
  }
}
```

### google/gemini-3.1-flash-lite - AI lesson: depuis vs pendant (JSON, 3 practice items)
2 s, valid

```
{
  "reply": "Use 'depuis' for actions that started in the past and are still continuing now (e.g., 'J'habite ici depuis deux ans' - I have lived here for two years). Use 'pendant' for actions that happened for a specific duration in the past or future and are now finished (e.g., 'J'ai étudié pendant deux heures' - I studied for two hours). Think of 'depuis' as 'since/for (still happening)' and 'pendant' as 'for (completed duration)'.",
  "practice_items": [
    {
      "question": "Je travaille dans cette entreprise ________ trois ans.",
      "options": [
        "pendant",
        "depuis",
        "pour"
      ],
      "answer_index": 1,
      "explanation": "Since the action of working is still ongoing, 'depuis' is the correct preposition."
    },
    {
      "question": "Il a regardé la télévision ________ deux heures hier soir.",
      "options": [
        "depuis",
        "pendant",
        "il y a"
      ],
      "answer_index": 1,
      "explanation": "The action is completed in the past, so 'pendant' is used to describe the duration."
    },
    {
      "question": "Nous habitons à Montréal ________ 2015.",
      "options": [
        "pendant",
        "depuis",
       
```

### google/gemini-3.1-flash-lite - Persian explanation (plain text)
1.7 s, text

```
سلام! به عنوان معلم فرانسه‌ی تو، تفاوت این دو کلمه را ساده توضیح می‌دهم:

۱. **Depuis (از وقتی که / به مدت):** برای کاری استفاده می‌شود که در گذشته شروع شده و هنوز در زمان حال ادامه دارد.
مثال:
J'habite à Paris depuis deux ans.
(من دو سال است که در پاریس زندگی می‌کنم - و هنوز هم آنجا هستم.)

۲. **Pendant (به مدت / در طول):** برای کاری استفاده می‌شود که در یک بازه زمانی مشخص در گذشته یا آینده انجام شده و تمام شده است.
مثال:
J'ai travaillé à Paris pendant deux ans.
(من به مدت دو سال در پاریس کار کردم - کارم تمام شده است.)

خلاصه: اگر کار هنوز ادامه دارد از **depuis**، و اگر تمام شده از **pendant** استفاده کن. موفق باشی!
```

### google/gemini-3.1-flash-lite - B1 check-in writing score (JSON)
1.6 s, valid

```
{
  "level": "B1",
  "feedback": "The response effectively addresses the prompt with clear arguments and a balanced perspective. The grammar and vocabulary are accurate and appropriate for the B1 level.",
  "rubric": {
    "task_completion": 4,
    "grammar": 4,
    "vocabulary": 4,
    "coherence": 4
  }
}
```

### google/gemini-3.1-flash-lite - Arabic explanation (plain text)
1.9 s, text

```
أهلاً بك يا صديقي. بصفتي معلمك للغة الفرنسية، سأشرح لك الفرق بين depuis و pendant ببساطة:

نستخدم depuis عندما يبدأ الفعل في الماضي وما زال مستمراً حتى الآن. (بمعنى: منذ).

مثال:
J'habite ici depuis deux ans.
(أنا أسكن هنا منذ سنتين - وما زلت أسكن هنا).

أما pendant فنستخدمها للتعبير عن مدة زمنية محددة بدأت وانتهت في الماضي، أو ستنتهي في المستقبل. (بمعنى: لمدة).

مثال:
J'ai travaillé pendant deux heures.
(لقد عملت لمدة ساعتين - وانتهى العمل).

باختصار:
- depuis: الفعل مستمر حتى الآن.
- pendant: الفعل له بداية ونهاية محددة.

أتمنى أن يكون الشرح واضحاً!
```

### google/gemini-3.1-flash-lite - Tutor reply at A2 (plain text, French)
1.2 s, text

```
C'est super ! J'adore aller au cinéma. Quel était le titre du film que vous avez regardé ?
```

### google/gemini-3.1-flash-lite - Speaking score from a transcript (JSON)
1.4 s, valid

```
{
  "is_french": true,
  "criteria": {
    "task_completion": 4,
    "vocabulary": 3,
    "grammar": 3,
    "coherence_fluency": 3
  },
  "level": "B1",
  "corrections": [
    {
      "said": "parce que il",
      "better": "parce qu'il",
      "reason": "Elision is required before a vowel sound."
    }
  ],
  "tip": "Your sentence structure is good, but try to use more varied connectors like 'ensuite' or 'finalement' instead of repeating 'après' or simple commas to link your ideas."
}
```

### nvidia/nemotron-3-super-120b-a12b - A2 writing score (JSON)
7.4 s, valid

```
{
  "level": "A2",
  "feedback": "You successfully described your weekend activities and followed the task requirements. Watch your verb tenses to keep the narration in the past.",
  "rubric": {
    "task_completion": 4,
    "grammar": 2,
    "vocabulary": 3,
    "coherence": 3
  }
}
```

### nvidia/nemotron-3-super-120b-a12b - AI lesson: depuis vs pendant (JSON, 3 practice items)
120 s, error empty

```

```

### nvidia/nemotron-3-super-120b-a12b - Persian explanation (plain text)
4.8 s, text

```
**تفاوت «depuis» و «pendant»**

- **depuis** → «از… تا به حال» یا «برای»؛ نقطه‌ای در گذشته را نشان می‌دهد که تا حالا ادامه دارد و معمولاً با زمان حال استفاده می‌شود.  
- **pendant** → «در طول»؛ یک مدت زمان مشخص را در گذشته، حال یا آینده توصیف می‌کند و fokus بر روی طول دوره است، نه نقطه شروع.

**مثال‌ها**

1. *Je travaille ici **depuis** trois mois.*  
   من از سه ماه پیش اینجا کار می‌کنم. (شروع کار در گذشته و تا به حال ادامه دارد.)

2. *Il a plu **pendant** deux heures.*  
   باران دو ساعت طول کشید. (مدت باران را در یک دوره گذشته مشخص می‌کنیم.)
```

### nvidia/nemotron-3-super-120b-a12b - B1 check-in writing score (JSON)
8.4 s, valid

```
{"level":"B1","feedback":"Your opinion is well-developed and addresses all parts of the task with clear organization. Minor improvements in vocabulary variety and grammatical precision would raise your level.","rubric":{"task_completion":4,"grammar":4,"vocabulary":3,"coherence":4}}
```

### nvidia/nemotron-3-super-120b-a12b - Arabic explanation (plain text)
18.3 s, text

```
**الفرق بين «depuis» و «pendant»**  

- **depuis** تُستخدم للحديث عن شيء بدأ في الماضي ويستمر حتى الآن (أو حتى لحظة معينة في الماضي). تُترجم غالبًا إلى «منذ» أو «من وقت».  
- **pendant** تُستخدم لتحديد مدة زمنية محددة في الماضي أو المستقبل، أي «خلال» أو «طوال» فترة معينة، ولا تعني الاستمرار إلى الآن.  

**أمثلة:**  

1. *J’habite à Paris **depuis** deux ans.*  
   → أنا أعيش في باريس **منذ** سنتين.  

2. *Il a étudié le français **pendant** trois mois.*  
   → درس الفرنسية **خلال** ثلاثة أشهر.  

ملاحظة: مع «depuis» نستخدم غالبًا الفعل في المضارع (أو passé composé إذا parlait عن نقطة بداية في الماضي)، بينما مع «pendant» نستخدم الفعل في الماضي أو المستقبل حسب السياق.
```

### nvidia/nemotron-3-super-120b-a12b - Tutor reply at A2 (plain text, French)
19.8 s, text

```
C’est génial que tu sois allé au cinéma hier ! Quel film avez‑vous vu ?
```

### nvidia/nemotron-3-super-120b-a12b - Speaking score from a transcript (JSON)
41.1 s, valid

```
{
  "is_french": true,
  "criteria": {
    "task_completion": 3,
    "vocabulary": 2,
    "grammar": 2,
    "coherence_fluency": 3
  },
  "level": "A2",
  "corrections": [
    {
      "said": "parce que il faisait très beau",
      "better": "parce qu'il faisait très beau",
      "reason": "Elision required before vowel: 'que' + 'il' becomes 'qu'il'."
    },
    {
      "said": "après nous avons pris",
      "better": "ensuite nous avons pris",
      "reason": "Use a clearer linking word or add a comma after 'après' for proper sequencing."
    },
    {
      "said": "Le week-end dernier je suis allé",
      "better": "Le week-end dernier, je suis allé",
      "reason": "Introductory temporal phrase should be followed by a comma."
    }
  ],
  "tip": "Next time, try to include a bit more detail about what you did and how you felt, and vary your sentence structures with different past tenses or linking words."
}
```

### google/gemma-4-31b-it - A2 writing score (JSON)
6.3 s, valid

```
{"level":"A2","feedback":"The learner successfully communicates their weekend activities with appropriate vocabulary. There is a minor inconsistency in verb tenses when describing Sunday.","rubric":{"task_completion":4,"grammar":3,"vocabulary":4,"coherence":4}}
```

### google/gemma-4-31b-it - AI lesson: depuis vs pendant (JSON, 3 practice items)
16.3 s, valid

```
{
  "reply": "Use 'depuis' for an action that started in the past and is still continuing in the present (usually paired with the present tense). Example: 'J'habite ici depuis deux ans.' Use 'pendant' to describe a completed duration of time or a specific period. Example: 'J'ai dormi pendant huit heures.' In short: 'depuis' implies the action is still happening, while 'pendant' focuses on the total length of time.",
  "practice_items": [
    {
      "question": "Je travaille à Montréal ___ trois ans.",
      "options": [
        "depuis",
        "pendant",
        "pour"
      ],
      "answer_index": 0,
      "explanation": "The action of working is still ongoing in the present."
    },
    {
      "question": "Il a plu ___ toute la nuit.",
      "options": [
        "depuis",
        "pendant",
        "pour"
      ],
      "answer_index": 1,
      "explanation": "The rain occurred for a specific, completed duration of time."
    },
    {
      "question": "Nous attendons le bus ___ vingt minutes.",
      "options": [
        "pendant",
        "depuis",
        "pour"
      ],
      "answer_index": 1,
      "explanation": "The act of waiting started in the past and continues no
```

### google/gemma-4-31b-it - Persian explanation (plain text)
16.4 s, text

```
تفاوت depuis و pendant:

۱. **Depuis**: برای کاری استفاده می‌شود که در گذشته شروع شده و **هنوز ادامه دارد**. (معادل «از» یا «از وقتی که»)
مثال: .J'habite ici depuis deux ans
(من از دو سال پیش اینجا زندگی می‌کنم - و هنوز هم هستم).

۲. **Pendant**: برای بیان **مدت زمان** یک فعالیت به کار می‌رود، فارغ از اینکه آن کار هنوز ادامه دارد یا تمام شده است. (معادل «به مدت» یا «در طول»)
مثال: .J'ai dormi pendant huit heures
(من به مدت هشت ساعت خوابیدم).

به زبان ساده: اگر عمل هنوز در حال انجام است از depuis و اگر فقط می‌خواهید طول زمان را بگویید از pendant استفاده کنید.
```

### google/gemma-4-31b-it - B1 check-in writing score (JSON)
7.8 s, valid

```
{"level":"B1","feedback":"The text is well-structured and grammatically accurate. It effectively addresses the prompt with clear arguments and a personal perspective.","rubric":{"task_completion":4,"grammar":4,"vocabulary":3,"coherence":4}}
```

### google/gemma-4-31b-it - Arabic explanation (plain text)
7.2 s, text

```
الفرق بين "depuis" و "pendant":

1. **Depuis**: تُستخدم للتعبير عن حدث بدأ في الماضي وما زال مستمراً حتى اللحظة. (بمعنى: منذ).
مثال: J'habite ici depuis deux ans.
(أعيش هنا منذ سنتين - وما زلت أعيش هنا).

2. **Pendant**: تُستخدم للتعبير عن مدة زمنية محددة، وغالباً ما يكون الحدث قد انتهى. (بمعنى: لمدة/خلال).
مثال: J'ai dormi pendant huit heures.
(نمت لمدة ثماني ساعات - الحدث انتهى).

باختصار: "depuis" للاستمرارية، و "pendant" للمدة الزمنية المحددة.
```

### google/gemma-4-31b-it - Tutor reply at A2 (plain text, French)
6.9 s, text

```
C'est super ! J'adore les films drôles. Quel était le titre du film ?
```

### google/gemma-4-31b-it - Speaking score from a transcript (JSON)
22.4 s, valid

```
{
  "is_french": true,
  "criteria": {
    "task_completion": 3,
    "vocabulary": 2,
    "grammar": 3,
    "coherence_fluency": 3
  },
  "level": "A2",
  "corrections": [
    {
      "said": "parce que il",
      "better": "parce qu'il",
      "reason": "Elision is required when 'que' is followed by a word starting with a vowel."
    }
  ],
  "tip": "Try to expand your descriptions by adding more adjectives or explaining how you felt about the activities to increase your vocabulary range."
}
```
