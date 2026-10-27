import type { BuiltinMode, CustomMode, Provider, Settings } from "./types";

export const builtinModes: { id: BuiltinMode; label: string; description: string }[] = [
  { id: "original", label: "Original", description: "Sprache in Text umwandeln, sprachlich bereinigt." },
  { id: "casual", label: "Casual", description: "Locker formuliert, z. B. für Chat-Nachrichten." },
  { id: "formal", label: "Formal", description: "Sachlich und vollständig, z. B. für E-Mails." },
  { id: "coding", label: "Coding", description: "Präzise Anweisung für Coding-Agenten." },
];
export interface AvailableMode {
  id: string;
  label: string;
  description: string;
  prompt: string;
  provider: Provider;
  builtin?: BuiltinMode;
}

// All selection surfaces use this order, including the unsaved settings draft.
export function availableDictationModes(settings: Settings | null): AvailableMode[] {
  return [
    ...builtinModes.filter(mode => !settings?.hiddenModes?.includes(mode.id)).map(mode => ({
      ...mode,
      builtin: mode.id,
      prompt: settings?.prompts[mode.id] ?? "",
      provider: settings?.providers[mode.id] ?? "openai",
    })),
    ...(settings?.customModes ?? []).map(mode => ({ ...mode, description: mode.description ?? "" })),
  ];
}

export function resolveMode(id: string, modes: Pick<AvailableMode, "id">[]): string {
  return modes.find(mode => mode.id === id)?.id ??
    modes.find(mode => mode.id === "formal")?.id ?? modes[0]?.id ?? "";
}

export function addCustomMode(settings: Settings): Settings {
  if ((settings.customModes?.length ?? 0) >= 20) return settings;
  return { ...settings, customModes: [...(settings.customModes ?? []), {
    id: `custom-${crypto.randomUUID()}`, label: "", description: "", prompt: "", provider: "openai",
  }] };
}

export function updateCustomMode(settings: Settings, id: string, changes: Partial<Omit<CustomMode, "id">>): Settings {
  return { ...settings, customModes: (settings.customModes ?? []).map(mode => mode.id === id ? { ...mode, ...changes } : mode) };
}

export function deleteMode(settings: Settings, id: string): Settings {
  const modes = availableDictationModes(settings);
  const mode = modes.find(item => item.id === id);
  if (modes.length <= 1 || !mode) return settings;
  if (mode.builtin) return { ...settings, hiddenModes: [...(settings.hiddenModes ?? []), mode.builtin] };
  return { ...settings, customModes: (settings.customModes ?? []).filter(item => item.id !== id) };
}

export function restoreBuiltinModes(settings: Settings): Settings {
  return { ...settings, hiddenModes: [] };
}

export interface ModeErrors { label?: string; description?: string; prompt?: string }
export function customModeErrors(mode: CustomMode, modes: CustomMode[]): ModeErrors {
  const errors: ModeErrors = {};
  if (!mode.label.trim()) errors.label = "Bitte einen Namen eingeben.";
  else if (mode.label.length > 40) errors.label = "Der Name darf höchstens 40 Zeichen haben.";
  else if (modes.some(other => other.id !== mode.id && other.label.trim().toLowerCase() === mode.label.trim().toLowerCase()))
    errors.label = "Dieser Name wird bereits verwendet. Bitte einen anderen Namen wählen.";
  if ((mode.description?.length ?? 0) > 120) errors.description = "Die Beschreibung darf höchstens 120 Zeichen haben.";
  if (!mode.prompt.trim()) errors.prompt = "Bitte einen Prompt eingeben.";
  else if (mode.prompt.length > 8000) errors.prompt = "Der Prompt darf höchstens 8000 Zeichen haben.";
  return errors;
}

export function hasModeErrors(settings: Settings): boolean {
  const modes = settings.customModes ?? [];
  return modes.length > 20 || availableDictationModes(settings).length === 0 ||
    modes.some(mode => Object.keys(customModeErrors(mode, modes)).length > 0);
}
