import { useState } from "react";
import { Button } from "../components/ui";
import { EmptyCard, ListPage } from "./ListPage";

export function SnippetsView() {
  const [query, setQuery] = useState("");

  return (
    <ListPage
      query={query}
      onQueryChange={setQuery}
      onToggleOrder={() => undefined}
      onImport={() => undefined}
      onAdd={() => undefined}
      hint="0 Snippets · Das ganze Diktat muss das Schlüsselwort sein; der Text wird dann ohne Umschreiben eingefügt."
    >
      <EmptyCard
        title="Keine Snippets vorhanden"
        text="Erstelle Textbausteine für häufig verwendete Phrasen. Sage einfach das Schlüsselwort, und der Text wird eingefügt."
        action={<Button>Erstes Snippet erstellen</Button>}
      />
    </ListPage>
  );
}
