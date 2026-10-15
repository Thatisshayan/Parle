# AI model bake-off (backend Plan 3, Task 15)

Date: 2026-10-15. Same four prompts per model; JSON prompts use the app's schema instruction. Missing from the catalog: none.

## Results (time, outcome)

| model | A2 writing score (JSON) | AI lesson: depuis vs pendant (JSON, 3 practice items) | Persian explanation (plain text) | B1 check-in writing score (JSON) |
|---|---|---|---|---|
| moonshotai/kimi-k3 | 69.3s, valid | 91.2s, valid | 147.6s, text | 70.9s, valid |
| z-ai/glm-5.3 | 84.7s, valid | 65.5s, valid | 28.3s, text | 33.9s, valid |
| google/gemma-4-31b-it | 59s, valid | 29s, valid | 12.8s, text | 95.7s, valid |
| deepseek-ai/deepseek-v4.1-flash | 240s, error (TimeoutError) | 240s, error (TimeoutError) | 240s, error (TimeoutError) | 240s, error (TimeoutError) |
| nvidia/nemotron-3-super-120b-a12b | 240s, error (TimeoutError) | 115s, invalid (not JSON) | 5.9s, text | 17s, valid |

## COO recommendation and founder decision (#49)

- All three working models (Kimi K3, GLM 5.3, Gemma 4) returned valid JSON on every structured prompt and gave the
  same A2 rubric (4/3/3/4); quality differences are small. GLM's feedback is the most precise (names the exact tense
  error); GLM and Gemma both wrote natural Persian with correct examples (Plan 1 found Nemotron's Persian poor).
- DeepSeek V4.1 Flash timed out on all four prompts (240 s); Nemotron 3 Super timed out once and once returned non-JSON.
- Speed today was 2-3x slower than in Plan 1 (free NVIDIA endpoint load), so no model is fast enough to build a plan
  while the learner waits: a first plan with Kimi passed the 150 s function limit in the live check.
- **Founder decision (2026-10-15):** Gemma 4 for background ("fast") work, GLM 5.3 for the tutor and writing scores
  ("standard"); background calls are limited to 20 s and a plan build to 90 s of AI, after which practice comes from
  the approved bank. Stored by migration `20261016000014_ai_models.sql`.
- **Revised the same day after the live check:** with GLM 5.3 the AI tutor could not open a session within 120 s
  (NVIDIA free tier: even a one-sentence reply took 18 s on GLM, 11 s on Gemma, 90 s on Kimi). With Gemma the tutor
  opened in 16 s and replied in 30 s with a correct depuis/pendant correction. **Gemma 4 for everything**
  (migration `20261016000015_ai_model_standard_gemma.sql`).
- For production (Plan 4): measure again; a paid NVIDIA tier or a second provider may be needed for chat speed.

## Answers (first 1,200 characters)

### moonshotai/kimi-k3 - A2 writing score (JSON)
69.3 s, valid

```
{"level":"A2","feedback":"The message fully answers the task with a clear weekend narrative and friendly tone. Main weakness is inconsistent past-tense use on Sunday (“je travaille/je regarde”), though vocabulary and organization are solid for A2.","rubric":{"task_completion":4,"grammar":3,"vocabulary":3,"coherence":4}}
```

### moonshotai/kimi-k3 - AI lesson: depuis vs pendant (JSON, 3 practice items)
91.2 s, valid

```
{"reply":"Use **depuis** for something that started in the past and is still true now: “since/for” with a continuing situation. Example: **J’habite à Toronto depuis 2022.** Use **pendant** for a closed, bounded period “during/for,” often completed in the past or set in the future. Example: **J’ai travaillé pendant six mois.** Quick TEF cue: **depuis** connects past to present; **pendant** measures a finished or defined block of time.","practice_items":[{"question":"Je vis au Canada ___ 2021.","options":["depuis","pendant","il y a"],"answer_index":0,"explanation":"The situation continues now, so French uses “depuis” with a starting point."},{"question":"Elle a étudié ___ trois heures hier soir.","options":["depuis","pendant","depuis que"],"answer_index":1,"explanation":"The three-hour period is finished and bounded, so “pendant” is correct."},{"question":"Il pleut ___ ce matin.","options":["depuis","pendant","pour"],"answer_index":0,"explanation":"The rain started this morning and continues now, so use “depuis.”"}]}
```

### moonshotai/kimi-k3 - Persian explanation (plain text)
147.6 s, text

```
تفاوت «depuis» و «pendant» در فرانسه:

**depuis** یعنی «از... تا الان» — کاری که در گذشته شروع شده و هنوز ادامه دارد. معمولاً با زمان حال (présent) می‌آید.

مثال:
J'habite à Paris depuis 2020.
(از سال ۲۰۲۰ در پاریس زندگی می‌کنم — و هنوز هم آنجا هستم.)

**pendant** یعنی «در طول / به مدت» — مدت زمانی مشخص که شروع و پایان دارد. می‌تواند درباره گذشته یا آینده باشد.

مثال:
J'ai étudié pendant deux heures.
(به مدت دو ساعت درس خواندم — کار تمام شده است.)

نکته کلیدی: اگر کار هنوز ادامه دارد، از **depuis** استفاده کنید؛ اگر فقط مدت زمان مشخصی را می‌گویید (تمام‌شده یا برنامه‌ریزی‌شده)، از **pendant** استفاده کنید.
```

### moonshotai/kimi-k3 - B1 check-in writing score (JSON)
70.9 s, valid

```
{"level":"B1","feedback":"Clear, well-organized opinion that fully answers the prompt within the word range. Grammar and vocabulary are generally accurate with good connectors, though complexity remains mostly B1 rather than consistently B2.","rubric":{"task_completion":4,"grammar":3,"vocabulary":3,"coherence":4}}
```

### z-ai/glm-5.3 - A2 writing score (JSON)
84.7 s, valid

```
{"level":"A2","feedback":"A clear, well-structured message with accurate passé composé, appropriate greetings, and relevant everyday vocabulary. Watch tense consistency: Sunday's activities should be past tense (\"j'ai travaillé... j'ai regardé\").","rubric":{"task_completion":4,"grammar":3,"vocabulary":3,"coherence":4}}
```

### z-ai/glm-5.3 - AI lesson: depuis vs pendant (JSON, 3 practice items)
65.5 s, valid

```
{"reply":"Use depuis for an action that started in the past and continues now — in French it takes the present tense. Example: J'habite à Montréal depuis trois ans. (I've lived in Montreal for three years — and still do.) Use pendant for a completed duration — the action is over. Example: J'ai étudié le français pendant six mois. (I studied French for six months — finished.) TEF tip: still happening → depuis; finished or a fixed period → pendant.","practice_items":[{"question":"Je vis à Québec ___ 2021.","options":["pendant","depuis","il y a"],"answer_index":1,"explanation":"The action began in 2021 and continues now, so depuis is correct."},{"question":"Elle a travaillé à l'hôpital ___ dix ans.","options":["depuis","pendant","il y a"],"answer_index":1,"explanation":"The action is finished (passé composé), so pendant marks the completed duration."},{"question":"Nous attendons le bus ___ une heure.","options":["pendant","il y a","depuis"],"answer_index":2,"explanation":"They are still waiting, so depuis expresses the ongoing duration."}]}
```

### z-ai/glm-5.3 - Persian explanation (plain text)
28.3 s, text

```
تفاوت «depuis» و «pendant»:

«depuis» برای کاری است که در گذشته شروع شده و هنوز ادامه دارد؛ یعنی «از آن موقع تا حالا». در فرانسه با فعل حال می‌آید.

«pendant» برای مدتی است که کار تمام شده؛ یعنی «به مدتِ» یا «در طولِ». معمولاً با فعل گذشته می‌آید.

مثال‌ها:

۱. J'habite à Paris depuis trois ans.
سه سال است که در پاریس زندگی می‌کنم. (هنوز آنجا زندگی می‌کنم)

۲. J'ai habité à Paris pendant trois ans.
سه سال در پاریس زندگی کردم. (کار تمام شده، دیگر آنجا نیستم)

نکته مهم: در فارسی هر دو جمله شبیه هم به نظر می‌رسند، اما در فرانسه زمان فعل فرق دارد: با «depuis» فعل حال می‌آید، ولی با «pendant» فعل گذشته.
```

### z-ai/glm-5.3 - B1 check-in writing score (JSON)
33.9 s, valid

```
{"level":"B1","feedback":"A well-organised, balanced response that fully addresses the task, with accurate grammar, clear connectors, and a relevant personal example. Vocabulary and structures are solid B1; greater syntactic variety (e.g., subjunctive, more nuanced concession) would be needed to reach B2.","rubric":{"task_completion":4,"grammar":4,"vocabulary":3.5,"coherence":4}}
```

### google/gemma-4-31b-it - A2 writing score (JSON)
59 s, valid

```
{"level":"A2","feedback":"The learner successfully completed the task with clear communication. There is a minor tense inconsistency on Sunday, but overall the structure is appropriate for the level.","rubric":{"task_completion":4,"grammar":3,"vocabulary":3,"coherence":4}}
```

### google/gemma-4-31b-it - AI lesson: depuis vs pendant (JSON, 3 practice items)
29 s, valid

```
{"reply":"Use 'depuis' (since/for) for an action that started in the past and is still continuing in the present. Example: 'J'habite à Montréal depuis deux ans' (I have lived in Montreal for two years). Use 'pendant' (during/for) for a completed action with a specific duration, regardless of when it happened. Example: 'J'ai étudié le français pendant trois heures' (I studied French for three hours).","practice_items":[{"question":"Je travaille ici _______ six mois.","options":["pendant","depuis","en"],"answer_index":1,"explanation":"The action is still ongoing, so 'depuis' is required."},{"question":"Il a dormi _______ dix heures.","options":["depuis","pendant","pour"],"answer_index":1,"explanation":"The sleeping duration is a completed period of time."},{"question":"Nous sommes mariés _______ 2010.","options":["pendant","depuis","durant"],"answer_index":1,"explanation":"'Depuis' is used with a specific starting point in the past for an ongoing state."}]}
```

### google/gemma-4-31b-it - Persian explanation (plain text)
12.8 s, text

```
سلام! برای درک تفاوت این دو کلمه به این نکته دقت کنید:

**Depuis** برای کاری است که در گذشته شروع شده و **هنوز ادامه دارد**. (معادل «از» یا «مدتِ... است که»)
**Pendant** برای بازه زمانی مشخصی است که **تمام شده** یا به طور کلی تکرار می‌شود. (معادل «به مدتِ»)

مثال‌ها:

1. Je parle français **depuis** deux ans.
من **از** دو سال پیش (تا الان) فرانسوی صحبت می‌کنم.

2. J'ai dormi **pendant** huit heures.
من **به مدتِ** هشت ساعت خوابیدم. (اکنون بیدار هستم و خواب تمام شده است).
```

### google/gemma-4-31b-it - B1 check-in writing score (JSON)
95.7 s, valid

```
```json
{
  "level": "B1",
  "feedback": "The learner successfully addresses the prompt with a clear, balanced argument. The grammar and structure are accurate and appropriate for the B1 level.",
  "rubric": {
    "task_completion": 4,
    "grammar": 4,
    "vocabulary": 3,
    "coherence": 4
  }
}
```
```

### deepseek-ai/deepseek-v4.1-flash - A2 writing score (JSON)
240 s, error (TimeoutError)

```

```

### deepseek-ai/deepseek-v4.1-flash - AI lesson: depuis vs pendant (JSON, 3 practice items)
240 s, error (TimeoutError)

```

```

### deepseek-ai/deepseek-v4.1-flash - Persian explanation (plain text)
240 s, error (TimeoutError)

```

```

### deepseek-ai/deepseek-v4.1-flash - B1 check-in writing score (JSON)
240 s, error (TimeoutError)

```

```

### nvidia/nemotron-3-super-120b-a12b - A2 writing score (JSON)
240 s, error (TimeoutError)

```

```

### nvidia/nemotron-3-super-120b-a12b - AI lesson: depuis vs pendant (JSON, 3 practice items)
115 s, invalid (not JSON)

```
{
  "reply": "Depuis marks a point in time when something started and continues up to now (or up to a past reference). It is used with present or imperfect to show duration from that start. Example: J'apprends le français depuis deux ans. Pendant expresses a length of time during which an action took place, usually completed. It works with past tenses. Example: J'ai étudié le français pendant trois mois.",
  "practice_items": [
    {
      "question": "Depuis quand apprends-tu le français ?",
      "options": [
        "Depuis deux ans.",
        "Pendant deux ans.",
        "Il y a deux ans."
      ],
      "answer_index": 0,
      "explanation": \"Depuis\" indicates a starting point that continues to the present.
    },
    {
      "question": "J'ai habité à Paris _____ trois mois.",
      "options": [
        "depuis",
        "pendant",
        "il y a"
      ],
      "answer_index": 1,
      "explanation": \"Pendant\" expresses a completed duration of time.
    },
    {
      "question": "Il pleut _____ ce matin.",
      "options": [
        "depuis",
        "pendant",
        "il y a"
      ],
      "answer_index": 0,
      "explanation": \"Depuis\" is used for weather that 
```

### nvidia/nemotron-3-super-120b-a12b - Persian explanation (plain text)
5.9 s, text

```
«Depuis» نشان‌دهنده یک زمان شروع در گذشته است که تا حالا (یا تا یک زمان مشخص در گذشته) ادامه دارد؛ به عبارت دیگر، «از … تا …».  
«Pendant» یک مدت زمان مشخص را در گذشته، حال یا آینده توصیف می‌کند و معادل «در طول …» است.

مثال 1:  
Depuis deux ans, j’étudie le français.  
(از دو سال پیش، فرانسوی را مطالعه می‌کنم.)

مثال 2:  
Pendant les vacances, nous avons visité Paris.  
(در طول تعطیلات، پاریس را بازدید کردیم.)
```

### nvidia/nemotron-3-super-120b-a12b - B1 check-in writing score (JSON)
17 s, valid

```
{
  "level": "B1",
  "feedback": "The response fully addresses the task with clear advantages and disadvantages, and stays within the word limit. Grammar and vocabulary are accurate and varied, showing good coherence.",
  "rubric": {
    "task_completion": 4,
    "grammar": 4,
    "vocabulary": 4,
    "coherence": 4
  }
}
```
