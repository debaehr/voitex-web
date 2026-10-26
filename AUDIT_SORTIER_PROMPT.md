# AUDIT_SORTIER_PROMPT

Fuehrt Funde aus mehreren Werkzeugen zusammen und bildet daraus eine
Abarbeitungsreihenfolge. Im Agenten ausfuehren, **ohne Schreibrechte** —
das ist ein Planungsschritt.

Quellen einsammeln:

    npx impeccable detect <pfad>                  # deterministisch, 59 Regeln
    /impeccable critique <ziel>                   # im Agenten
    "pruefe <pfad> mit web-design-guidelines"     # im Agenten

---

```
Du sortierst Audit-Funde aus mehreren Werkzeugen in eine Abarbeitungsreihenfolge.
Du aenderst KEINE Dateien. Ausgabe ist ein Plan, kein Patch.

## Kontext
Projekt: [Name]
Art der Oberflaeche: [datendichte Fach-UI | Produkt-UI | Marketing/Landing | internes Tool]
Codebasis: [z. B. eine Datei index.html, ~7.600 Zeilen | React-Komponenten in src/]
Nicht anfassen: [Bereiche, Dateien, Themen]
Zeitbudget: [z. B. ein Nachmittag | zwei Wochen nebenher]

## Eingabe
Quelle A — Impeccable detect: [einfuegen]
Quelle B — Impeccable critique: [einfuegen]
Quelle C — Vercel Web Interface Guidelines: [einfuegen]

## Schritt 1 — Zusammenfuehren
Die Werkzeuge melden dasselbe Problem oft unter verschiedenen Namen. Fasse Dopplungen
zusammen und nenne beide Quellen. Widersprechen sich zwei Funde, benenne den Konflikt,
statt eine Seite stillschweigend zu uebernehmen.

## Schritt 2 — Klassifizieren
Genau eine Kategorie je Fund:
  LOESCHEN     Element verschwindet ohnehin
  STRUKTUR     Markup, Semantik, Hierarchie, Navigation, Informationsarchitektur
  ERGAENZEN    additives Attribut, kein Umbau (aria-label, name, autocomplete,
               for/id, overscroll-behavior, width/height)
  OPTIK        Typografie, Farbe, Abstaende, Motion
  PERFORMANCE  Laden, Rendern, Bundle

## Schritt 3 — Abhaengigkeiten pruefen
Je Fund, in dieser Reihenfolge:
  a) Macht ein anderer Fix diesen ueberfluessig?
     -> streichen, beim verursachenden Fund vermerken
  b) Fasst ein anderer Fix denselben Code an?
     -> buendeln, nicht getrennt einplanen
  c) Verschiebt der Fix Zeilennummern spuerbar?
     -> markieren; Funde danach muessen neu erhoben werden

## Schritt 4 — Runden bilden
Grundreihenfolge: LOESCHEN -> STRUKTUR -> ERGAENZEN -> OPTIK -> PERFORMANCE.
Ausnahme: rein additive ERGAENZEN-Fixes, die kein Umbau beruehrt, duerfen vorgezogen
werden — billig und konfliktfrei.
Innerhalb einer Runde nach Datei oder Komponente buendeln, nicht nach Fundtyp.
Jede Runde ist ein Commit.

## Schritt 5 — Zurueckstellen
Getrennt nennen, was NICHT bearbeitet werden sollte, mit Begruendung:
  - Empfehlungen, die zur Art der Oberflaeche nicht passen (bei datendichten Fach-UIs
    schlaegt Konsistenz die visuelle Kuehnheit — Impeccable hat hier einen Bias)
  - Aufwand uebersteigt Nutzen im gegebenen Zeitbudget
  - Funde, die eine fachliche oder rechtliche Entscheidung brauchen, keine technische
Accessibility-Funde werden nie zurueckgestellt.

## Ausgabeformat
Fund-IDs im Format A-<3-stellig>, fortlaufend ueber alle Runden.
Pro Runde:
  Ueberschrift + geschaetzter Aufwand
  Tabelle: ID | Fundstelle | Was zu tun ist | Kategorie | Quelle
  Ein Satz: warum diese Runde an dieser Stelle steht
  Pruefschritt am Ende der Runde
Danach:
  "Zurueckgestellt" mit Begruendung je Punkt
  "Braucht deine Entscheidung" — offene Fragen an mich, nicht geraten

Keine Fixes vorwegnehmen. Keine Codebeispiele. Nur Reihenfolge und Begruendung.
```

---

## Zusaetze bei Bedarf

| Situation | Ergaenzung ans Ende des Prompts |
|---|---|
| Grosse Einzeldatei | „Markiere nach jeder Runde, welche folgenden Funde neu erhoben werden muessen." |
| Harte Deadline | „Reicht das Budget nicht fuer alle Runden: nenne den Schnitt und begruende ihn." |
| Mehrere Bearbeiter | „Markiere je Runde, welche Buendel parallel laufen koennen." |

## Nach jeder Runde

    npx impeccable detect <pfad>        # Zahl muss sinken

Sinkt sie nicht, wurden Symptome verschoben statt Ursachen behoben.
Vercel-Funde separat neu erheben — der Skill prueft live gegen seine Guidelines.
Nur die Detektor-Zahl ist zwischen zwei Laeufen vergleichbar, und das auch nur bei
identischer Impeccable-Version auf allen Maschinen.
