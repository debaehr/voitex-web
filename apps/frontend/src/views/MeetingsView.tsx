import { useEffect, useState } from "react";
import { MeetingSessions } from "../components/MeetingSessions";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "../components/ui";
import { useSettings, SettingsNotice } from "../lib/settings-context";
import { parseParticipants } from "../lib/meeting-presentation";
import { readMeetingDuration, uploadMeetingFile, validateMeetingFile } from "../lib/meeting-file-upload";
import { languages } from "../lib/languages";

export function MeetingsView({ language = "de" }: { language?: string }) {
  const { settings, save, saving, status } = useSettings();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [participants, setParticipants] = useState("");
  const [ownName, setOwnName] = useState(settings?.ownSpeakerName ?? "");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => setOwnName(settings?.ownSpeakerName ?? ""), [settings?.ownSpeakerName]);
  async function upload() {
    if (!file || uploading) return;
    setError(""); setUploading(true); setProgress(0);
    try {
      validateMeetingFile(file);
      const names = parseParticipants(participants);
      const durationSeconds = await readMeetingDuration(file);
      const id = await uploadMeetingFile(file, { title: title.trim(), language: selectedLanguage, participants: names, durationSeconds }, setProgress);
      setOpenId(id); setFile(null); setTitle(""); setParticipants("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload fehlgeschlagen. Bitte erneut versuchen."); }
    finally { setUploading(false); }
  }
  return <div className="stack meeting-page">
    <Card><CardHeader><CardTitle>Datei transkribieren</CardTitle><CardDescription>Audiodatei hochladen, Sprecher zuordnen und ein Protokoll erstellen.</CardDescription></CardHeader><CardContent>
      <fieldset disabled={uploading} className="stack form-fields">
        <Field label="Audiodatei" htmlFor="meeting-file" hint="MP3, M4A, MP4, WAV, WebM, OGG oder FLAC · maximal 200 MB.">
          <Input id="meeting-file" type="file" accept=".mp3,.m4a,.mp4,.wav,.webm,.ogg,.flac" onChange={event => {
            const next = event.target.files?.[0]; setError(""); setFile(null);
            if (next) { try { validateMeetingFile(next); setFile(next); } catch (reason) { setError((reason as Error).message); } }
          }} />
        </Field>
        <Field label="Titel (optional)" htmlFor="upload-title"><Input id="upload-title" value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></Field>
        <Field label="Sprache" htmlFor="upload-language"><Select id="upload-language" value={selectedLanguage} onChange={event => setSelectedLanguage(event.target.value)}>{languages.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field>
        <Field label="Teilnehmende (optional)" htmlFor="upload-participants" hint="Durch Komma getrennt · maximal 20 Namen."><Input id="upload-participants" value={participants} onChange={event => setParticipants(event.target.value)} /></Field>
        <div><Button disabled={!file || uploading} onClick={() => void upload()}>{uploading ? "Wird hochgeladen …" : "Datei transkribieren"}</Button></div>
      </fieldset>
      {uploading && <div role="status" className="stack"><progress value={progress} max={100} aria-label="Upload-Fortschritt" /><p className="field-hint">{progress} % hochgeladen · Bitte diese Seite geöffnet lassen.</p></div>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Sprechervorschlag</CardTitle></CardHeader><CardContent>
      <Field label="Name der eigenen Stimme" htmlFor="own-speaker-name" hint="Wird bei der Zuordnung als Name vorgeschlagen."><Input id="own-speaker-name" value={ownName} maxLength={100} disabled={saving || status !== "ready"} onChange={event => setOwnName(event.target.value)} /></Field>
      <div><Button variant="outline" disabled={!settings || saving || status !== "ready" || ownName === settings.ownSpeakerName} onClick={() => {
        if (!settings) return; setError(""); setNotice("");
        void save({ ...settings, ownSpeakerName: ownName.trim() }).then(() => setNotice("Name gespeichert.")).catch(reason => setError(reason.message));
      }}>Namen speichern</Button></div>
      <SettingsNotice />{notice && <p role="status" className="field-hint">{notice}</p>}
      <p className="field-hint">Den Prompt für die Zusammenfassung kannst du unter Einstellungen → Modi &amp; Prompts bearbeiten.</p>
    </CardContent></Card>
    <MeetingSessions source="upload" openId={openId} ownSpeakerName={settings?.ownSpeakerName} />
  </div>;
}
