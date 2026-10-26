import { ArrowUp, Download, Plus, Search, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, Input } from "../components/ui";

// Shared frame of the lexicon and snippets pages (voitex LexikonView/SnippetsView):
// toolbar with search, sort, import/export and add, a hint line, then the list.

interface ListPageProps {
  disabled?: boolean;
  searchPlaceholder?: string;
  query: string;
  onQueryChange: (value: string) => void;
  sortControl?: ReactNode;
  onToggleOrder: () => void;
  onImport: () => void;
  onExport?: () => void;
  onAdd: () => void;
  hint: ReactNode;
  children: ReactNode;
}

export function ListPage(props: ListPageProps) {
  return (
    <div className="page-column stack">
      <div className="row wrap">
        <div className="input-icon grow" style={{ minWidth: 180 }}>
          <Search />
          <Input
            type="search"
            placeholder={props.searchPlaceholder ?? "Suchen …"}
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            aria-label="Suchen"
          />
        </div>
        {props.sortControl}
        <Button variant="outline" size="icon" aria-label="Reihenfolge umkehren" onClick={props.onToggleOrder}>
          <ArrowUp />
        </Button>
        <Button variant="outline" onClick={props.onImport} disabled={props.disabled}>
          <Upload /> Importieren
        </Button>
        <Button variant="outline" onClick={props.onExport} disabled={props.disabled || !props.onExport}>
          <Download /> Exportieren
        </Button>
        <Button onClick={props.onAdd} disabled={props.disabled}>
          <Plus /> Hinzufügen
        </Button>
      </div>
      <p className="field-hint">{props.hint}</p>
      {props.children}
    </div>
  );
}

export function EmptyCard({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <Card>
      <div className="empty-state">
        <strong>{title}</strong>
        <p className="muted" style={{ maxWidth: 480 }}>
          {text}
        </p>
        {action}
      </div>
    </Card>
  );
}
