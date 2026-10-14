# NVIDIA API spike (2026-10-14)

## Assessment (COO agent)

Access works: the key sees 80 models; the key never appears in this report. Rate-limit headers are not returned
(`n/a`), so limits and pricing must be read from the founder's NVIDIA account page (ask the founder in Plan 3).
The catalog is newer than the plan assumed (no Llama 3.3 / Qwen 2.5; newest are Kimi K3, DeepSeek V4.1, Nemotron 3,
GLM 5.3, Gemma 4), so the candidate list was updated (Task 5 ruling).

| model | speed | A2 correction | Persian explanation | JSON lesson item |
|---|---|---|---|---|
| moonshotai/kimi-k3 | slow: 43-58 s | **Excellent**: finds the real error (pendant -> depuis), clear English, good TEF tip | **Excellent**, natural Persian, correct examples | Valid JSON, correct item (est rentrée) |
| deepseek-ai/deepseek-v4.1-flash | very slow: 114-194 s | **No answer**: a reasoning model; its thinking used all 600 tokens and the reply was empty | **No answer** (same) | Valid JSON, correct item |
| nvidia/nemotron-3-super-120b-a12b | **fast: 3-6 s** | Mostly right (depuis), but adds a false "mistake" (*aller au travail* is fine) | **Poor**: a Hebrew word mid-text, ungrammatical Persian ("خواهد مطالعه کرد"), garbled phrases | Valid JSON, correct item |

**Recommendation (founder to confirm in Plan 3):**
- Quality first for anything a learner reads as teaching: **Kimi K3** for writing scoring, AI lessons, AI drafts and the
  coach note (these can run in the background or behind a "preparing" state, so 40-60 s is acceptable).
- The live AI-tutor chat needs both speed and good explanations in the learner's language: none of these three meets
  both. Plan 3's bake-off adds **z-ai/glm-5.3**, **google/gemma-4-31b-it** and **deepseek-v4.1-flash with reasoning off /
  higher max_tokens**, measured on the same prompts, before choosing the chat model.
- Do not use Nemotron 3 Super for Persian (or likely other non-English explanation languages) without further tests.

---

Models visible to this key: 80. Candidates: moonshotai/kimi-k3, deepseek-ai/deepseek-v4.1-flash, nvidia/nemotron-3-super-120b-a12b

## moonshotai/kimi-k3 - A2 writing correction (English explanation)
51336 ms; tokens 442; x-ratelimit-limit-requests=n/a x-ratelimit-remaining-requests=n/a

```
## Corrections

**Mistake 1:** *« je travaille dans cette entreprise **pendant** trois ans »*
→ **« depuis trois ans »**
- Explanation: For an action that started in the past and is still continuing, French uses **depuis** + present tense, not *pendant*. (*Pendant* is used for a completed duration or future: *j'ai travaillé pendant trois ans* = it's over.)

**Mistake 2 (optional improvement):** *« je travaille **dans cette entreprise** »*
→ **« j'y travaille »**
- Explanation: Since you already mentioned the workplace, the pronoun **y** avoids repetition and sounds more natural.

## Corrected text

> Hier, je suis allé au travail et j'y travaille depuis trois ans.

💡 **TEF tip:** The structure *présent + depuis + durée* is very common in speaking and writing tasks — e.g., *J'habite à Montréal depuis deux ans.* Mastering it will help you sound natural!
```

## moonshotai/kimi-k3 - Persian explanation
58151 ms; tokens 726; x-ratelimit-limit-requests=n/a x-ratelimit-remaining-requests=n/a

```
# تفاوت «depuis» و «pendant»

## depuis (از... / از زمانی که)

**depuis** برای مدت‌زمانی به کار می‌رود که **از گذشته شروع شده و هنوز ادامه دارد** (یا نقطه‌ی شروع آن مشخص است). معمولاً با زمان حال (présent) به کار می‌رود.

- **J'habite à Paris depuis 2020.** → از سال ۲۰۲۰ در پاریس زندگی می‌کنم (و هنوز هم).
- **Elle apprend le français depuis deux ans.** → او دو سال است که فرانسه یاد می‌گیرد (و هنوز ادامه دارد).

نکته: در فارسی و انگلیسی از زمان گذشته استمراری استفاده می‌کنیم، اما در فرانسه با **depuis** معمولاً زمان **حال** می‌آید.

## pendant (در طول / به مدت)

**pendant** برای مدت‌زمانی به کار می‌رود که **کامل و تمام‌شده** است یا یک بازه‌ی مشخص در آینده را نشان می‌دهد. تمرکز روی **کل مدت** است، نه ارتباط با زمان حال.

- **J'ai habité à Paris pendant deux ans.** → دو سال در پاریس زندگی کردم (دیگر آنجا نیستم).
- **Il a plu pendant trois jours.** → سه روز باران بارید.
- **Je vais en France pendant une semaine.** → به مدت یک هفته به فرانسه می‌روم.

## مقایسه‌ی سریع

| | depuis | pendant |
|---|---|---|
| معنی | از... تا الان | به مدت... |
| ارتباط با حال | دارد (ادامه‌دار) | ندارد (تمام‌شده یا بازه‌ی مشخص) |
| زمان فعل | معمولاً présent | معمولاً passé composé یا futur |

## ترفند یادگیری

اگر می‌توانید بگویید «**... است که**» (مثل «دو سال **است که**...») → **depuis**
اگر فقط مدت را می‌گویید (مثل «به مدت دو سال») → **pendant**

تمرین: جمله‌ی «من سه سال است که فرانسه
```

