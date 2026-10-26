import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, Select } from "../components/ui";
import { EmptyCard, ListPage } from "./ListPage";

export interface LexiconRow {
  id: string;
  spoken: string;
  correct: string;
}

export function LexiconView({ entries }: { entries: LexiconRow[] }) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"correct" | "spoken">("correct");
  const [ascending, setAscending] = useState(true);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de-DE");
    const filtered = needle
      ? entries.filter((entry) => `${entry.spoken} ${entry.correct}`.toLocaleLowerCase("de-DE").includes(needle))
      : entries;
    const sorted = [...filtered].sort((a, b) => a[sortBy].localeCompare(b[sortBy], "de-DE"));
    return ascending ? sorted : sorted.reverse();
  }, [entries, query, sortBy, ascending]);

  return (
    <ListPage
      query={query}
      onQueryChange={setQuery}
      sortControl={
        <Select value={sortBy} onChange={(event) => setSortBy(event.target.value as "correct" | "spoken")} aria-label="Sortieren nach" style={{ width: "auto" }}>
          <option value="correct">Korrektes Wort</option>
          <option value="spoken">Klingt wie</option>
        </Select>
      }
      onToggleOrder={() => setAscending((value) => !value)}
      onImport={() => undefined}
      onExport={entries.length > 0 ? () => undefined : undefined}
      onAdd={() => undefined}
      hint={`${entries.length} Einträge · Korrekturen gelten für Diktate und Meetings.`}
    >
      {entries.length === 0 ? (
        <EmptyCard
          title="Noch keine Einträge"
          text="Trage Eigennamen und Fachbegriffe ein, die die Spracherkennung falsch schreibt."
          action={<Button>Ersten Eintrag anlegen</Button>}
        />
      ) : (
        <Card className="list-card">
          <div className="list-head">Eintrag</div>
          {visible.map((entry) => (
            <div key={entry.id} className="list-row">
              <span className="code-chip">{entry.spoken}</span>
              <ArrowRight size={16} className="muted" />
              <strong style={{ fontWeight: 600 }}>{entry.correct}</strong>
            </div>
          ))}
        </Card>
      )}
    </ListPage>
  );
}
