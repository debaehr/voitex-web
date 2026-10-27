import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { MeetingDetailData, MeetingResult, MeetingSummary } from "../lib/meeting-types";
import { isMeetingProcessing, meetingLabels, meetingMeta, meetingsBySource } from "../lib/meeting-presentation";
import { TwoLevel } from "./TwoLevel";
import { MeetingDetail } from "./MeetingDetail";
import { Badge, Button } from "./ui";
export function MeetingSessions({ source, autoMeeting, openId, ownSpeakerName, onDeleted, onResult }: {
  source: MeetingSummary["source"]; autoMeeting?: MeetingResult | null; openId?: string | null; ownSpeakerName?: string; onDeleted?: (id: string) => void; onResult?: (meeting: MeetingDetailData) => void;
}) {
  const [items, setItems] = useState<MeetingSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(openId ?? autoMeeting?.id ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setItems(await api.listMeetings()); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Sitzungen konnten nicht geladen werden."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (openId || autoMeeting?.id) { setActiveId(openId ?? autoMeeting!.id); void refresh(); } }, [openId, autoMeeting?.id, refresh]);
  useEffect(() => {
    if (!items.some(item => item.source === source && isMeetingProcessing(item.status))) return;
    const timer = setTimeout(() => void refresh(), 5000); return () => clearTimeout(timer);
  }, [items, refresh, source]);
  const initial = autoMeeting?.id === activeId ? { source, createdAt: new Date().toISOString(), transcript: "", parts: [], segments: [], speakerNames: {}, interruptions: [], ...autoMeeting } as MeetingDetailData : undefined;
  return <section className="meeting-sessions stack" aria-label={source === "recording" ? "Letzte Sitzungen" : "Transkripte"}>
    <h2 className="card-title">{source === "recording" ? "Letzte Sitzungen" : "Transkripte"}</h2>
    {error && <p role="alert" className="form-error">{error} <Button variant="ghost" onClick={() => void refresh()}>Erneut laden</Button></p>}
    <TwoLevel entries={meetingsBySource(items, source).map(item => ({ id: item.id, title: item.title || "Sitzung ohne Titel", subtitle: meetingMeta(item), badge: <Badge>{meetingLabels[item.status]}</Badge> }))}
      activeId={activeId} onSelect={setActiveId} onBack={() => setActiveId(null)}
      empty={loading ? "Sitzungen werden geladen …" : meetingsBySource(items, source).length ? "Eine Sitzung aus der Liste wählen." : "Noch keine Sitzungen. Hier erscheinen deine Transkripte und Protokolle."}>
      {activeId && <MeetingDetail key={activeId} id={activeId} initial={initial} ownSpeakerName={ownSpeakerName} onResult={onResult} onChanged={() => void refresh()} onDeleted={() => { setActiveId(null); onDeleted?.(activeId); }} />}
    </TwoLevel>
  </section>;
}
