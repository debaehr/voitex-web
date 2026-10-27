import { readSystemAudioPreference, writeSystemAudioPreference } from "../lib/meeting-browser";
import { useState } from "react";
import { Circle, Info, Pause, Play, Square } from "lucide-react";
import { ConfirmDialog } from "../components/Dialog";
import { MeetingSessions } from "../components/MeetingSessions";
import { parseParticipants } from "../lib/meeting-presentation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Switch } from "../components/ui";
import type { MeetingRecorder, MeetingSnapshot } from "../lib/meeting-recorder";
import { meetingClock } from "../lib/meeting-types";

interface Props {
  state: MeetingSnapshot;
  controller: MeetingRecorder | null;
  language: string;
  dictationActive: boolean;
  ownSpeakerName?: string;
}
const statuses = { queued: "Wartet auf Verarbeitung", transcribing: "Wird transkribiert", naming: "Namen zuordnen", summarizing: "Protokoll wird erstellt", done: "Fertig", error: "Verarbeitung fehlgeschlagen" };
export function ProtocolView({ state, controller, language, dictationActive, ownSpeakerName }: Props) {
  const [systemAudio, setSystemAudio] = useState(readSystemAudioPreference);
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState("");
  const [inputError, setInputError] = useState("");
  const [confirm, setConfirm] = useState<"finish" | "discard" | null>(null);
  const recovering = state.phase === "recovery" || state.phase === "interrupted";
  const recording = state.phase === "recording" || state.phase === "paused";
  const startRecording = (withSystemAudio: boolean) => {
    try {
      const names = parseParticipants(participants); setInputError("");
      void controller?.start(title, language, names, withSystemAudio);
    } catch (reason) { setInputError((reason as Error).message); }
  };
  const chooseAudio = (withSystemAudio: boolean) => {
    if (recovering) void controller?.resume(withSystemAudio);
    else startRecording(withSystemAudio);
  };
  return (
    <div className="stack meeting-page">
      {confirm ? <ConfirmDialog title={confirm === "finish" ? "Aufnahme beenden?" : "Aufnahme verwerfen?"}
        confirmLabel={confirm === "finish" ? "Beenden und verarbeiten" : "Verwerfen"}
        onClose={() => setConfirm(null)} onConfirm={() => {
          setConfirm(null); if (confirm === "finish") void controller?.finish(); else void controller?.discard();
        }}>
        {confirm === "finish" ? "Alle aufgenommenen Stücke werden gesichert. Danach kannst du die Sprecher zuordnen und das Protokoll erstellen." : "Diese Sitzung und die gesicherten Audiostücke werden dauerhaft gelöscht."}
      </ConfirmDialog> : null}
      {state.phase === "idle" || state.phase === "loading" || state.phase === "starting" ? <Card>
        <CardHeader>
          <CardTitle>Sitzung aufnehmen</CardTitle>
          <CardDescription>Bis zu drei Stunden aufnehmen. Danach folgen Transkript mit Sprecherzuordnung und Protokoll.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="meeting-notice row">
            <Info size={18} aria-hidden className="muted" />
            <div className="stack">
              <p>Bitte alle Teilnehmenden vorher über die Aufnahme informieren.</p>
              <p>Gerät nahe an die Gesprächsrunde legen und die App geöffnet lassen.</p>
              {state.systemAudioSupported && systemAudio ? <p>Im folgenden Dialog ‚Gesamter Bildschirm‘ wählen und ‚Systemaudio teilen‘ anhaken. Bei Teams im Browser: den Teams-Tab mit Tab-Audio wählen. Es wird nur Ton aufgenommen, kein Bild. Aufgenommen wird alles, was der Computer abspielt, auch Benachrichtigungstöne.</p> : null}
              {state.isIOS ? <p>Wechsel auf den Homescreen oder Sperren hält die Aufnahme an.</p> : null}
            </div>
          </div>
          {state.systemAudioSupported ? <div className="row between">
            <span>Ton des Computers mit aufnehmen (Teams, Zoom …)</span>
            <Switch label="Ton des Computers mit aufnehmen (Teams, Zoom …)" checked={systemAudio} disabled={state.phase !== "idle"} onCheckedChange={value => { setSystemAudio(value); writeSystemAudioPreference(value); }} />
          </div> : null}
          <Field label="Titel (optional)" htmlFor="meeting-title"><Input id="meeting-title" value={title} maxLength={200} disabled={state.phase !== "idle"} onChange={event => setTitle(event.target.value)} placeholder="z. B. Projektbesprechung" /></Field>
          <Field label="Teilnehmende (optional)" htmlFor="meeting-participants" hint="Durch Komma getrennt · maximal 20 Namen."><Input id="meeting-participants" value={participants} disabled={state.phase !== "idle"} onChange={event => setParticipants(event.target.value)} /></Field>
          {inputError && <p role="alert" className="form-error">{inputError}</p>}
          <p className="field-hint">Aufnahmesprache: {language === "auto" ? "Automatisch erkennen" : language.toUpperCase()} · entspricht der Auswahl im Diktat-Overlay.</p>
          <div className="stack">
            <Button disabled={state.phase !== "idle" || !!state.systemAudioChoice || dictationActive || !controller} aria-describedby="meeting-start-hint" onClick={() => startRecording(state.systemAudioSupported && systemAudio)}>
              <Circle fill="currentColor" aria-hidden /> {state.phase === "starting" ? "Mikrofon wird gestartet …" : "Aufnahme starten"}
            </Button>
            <p id="meeting-start-hint" className="field-hint">{dictationActive ? "Bitte zuerst das Diktat beenden." : state.phase === "loading" ? "Lokale Aufnahmen werden geprüft …" : "Die Aufnahme bleibt auch beim Wechsel zu anderen Seiten in dieser App aktiv."}</p>
          </div>
        </CardContent>
      </Card> : null}

      {recovering || recording || state.phase === "finishing" ? <Card>
        <CardHeader>
          <CardTitle>{state.phase === "interrupted" ? "Unterbrochen" : state.phase === "recovery" ? "Nicht abgeschlossene Aufnahme" : state.phase === "finishing" ? "Aufnahme wird gesichert" : state.phase === "paused" ? "Aufnahme pausiert" : "Aufnahme läuft"}</CardTitle>
          <CardDescription>{state.meeting?.title || "Sitzung ohne Titel"}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="row between wrap">
            <span className="meeting-time" aria-label="Aufnahmedauer">{meetingClock(state.elapsed)}</span>
            <div className="row wrap">
              <LevelMeter label="Mikrofon" levels={state.levels} showLabel={state.systemAudio} />
              {state.systemAudio ? <LevelMeter label="Computer" levels={state.computerLevels} showLabel /> : null}
            </div>
          </div>
          {recording && state.systemAudioEnded ? <div className="data-notice stack" role="status">
            <p>Computerton wird nicht mehr aufgenommen</p>
            <Button variant="outline" onClick={() => { void controller?.addSystemAudio(); }}>Erneut freigeben</Button>
          </div> : null}
          {state.hint ? <p role="status" className="data-notice">{state.hint}</p> : null}
          {state.wakeHint ? <p className="field-hint">{state.wakeHint}</p> : null}
          <div className="stack meeting-upload" role="status" aria-live="polite">
            <p>gesichert bis {meetingClock(state.secured)}</p>
            <p className="field-hint">{state.offline ? "Offline — die Stücke bleiben lokal gesichert. Der Upload läuft weiter, sobald die Verbindung zurück ist." : state.pending ? `${state.pending} von ${state.total} Stücken warten auf den Upload.` : "Alle bisherigen Stücke sind auf dem Server gesichert."}</p>
            {state.uploadError && !state.offline ? <p className="field-hint">Upload fehlgeschlagen. Der nächste Versuch folgt automatisch.</p> : null}
            {state.phase === "finishing" ? <><progress aria-label="Upload-Fortschritt" value={state.total - state.pending} max={Math.max(1, state.total)} /><p className="field-hint">{state.offline ? "Warte auf Verbindung. Bitte diese App geöffnet lassen." : "Die Verarbeitung beginnt, sobald alle Stücke hochgeladen sind."}</p></> : null}
          </div>
          {recording ? <div className="row wrap meeting-actions">
            <Button variant="outline" onClick={() => { if (state.phase === "paused") void controller?.resume(); else void controller?.pause(); }}>
              {state.phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}{state.phase === "paused" ? "Fortsetzen" : "Pause"}
            </Button>
            <Button onClick={() => setConfirm("finish")}><Square aria-hidden />Beenden</Button>
          </div> : recovering ? <div className="row wrap meeting-actions">
            <Button disabled={dictationActive || !state.canResume || !!state.systemAudioChoice} onClick={() => { void controller?.resume(); }}><Play aria-hidden />Fortsetzen</Button>
            <Button variant="outline" onClick={() => { void controller?.finish(); }}>Jetzt verarbeiten</Button>
            <Button variant="ghost" onClick={() => setConfirm("discard")}>Verwerfen</Button>
            {dictationActive ? <p className="field-hint">Bitte zuerst das Diktat beenden.</p> : null}
          </div> : null}
        </CardContent>
      </Card> : null}

      {state.phase === "processing" ? <Card>
        <CardHeader><CardTitle>{state.result ? statuses[state.result.status] : statuses.queued}</CardTitle></CardHeader>
        <CardContent><progress aria-label="Verarbeitungsfortschritt" value={state.result?.progress ?? 0} max={100} /><p className="field-hint">Der Status wird alle fünf Sekunden aktualisiert.</p></CardContent>
      </Card> : null}
      {state.systemAudioChoice ? <div className="data-notice stack" role="alert">
        <p>{state.systemAudioChoice}</p>
        <div className="row wrap">
          <Button disabled={dictationActive} onClick={() => chooseAudio(true)}>Erneut versuchen</Button>
          <Button variant="outline" disabled={dictationActive} onClick={() => chooseAudio(false)}>Nur Mikrofon</Button>
        </div>
      </div> : null}
      {state.error && state.result?.status !== "error" ? <p role="alert" className="form-error">{state.error}</p> : null}
      {state.phase === "done" && state.result ? <Button variant="outline" onClick={() => { void controller?.reset(); }}>Neue Sitzung</Button> : null}
      <MeetingSessions source="recording" onResult={result => { void controller?.acceptResult(result); }} ownSpeakerName={ownSpeakerName} autoMeeting={state.phase === "done" || state.phase === "error" ? state.result : null} onDeleted={id => { void controller?.forgetDeleted(id); }} />
    </div>
  );
}

function LevelMeter({ label, levels, showLabel }: { label: string; levels: number[]; showLabel: boolean }) {
  return <div className="stack">
    {showLabel ? <span className="field-hint">{label}</span> : null}
    <div className="meeting-levels" aria-label={`${label}pegel`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((levels.at(-1) ?? 0) * 100)}>
      {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ transform: `scaleY(${(4 + (levels[index - (18 - levels.length)] ?? 0) * 24) / 28})` }} />)}
    </div>
  </div>;
}
