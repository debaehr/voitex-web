import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../src/components/Markdown";

const render = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

it("renders a table between adjacent paragraphs with a scrollable focusable wrapper", () => {
  const html = render("Vorher\n| Aufgabe | Verantwortlich | Termin |\n|---|---|---|\n| Datenblätter senden | Torsten | Heute Nachmittag |\nNachher");
  expect(html).toContain('<p>Vorher</p><div class="meeting-protocol-table" tabindex="0"><table><thead><tr>');
  expect(html).toContain('scope="col" style="text-align:left">Aufgabe</th>');
  expect(html).toContain('</thead><tbody><tr><td style="text-align:left">Datenblätter senden</td>');
  expect(html).toContain('>Torsten</td><td style="text-align:left">Heute Nachmittag</td></tr></tbody></table></div><p>Nachher</p>');
});

it("applies separator alignment to headers and body, including optional outer pipes and CRLF", () => {
  const html = render("Links | Mitte | Rechts | Standard\r\n:--- | :---: | ---: | ---\r\na | b | c | d");
  for (const [label, alignment, value] of [["Links", "left", "a"], ["Mitte", "center", "b"], ["Rechts", "right", "c"], ["Standard", "left", "d"]]) {
    expect(html).toContain(`<th scope="col" style="text-align:${alignment}">${label}</th>`);
    expect(html).toContain(`<td style="text-align:${alignment}">${value}</td>`);
  }
});

it("renders inline bold and italic in header and body cells", () => {
  const html = render("| **Aufgabe** | Termin |\n| --- | --- |\n| **Senden** | *Heute* |");
  expect(html).toContain('<strong>Aufgabe</strong></th>');
  expect(html).toContain('<strong>Senden</strong></td>');
  expect(html).toContain('<em>Heute</em></td>');
});

it("keeps HTML injection payloads as escaped cell text", () => {
  const html = render('| Aufgabe |\n| --- |\n| <img src=x onerror="alert(1)"> |');
  expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</td>');
  expect(html).not.toMatch(/<img\b/);
});

it.each(["| A | B |\n| -- | --- |\n| x | y |", "| A | B |\n| --- |\n| x | y |", "| A | B |\n| nope | --- |", "| A | B |\n| x | y |"])("keeps malformed tables as plain paragraphs: %s", text => {
  const html = render(text);
  expect(html).not.toContain('<table>');
  expect(html).toContain(`<p>${text}</p>`);
});

it("normalizes short and long body rows and supports header-only tables", () => {
  const html = render('| A | B |\n| --- | --- |\n| x |\n| y | z | ignored |');
  expect(html).toContain('>x</td><td style="text-align:left"></td>');
  expect(html).not.toContain('ignored');
  expect(render('| A |\n| --- |')).toContain('<tbody></tbody>');
});
