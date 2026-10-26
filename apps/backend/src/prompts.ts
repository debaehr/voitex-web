export const modeInstructions = {
  original:
    "Bereinige das Transkript nur sprachlich. Erhalte Stil, Tonalität, Inhalt und Reihenfolge des Originals. Korrigiere Rechtschreibung, Zeichensetzung und klare Versprecher. Keine inhaltlichen Ergänzungen. Gib nur den finalen Text zurück.",
  casual:
    "Formuliere den Inhalt locker, natürlich und direkt. Nutze bei direkter Anrede die Du-Form. Kürze unnötige Wiederholungen und mache den Text gut lesbar. Gib nur den finalen Text zurück.",
  formal:
    "Formuliere den Inhalt höflich, professionell und klar. Nutze bei direkter Anrede die Sie-Form. Strukturiere den Text bei Bedarf in kurze, verständliche Abschnitte. Gib nur den finalen Text zurück.",
  coding:
    "Transformiere das Diktat in einen klaren, präzisen KI- oder Coding-Prompt. Extrahiere Ziel, Kontext, Anforderungen, Randbedingungen und gewünschtes Ausgabeformat. Nutze eine strukturierte Form mit Überschriften und Bulletpoints. Gib nur den finalen Prompt zurück."
};

export const defaultProtocolPrompt = `Erstelle aus den diktierten Gesprächsnotizen ein strukturiertes Meetingprotokoll auf Deutsch.

AUSGABE-STRUKTUR:

[Titel, nur wenn in den Notizen genannt]
Datum: [nur wenn genannt]
Teilnehmer: [nur namentlich genannte Personen]

Kernpunkte
- [...]

Entscheidungen [Sektion weglassen, wenn keine genannt]
- [...]

Offene Punkte [Sektion weglassen, wenn keine genannt]
- [...]

To-dos [Sektion weglassen, wenn keine genannt]
- [Name]: [Aufgabe] — bis [Datum]
- [Name]: [Aufgabe] — kein Termin

REGELN:
- Inhalt maximal verdichten, Sinn und konkrete Details vollständig erhalten.
- Entscheidungen nur aufführen, wenn sie ausdrücklich genannt wurden.
- Verantwortliche und Termine nur übernehmen, wenn sie genannt wurden.
- Keine Informationen ergänzen oder interpretieren.
- Gib ausschließlich das fertige Protokoll als klar strukturierten Text zurück.`;

export const defaultSummaryPrompt = "Erstelle eine prägnante Meeting-Zusammenfassung auf Deutsch. Struktur: Kurzfassung, Entscheidungen, Aufgaben, offene Punkte. Erhalte konkrete Namen, Termine und Verantwortlichkeiten, sofern vorhanden.";

export const defaultPrompts = {
  ...modeInstructions,
  protocol: defaultProtocolPrompt,
  summary: defaultSummaryPrompt
};
