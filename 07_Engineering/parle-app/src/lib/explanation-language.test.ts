import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  explanationLanguageReminder,
  explanationLanguageRetry,
  replyFollowsExplanationLanguage,
  tutorExplanationRule,
} from "../../functions/parle-tutor.helper.ts";

const FRENCH = "« Depuis » indique le point de départ d'une action qui continue. « Pendant » indique une durée complète et terminée. Exemple : J'habite ici depuis deux ans.";
const ARABIC = "نستخدم «depuis» لفعل بدأ في الماضي وما زال مستمرًا، ونستخدم «pendant» لمدة كاملة انتهت. مثال: J'habite ici depuis deux ans.";
const HINDI = "«depuis» का प्रयोग उस काम के लिए होता है जो अतीत में शुरू हुआ और अब भी जारी है; «pendant» पूरी हो चुकी अवधि के लिए है। उदाहरण: J'habite ici depuis deux ans.";
const native = (nativeLanguage: string) => ({ level: "A2" as const, nativeLanguage, explainInNative: true });

describe("explanations in the learner's language (A29, R37)", () => {
  it("an Arabic, Persian or Hindi explanation must be written in that script", () => {
    assert.equal(replyFollowsExplanationLanguage(FRENCH, native("Arabic")), false);
    assert.equal(replyFollowsExplanationLanguage(ARABIC, native("Arabic")), true);
    assert.equal(replyFollowsExplanationLanguage(`${FRENCH} هل فهمت؟`, native("Arabic")), false); // a closing question only
    assert.equal(replyFollowsExplanationLanguage(FRENCH, native("Persian")), false);
    assert.equal(replyFollowsExplanationLanguage(HINDI, native("Hindi")), true);
    assert.equal(replyFollowsExplanationLanguage(FRENCH, native("Hindi")), false);
  });
  it("does not check English, Spanish, or a learner who chose French-first explanations", () => {
    assert.equal(replyFollowsExplanationLanguage(FRENCH, native("Spanish")), true);
    assert.equal(replyFollowsExplanationLanguage(FRENCH, native("English")), true);
    assert.equal(replyFollowsExplanationLanguage(FRENCH, { nativeLanguage: "Arabic", explainInNative: false }), true);
  });
  it("asks for the learner's language by name, at the end of the prompt and when asking again", () => {
    assert.match(explanationLanguageReminder(native("Spanish")), /explanations in Spanish, not in French and not in English/);
    assert.match(explanationLanguageReminder(native("Arabic")), /Arabic \(Arabic script\)/);
    assert.equal(explanationLanguageReminder(native("English")), "");
    assert.equal(explanationLanguageReminder({ level: "A2", nativeLanguage: "Arabic", explainInNative: false }), "");
    assert.match(explanationLanguageRetry(native("Hindi")), /every explanation in Hindi \(Devanagari script\)/);
    const rule = tutorExplanationRule({ level: "A1", nativeLanguage: "Spanish", explainInNative: true });
    assert.match(rule, /do not explain in French either/);
    assert.match(rule, /Start the reply with one or two sentences in Spanish/);
  });
  it("the tutor service ends both prompts with the reminder and checks both replies", () => {
    const src = readFileSync(new URL("../../functions/parle-tutor-service.helper.ts", import.meta.url), "utf8");
    assert.equal(src.match(/explanationLanguageReminder\(/g)?.length, 2);
    assert.equal(src.match(/await withExplanationLanguage\(/g)?.length, 2);
  });
});
