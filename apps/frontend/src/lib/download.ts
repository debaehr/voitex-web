export function downloadFile(
  filename: string,
  content: string,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Defer revocation so browsers have time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
