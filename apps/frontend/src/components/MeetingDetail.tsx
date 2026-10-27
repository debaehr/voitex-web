import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { Play } from "lucide-react";
import { api } from "../lib/api";
import { downloadFile } from "../lib/download";
import type { MeetingDetailData, MeetingProvider } from "../lib/meeting-types";
import { audioAvailable, audioUrl, isMeetingProcessing, meetingDate, meetingLabels, meetingMeta, meetingTranscript, nonEmptyNames } from "../lib/meeting-presentation";
import { ConfirmDialog } from "./Dialog";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "./ui";

interface Props {
  id: string; ownSpeakerName?: string; initial?: MeetingDetailData;
  onChanged?: () => void; onDeleted?: () => void; onResult?: (meeting: MeetingDetailData) => void;
}
export function MeetingDetail({ id, ownSpeakerName, initial, onChanged, onDeleted, onResult }: Props) {
  const [meeting, setMeeting] = useState<MeetingDetailData | null>(initial ?? null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [names, setNames] = useState<Record<string, string>>(initial?.speakerNames ?? {});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"audio" | "meeting" | null>(null);
  const [now, setNow] = useState(Date.now());
  const callbacks = useRef({ onChanged, onDeleted, onResult });
  callbacks.current = { onChanged, onDeleted, onResult };
  const audio = useRef<HTMLAudioElement>(null);
  const [preview, setPreview] = useState<{ part: number; start: number } | null>(null);
  const generation = useRef(0);
  const serverTitle = useRef(initial?.title ?? "");
  const serverNames = useRef(initial?.speakerNames ?? {});
  useEffect(() => {
    const version = ++generation.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await api.getMeeting(id);
        if (stopped || version !== generation.current) return;
        setMeeting(next); setError("");
        callbacks.current.onResult?.(next);
        const previousTitle = serverTitle.current, previousNames = serverNames.current;
        setTitle(current => current === previousTitle ? next.title : current);
        setNames(current => JSON.stringify(current) === JSON.stringify(previousNames) ? next.speakerNames : current);
        serverTitle.current = next.title; serverNames.current = next.speakerNames;
        callbacks.current.onChanged?.();
        if (isMeetingProcessing(next.status)) timer = setTimeout(() => void load(), 5000);
      } catch (reason) {
        if (stopped) return;
        setError(reason instanceof Error ? reason.message : "Sitzung konnte nicht geladen werden.");
        timer = setTimeout(() => void load(), 5000);
      }
    }
    void load();
    return () => { stopped = true; clearTimeout(timer); generation.current++; };
  }, [id, refreshVersion]);
  useEffect(() => {
    if (!meeting?.audioExpiresAt) return;
    const delay = Date.parse(meeting.audioExpiresAt) - Date.now();
    if (delay <= 0) { setNow(Date.now()); return; }
    const timer = setTimeout(() => setNow(Date.now()), Math.min(delay + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [meeting?.audioExpiresAt]);
  const hasAudio = !!meeting && audioAvailable(meeting, now);
  useEffect(() => { if (!hasAudio) { audio.current?.pause(); setPreview(null); } }, [hasAudio]);
  async function action(run: () => Promise<unknown>, queued = false, savedField?: "title" | "names") {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await run();
      if (queued) { setMeeting(current => current ? { ...current, status: "queued", progress: 0 } : current); setEditing(false); setRefreshVersion(value => value + 1); }
      else {
        const next = await api.getMeeting(id); setMeeting(next);
        if (savedField === "names") setNames(next.speakerNames);
        if (savedField === "title") setTitle(next.title);
        serverTitle.current = next.title; serverNames.current = next.speakerNames;
      }
      callbacks.current.onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Aktion fehlgeschlagen. Bitte erneut versuchen."); }
    finally { setBusy(false); }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice("In die Zwischenablage kopiert."); }
    catch { setError("Kopieren fehlgeschlagen. Bitte den Text markieren und kopieren."); }
  }
  function play(part: number, start: number) {
    setPreview({ part, start });
    if (preview?.part === part && audio.current) {
      audio.current.currentTime = start;
      void audio.current.play().catch(() => setError("Audio konnte nicht abgespielt werden."));
    }
  }
  const transcript = meeting ? meetingTranscript(meeting, names) : "";
  const speakers = meeting ? [...new Map(meeting.segments.map(segment => [segment.speakerId, segment])).values()] : [];
  const naming = meeting?.status === "naming" || (meeting?.status === "done" && editing);
  return <div className="stack meeting-detail">
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p role="status" className="field-hint">{notice}</p>}
    {!meeting ? <p role="status">Sitzung wird geladen …</p> : <>
      <Card><CardHeader><CardTitle>{meeting.title || "Sitzung ohne Titel"}</CardTitle></CardHeader><CardContent>
        <p className="field-hint">{meetingMeta(meeting)} · {meeting.provider === "assemblyai" ? "AssemblyAI" : meeting.provider === "mistral" ? "Mistral" : "Anbieter noch offen"}{meeting.model ? ` / ${meeting.model}` : ""}</p>
        <div><Badge>{meetingLabels[meeting.status]}</Badge></div>
        <Field label="Titel" htmlFor={`title-${id}`}><Input id={`title-${id}`} value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></Field>
        <div><Button variant="outline" disabled={busy || title === meeting.title} onClick={() => void action(() => api.patchMeeting(id, { title: title.trim() }), false, "title")}>Titel speichern</Button></div>
      </CardContent></Card>
      {isMeetingProcessing(meeting.status) && <div className="stack" role="status"><p>{meetingLabels[meeting.status]}</p><progress value={meeting.progress} max={100} aria-label="Verarbeitungsfortschritt" /><p className="field-hint">Der Status wird alle fünf Sekunden aktualisiert.</p></div>}
      {meeting.status === "error" && <Card><CardHeader><CardTitle>Verarbeitung fehlgeschlagen</CardTitle></CardHeader><CardContent>
        <p role="alert">{meeting.error || "Bitte erneut versuchen."}</p>
        {meeting.providerAttempts?.map((attempt, index) => <p key={index} className="field-hint">{attempt.provider === "assemblyai" ? "AssemblyAI" : "Mistral"}: {attempt.ok ? "Erfolgreich" : attempt.reason || "Fehlgeschlagen"}</p>)}
        <div className="row wrap"><Button disabled={busy} onClick={() => void action(() => api.retryMeeting(id), true)}>Erneut versuchen</Button>
          {(["assemblyai", "mistral"] as MeetingProvider[]).map(provider => <Button key={provider} variant="outline" disabled={busy} onClick={() => void action(() => api.retryMeeting(id, provider), true)}>Erneut mit {provider === "assemblyai" ? "AssemblyAI" : "Mistral"}</Button>)}
        </div>
      </CardContent></Card>}
      {naming && <Card><CardHeader><CardTitle>Sprecher zuordnen</CardTitle></CardHeader><CardContent>
        <p className="field-hint">Gleiche Namen führen Sprecher zusammen. Die Zuordnung erscheint sofort im Transkript.</p>
        <datalist id={`names-${id}`}>{[...new Set([...(meeting.participants ?? []), ownSpeakerName ?? ""].filter(Boolean))].map(name => <option key={name} value={name} />)}</datalist>
        {speakers.map(speaker => {
          const quotes = meeting.segments.filter(segment => segment.speakerId === speaker.speakerId && segment.text.trim()).slice(0, 12)
            .sort((a, b) => b.text.length - a.text.length).slice(0, 3).sort((a, b) => a.start - b.start);
          const label = meeting.parts.length > 1 && !speaker.speakerLabel.startsWith("Teil ") ? `Teil ${speaker.part} · ${speaker.speakerLabel}` : speaker.speakerLabel;
          return <section className="stack speaker-row" key={speaker.speakerId}>
            <Field label={label} htmlFor={`speaker-${speaker.speakerId}`}>
              <Input id={`speaker-${speaker.speakerId}`} list={`names-${id}`} maxLength={100} value={names[speaker.speakerId] ?? ""} placeholder="Name (optional)" disabled={busy}
                onChange={event => setNames({ ...names, [speaker.speakerId]: event.target.value })} />
            </Field>
            {quotes.map((quote, index) => <blockquote key={index}>{quote.text.trim().slice(0, 180)}{quote.text.trim().length > 180 ? " …" : ""}</blockquote>)}
            {hasAudio && quotes.length > 0 && <div><Button variant="outline" size="sm" onClick={() => play(speaker.part, quotes[0].start)}><Play aria-hidden />{label} anhören</Button></div>}
          </section>;
        })}
        {hasAudio && preview && <audio ref={audio} key={preview.part} src={audioUrl(id, preview.part)} controls preload="metadata" onLoadedMetadata={() => {
          if (audio.current) { audio.current.currentTime = preview.start; void audio.current.play().catch(() => setError("Audio konnte nicht abgespielt werden.")); }
        }} />}
        <div className="row wrap">
          {meeting.status === "done" ? <>
            <Button disabled={busy} onClick={() => void action(() => api.patchMeeting(id, { speakerNames: nonEmptyNames(names) }), false, "names")}>Namen speichern</Button>
            <Button variant="outline" disabled={busy} onClick={() => void action(() => api.protocolMeeting(id, nonEmptyNames(names)), true)}>Protokoll neu erzeugen</Button>
            <Button variant="ghost" onClick={() => { setEditing(false); setNames(meeting.speakerNames); }}>Schließen</Button>
          </> : <>
            <Button disabled={busy} onClick={() => void action(() => api.protocolMeeting(id, nonEmptyNames(names)), true)}>Protokoll erstellen</Button>
            <Button variant="outline" disabled={busy} onClick={() => void action(() => api.protocolMeeting(id), true)}>Ohne Namen erstellen</Button>
          </>}
        </div>
      </CardContent></Card>}
      {meeting.status === "done" && <Card><CardHeader><CardTitle>Protokoll</CardTitle></CardHeader><CardContent>
        <div className="row wrap"><Button variant="outline" onClick={() => void copy(meeting.protocol)}>Protokoll kopieren</Button><Button variant="outline" onClick={() => downloadFile(`${meeting.title || "Sitzung"}.md`, meeting.protocol, "text/markdown;charset=utf-8")}>Markdown herunterladen</Button>
          {!editing && <Button variant="ghost" onClick={() => setEditing(true)}>Sprecher umbenennen</Button>}</div>
        <Markdown text={meeting.protocol} />
      </CardContent></Card>}
      {!!meeting.segments.length && <Card><CardHeader><CardTitle>Transkript</CardTitle></CardHeader><CardContent>
        <div className="row wrap"><Button variant="outline" onClick={() => void copy(transcript)}>Transkript kopieren</Button><Button variant="outline" onClick={() => downloadFile(`${meeting.title || "Sitzung"}.txt`, transcript, "text/plain;charset=utf-8")}>TXT herunterladen</Button></div>
        <div className="meeting-transcript">{transcript.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      </CardContent></Card>}
      {hasAudio && !isMeetingProcessing(meeting.status) && <Card><CardHeader><CardTitle>Audio</CardTitle></CardHeader><CardContent>
        {meeting.parts.map(part => <a key={part.part} href={audioUrl(id, part.part)} download>Teil {part.part}: Audio herunterladen{meeting.audioExpiresAt ? ` (wird am ${meetingDate(meeting.audioExpiresAt)} gelöscht)` : ""}</a>)}
        <div><Button variant="outline" disabled={busy} onClick={() => setConfirm("audio")}>Jetzt löschen</Button></div>
      </CardContent></Card>}
      <div><Button variant="destructive" disabled={busy || isMeetingProcessing(meeting.status)} onClick={() => setConfirm("meeting")}>Sitzung löschen</Button></div>
      {confirm && <ConfirmDialog title={confirm === "audio" ? "Audio jetzt löschen?" : "Sitzung löschen?"} confirmLabel="Löschen" onClose={() => setConfirm(null)} onConfirm={() => {
        const target = confirm; setConfirm(null);
        if (target === "audio") void action(() => api.deleteMeetingAudio(id));
        else { setBusy(true); void api.deleteMeeting(id).then(() => { callbacks.current.onDeleted?.(); callbacks.current.onChanged?.(); }).catch(reason => setError(reason.message)).finally(() => setBusy(false)); }
      }}>{confirm === "audio" ? "Alle Audioteile werden dauerhaft gelöscht. Transkript und Protokoll bleiben erhalten." : "Die Sitzung mit Audio, Transkript und Protokoll wird dauerhaft gelöscht."}</ConfirmDialog>}
    </>}
  </div>;
}
