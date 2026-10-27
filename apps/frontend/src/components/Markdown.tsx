import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(start, match.index));
    parts.push(match[1] ? <strong key={match.index}>{match[1]}</strong> : <em key={match.index}>{match[2]}</em>);
    start = match.index! + match[0].length;
  }
  parts.push(text.slice(start));
  return parts;
}
const heading = /^(#{1,3})\s+(.+)$/;
const bullet = /^[-*]\s+(.+)$/;
const numbered = /^\d+\.\s+(.+)$/;

function tableCells(line: string): string[] | null {
  if (!line.includes("|")) return null;
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
}

function tableHeader(lines: string[], index: number) {
  const cells = tableCells(lines[index]);
  const separators = tableCells(lines[index + 1] ?? "");
  if (!cells || !separators || cells.length !== separators.length || !separators.every(cell => /^:?-{3,}:?$/.test(cell))) return null;
  const alignments = separators.map(cell => cell.startsWith(":") ? (cell.endsWith(":") ? "center" : "left") : cell.endsWith(":") ? "right" : "left") as ("left" | "center" | "right")[];
  return { cells, alignments };
}

// All content stays in React text nodes; HTML, links and unsupported syntax are literal.
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const table = tableHeader(lines, index);
    if (table) {
      const start = index, rows: ReactNode[] = [];
      index += 2;
      while (index < lines.length && !tableHeader(lines, index)) {
        const cells = tableCells(lines[index]);
        if (!cells) break;
        rows.push(<tr key={index}>{table.cells.map((_, column) => <td key={column} style={{ textAlign: table.alignments[column] }}>{inline(cells[column] ?? "")}</td>)}</tr>);
        index++;
      }
      blocks.push(<div className="meeting-protocol-table" key={start} tabIndex={0}>
        <table><thead><tr>{table.cells.map((cell, column) => <th scope="col" key={column} style={{ textAlign: table.alignments[column] }}>{inline(cell)}</th>)}</tr></thead><tbody>{rows}</tbody></table>
      </div>);
      continue;
    }
    const title = line.match(heading);
    if (title) {
      const Tag = `h${title[1].length}` as "h1" | "h2" | "h3";
      blocks.push(<Tag key={index}>{inline(title[2])}</Tag>); index++; continue;
    }
    const listPattern = bullet.test(line) ? bullet : numbered.test(line) ? numbered : null;
    if (listPattern) {
      const start = index, items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index].match(listPattern);
        if (!item) break;
        items.push(<li key={index}>{inline(item[1])}</li>); index++;
      }
      blocks.push(listPattern === bullet ? <ul key={start}>{items}</ul> : <ol key={start} start={Number.parseInt(line, 10)}>{items}</ol>);
      continue;
    }
    const start = index, paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !tableHeader(lines, index) && !heading.test(lines[index]) && !bullet.test(lines[index]) && !numbered.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={start}>{inline(paragraph.join("\n"))}</p>);
  }
  return <div className="meeting-protocol">{blocks}</div>;
}