## moonshotai/kimi-k3 - Lesson item as JSON
43265 ms; tokens 246; x-ratelimit-limit-requests=n/a x-ratelimit-remaining-requests=n/a

```
{"question": "Hier soir, Marie ______ à la maison à 20 heures.", "options": ["a rentré", "est rentrée", "est rentré"], "correct_index": 1, "explanation": "« Rentrer » uses être in the passé composé, and the past participle agrees with the feminine subject Marie: « est rentrée »."}
```

## deepseek-ai/deepseek-v4.1-flash - A2 writing correction (English explanation)
113792 ms; tokens 691; x-ratelimit-limit-requests=n/a x-ratelimit-remaining-requests=n/a

```
HTTP 200 {"id":"83f298a12183d5fb","choices":[{"index":0,"message":{"content":null,"refusal":null,"role":"assistant","reasoning_content":"We need answer as French tutor. Need correct learner's French. Sentence:
```

## deepseek-ai/deepseek-v4.1-flash - Persian explanation
154109 ms; tokens 659; x-ratelimit-limit-requests=n/a x-ratelimit-remaining-requests=n/a

```
HTTP 200 {"id":"9be149e3a0727eb1","choices":[{"index":0,"message":{"content":null,"refusal":null,"role":"assistant","reasoning_content":"We need answer in Persian (Farsi), explain French grammar, keep French e
```

## deepseek-ai/deepseek-v4.1-flash - Lesson item as JSON
194068 ms; tokens 413; x-ratelimit-limit-requests=n/a x-ratelimit-remaining-requests=n/a

```
{"question":"Complétez : Nous ___ partis à huit heures.","options":["sommes","avons","êtes"],"correct_index":0,"explanation":"Le verbe « partir » se conjugue avec l’auxiliaire « être » au passé composé. Avec « nous », on utilise « sommes » : nous sommes partis."}
```

## nvidia/nemotron-3-super-120b-a12b - A2 writing correction (English explanation)
2905 ms; tokens 411; x-ratelimit-limit-requests=n/a x-ratelimit-remaining-requests=n/a

```
**Mistakes and explanations**

1. **Hier je suis allé au travail** – Missing a comma after the time expression “Hier”.  
2. **je suis allé au travail** – “Aller au travail” is less idiomatic; “aller travailler” is the usual phrase for “go to work”.  
3. **je travaille dans cette entreprise pendant trois ans** – The present tense “travaille” with “pendant trois ans” incorrectly expresses a duration that started in the past and continues to the present; the correct form uses “depuis” with the present tense (or the passé composé with “pendant” for a completed period).  

**Corrected text**

Hier, je suis allé travailler, et je travaille dans cette entreprise depuis trois ans.
```

## nvidia/nemotron-3-super-120b-a12b - Persian explanation
5689 ms; tokens 645; x-ratelimit-limit-requests=n/a x-ratelimit-remaining-requests=n/a

```
**تفاوت «depuis» و «pendant» در زبان فرانسوی**  

| ویژگی | depuis | pendant |
|-------|--------|----------|
| **معنی اصلی** | «از … تا …» (شروع یک دوره و تا لحظهٔ اشاره یا تا یک نقطهٔ مشخص در گذشته/حاضر) | «در طول …» (مدت زمان یک عمل که داخل یک بازه خاص قرار دارد) |
| **استفاده با زمان** | معمولاً با **زمان حال** (présent) یا **ماضی compound** (passé composé) برای بیان شروع یک عمل که تا کنون ادامه دارد. نمی‑تواند برای آینده به کار رود. | می‑تواند با **زمان گذشته، حال یا آینده** استفاده شود؛ فقط مدت زمان را مشخص می‌کند، بدون اینکه بگوید عمل تا کنون ادامه دارد یا خیر. |
| **ساخت** | depuis + **مقدار زمان** (مثلاً *depuis deux heures*)<br>یا depuis + **جمله** (depuis que …) | pendant + **مقدار زمان** (مثلاً *pendant trois jours*)<br>یا pendant + **جمله** (pendant que …) |
| **نمونه‌هایtypical** | - *J’habite à Paris **depuis** cinq ans.* (من از پنج سال پیش در پاریس زندگی می‌کنم و هنوز هم زندگی می‌کنم.)<br>- *Il pleut **depuis** ce matin.* (از ص امروز باران می‌بارند و هنوز هم باران می‌بارند.) | - *Nous avons voyagé **pendant** deux semaines.* (ما دو هفته سفر کردیم؛ این مدت زمان داخل یک دورهٔ گذشته است.)<br>- *Elle étudiera **pendant** l’été.* (او در تابستان خواهد مطالعه کرد؛ فقط مدت زمان را مشخص می‌کنیم.) |

### توضیح به زبان فارسی

1. **depuis**  
   - این حرف ربط یک **נקודת
```

## nvidia/nemotron-3-super-120b-a12b - Lesson item as JSON
3219 ms; tokens 488; x-ratelimit-limit-requests=n/a x-ratelimit-remaining-requests=n/a

```
{"question": "Choose the correct form of the past participle to complete the sentence: \"Elle ___ (aller) à Paris hier.\"", "options": ["allée", "allé", "allés"], "correct_index": 0, "explanation": "With the auxiliary verb être, the past participle must agree in gender and number with the subject. Elle is feminine singular, so the past participle of aller takes an –e: allée."}
```
