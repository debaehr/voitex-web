export class MicrophoneGate {
  private owner: "dictation" | "meeting" | null = null;
  acquire(owner: "dictation" | "meeting") {
    if (this.owner) return false;
    this.owner = owner; return true;
  }
  release(owner: "dictation" | "meeting") { if (this.owner === owner) this.owner = null; }
}
