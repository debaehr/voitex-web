import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import { browserMeetingEnvironment } from "./meeting-browser";
import { initialMeetingSnapshot, MeetingRecorder } from "./meeting-recorder";
import { IndexedMeetingStore } from "./meeting-store";
import { browserQueueEnvironment } from "./meeting-upload";
import type { MicrophoneGate } from "./microphone";

const emptySubscribe = () => () => {};
const emptySnapshot = () => initialMeetingSnapshot;
export function useMeetingRecorder(microphone: MicrophoneGate) {
  const [controller, setController] = useState<MeetingRecorder | null>(null);
  useEffect(() => {
    const next = new MeetingRecorder(new IndexedMeetingStore(), api, browserMeetingEnvironment(), microphone, browserQueueEnvironment);
    setController(next); void next.initialize();
    return () => { void next.dispose(); };
  }, [microphone]);
  const state = useSyncExternalStore(controller?.subscribe ?? emptySubscribe, controller?.getSnapshot ?? emptySnapshot, emptySnapshot);
  useEffect(() => {
    if (!state.active && state.phase !== "finishing") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.active, state.phase]);
  return { state, controller };
}
