export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function splitList(text: string | undefined): string[] {
  return (text ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}
