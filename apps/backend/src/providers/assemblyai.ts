export type MeetingTranscript = {
  transcript: string;
  utterances: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
  provider: string;
  model: string;
};


type UploadResponse = {
  upload_url: string;
};

type TranscriptResponse = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text?: string;
  error?: string;
  utterances?: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
};

const baseUrl = "https://api.assemblyai.com";

export async function transcribeMeeting(input: { buffer: Buffer; mimetype: string }): Promise<MeetingTranscript> {
  const apiKey = apiKeyOrThrow();
  const uploadUrl = await uploadAudio(apiKey, input.buffer, input.mimetype);
  const transcriptId = await createTranscript(apiKey, {
    audioUrl: uploadUrl,
    speakerLabels: true,
    disfluencies: false
  });
  const transcript = await pollTranscript(apiKey, transcriptId);
  const utterances = transcript.utterances ?? [];

  return {
    transcript: formatUtterances(utterances, transcript.text ?? ""),
    utterances,
    provider: "AssemblyAI",
    model: "Universal-2 + speaker_labels"
  };
}

async function uploadAudio(apiKey: string, buffer: Buffer, mimetype: string) {
  const response = await fetch(`${baseUrl}/v2/upload`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": mimetype || "application/octet-stream"
    },
    body: buffer
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as UploadResponse;
  return data.upload_url;
}

async function createTranscript(
  apiKey: string,
  input: { audioUrl: string; speakerLabels: boolean; disfluencies: boolean }
) {
  const response = await fetch(`${baseUrl}/v2/transcript`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      audio_url: input.audioUrl,
      speech_models: ["universal-2"],
      speaker_labels: input.speakerLabels,
      disfluencies: input.disfluencies,
      language_code: "de"
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as TranscriptResponse;
  return data.id;
}

async function pollTranscript(apiKey: string, transcriptId: string) {
  // Hard timeout prevents endless polling when the upstream job stalls.
  const deadline = Date.now() + 12 * 60 * 1000;

  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/v2/transcript/${transcriptId}`, {
      headers: { Authorization: apiKey }
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = (await response.json()) as TranscriptResponse;

    if (data.status === "completed") {
      return data;
    }

    if (data.status === "error") {
      throw new Error(data.error || "AssemblyAI transcription failed.");
    }

    // AssemblyAI jobs are asynchronous; polling every 3s balances latency and rate limits.
    await wait(3000);
  }

  throw new Error("AssemblyAI transcription timed out.");
}

function formatUtterances(utterances: MeetingTranscript["utterances"], fallback: string) {
  if (!utterances.length) {
    return fallback;
  }

  return utterances.map((item) => `Sprecher ${item.speaker}: ${item.text}`).join("\n");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiKeyOrThrow() {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error("ASSEMBLYAI_API_KEY is not configured.");
  }

  return process.env.ASSEMBLYAI_API_KEY;
}
