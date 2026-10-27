import { describe, expect, it } from "vitest";
import { applyLexicon, lexiconEntries } from "../src/lexicon.js";
import { contextBiasTerms, MAX_CONTEXT_BIAS_TERMS } from "../src/context-bias.js";

describe("server lexicon matches frontend replacements", () => {
  it("replaces whole Unicode words and longest phrases without cascading", () => {
    expect(applyLexicon("MÜLLER GmbH, müller! Altmüller Öko", [
      { spoken: "müller", correct: "Müller" },
      { spoken: "müller gmbh", correct: "MÜLLER GmbH" },
      { spoken: "", correct: "Öko" }
    ])).toBe("MÜLLER GmbH, Müller! Altmüller Öko");
    expect(applyLexicon("a b", [{ spoken: "a", correct: "b" }, { spoken: "b", correct: "c" }])).toBe("b c");
  });
  it("prefers longer phrases and ignores hint-only entries", () => {
    expect(applyLexicon("alpha beta alpha Öko", [
      { spoken: "alpha", correct: "Kurz" }, { spoken: "alpha beta", correct: "Lang" },
      { spoken: "  ", correct: "Hinweis" }
    ])).toBe("Lang Kurz Öko");
    expect(applyLexicon("Unverändert", [])).toBe("Unverändert");
  });
  it("escapes regex syntax and protects adjacent Unicode letters, numbers and underscores", () => {
    expect(applyLexicon("C++ und C++x", [{ spoken: "C++", correct: "CPP" }])).toBe("CPP und C++x");
    expect(applyLexicon("öko Ökohaus _öko öko2 (ÖKO)", [{ spoken: "öko", correct: "Eco" }]))
      .toBe("Eco Ökohaus _öko öko2 (Eco)");
  });
  it("keeps the first case-insensitive duplicate and trims only the spoken match", () => {
    expect(applyLexicon("NAME", [{ spoken: " name ", correct: " First " }, { spoken: "NAME", correct: "Second" }])).toBe(" First ");
  });
  it("tolerates malformed legacy settings entries", () => {
    expect(lexiconEntries([null, 1, {}, { spoken: "bad", correct: 1 }, { correct: "Hint" }, { spoken: "a", correct: "b" }]))
      .toEqual([{ spoken: "", correct: "Hint" }, { spoken: "a", correct: "b" }]);
    expect(lexiconEntries(null)).toEqual([]);
  });
});

it("deduplicates context terms case-insensitively, preserves order, trims and caps once", () => {
  const terms = contextBiasTerms(["  Müller ", "mÜLLER", "", "Anna", ...Array.from({ length: 110 }, (_, i) => `Term${i}`)]);
  expect(terms).toHaveLength(MAX_CONTEXT_BIAS_TERMS);
  expect(terms.slice(0, 3)).toEqual(["Müller", "Anna", "Term0"]);
  expect(terms.at(-1)).toBe("Term97");
});
