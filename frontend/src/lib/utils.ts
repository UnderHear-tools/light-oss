import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const browserDownloadTriggerDelayMs = 150;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function downloadFile(url: string, filename?: string) {
  const link = document.createElement("a");

  try {
    link.href = url;
    if (filename) {
      link.download = filename;
    }
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    await wait(browserDownloadTriggerDelayMs);
  } finally {
    link.remove();
  }
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}
