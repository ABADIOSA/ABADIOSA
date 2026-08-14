// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { isArabicScriptLang, subFontFor } from "../src/lib/player/sub-style";

const settings = (subFontFamily: string) =>
  ({ subFontFamily, customFonts: [] }) as never;

test("arabic language tags are recognised in every common form", () => {
  for (const lang of ["ar", "ara", "arabic", "AR", "ar-SA", "ar_EG", " ar "])
    assert.equal(isArabicScriptLang(lang), true, lang);
});

test("other arabic-script languages are covered too", () => {
  for (const lang of ["fa", "ur", "ps", "ckb", "ug"])
    assert.equal(isArabicScriptLang(lang), true, lang);
});

test("non-arabic tags never match", () => {
  for (const lang of ["en", "ja", "uk", "pl", "fr", "zh", ""])
    assert.equal(isArabicScriptLang(lang), false, lang);
  assert.equal(isArabicScriptLang(undefined), false);
});

// Inter ships as the default and has no Arabic coverage, so libass re-selected a font
// mid-word and the shaping run broke — Arabic rendered as disconnected letters.
test("a font without arabic coverage is swapped on an arabic track", () => {
  assert.equal(subFontFor(settings("inter"), "ar"), "Vazirmatn");
  assert.equal(subFontFor(settings("rounded"), "ar"), "Vazirmatn");
});

test("non-arabic tracks keep the configured font", () => {
  assert.equal(subFontFor(settings("inter"), "en"), "Inter");
  assert.equal(subFontFor(settings("rounded"), "ja"), "Fredoka");
  assert.equal(subFontFor(settings("inter"), undefined), "Inter");
});

test("an explicit font choice is never overridden", () => {
  assert.equal(subFontFor(settings("arabic"), "ar"), "Vazirmatn");
  assert.equal(subFontFor(settings("system"), "ar"), "Segoe UI");
  assert.equal(subFontFor(settings("serif"), "ar"), "Times New Roman");
});
