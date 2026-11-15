export const ALLOWED_MIME = new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif","video/mp4","video/quicktime"]);
export const ALLOWED_EXT  = new Set(["jpg","jpeg","png","webp","heic","heif","mp4","mov"]);
export const MAX_PHOTO = 30  * 1024 * 1024;
export const MAX_VIDEO = 1024 * 1024 * 1024;

export function inferMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string,string> = { jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",heic:"image/heic",heif:"image/heif",mp4:"video/mp4",mov:"video/quicktime" };
  return map[ext] ?? "application/octet-stream";
}

export function putWithProgress(url: string, body: File|Blob, contentType: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded/e.total*100)); };
    xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error — check your connection"));
    xhr.send(body);
  });
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: Error = new Error("Failed");
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e: any) {
      last = e;
      if (/401|403|not allowed|too large/i.test(e.message ?? "")) throw e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw last;
}

export function generateThumb(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith("video/") || /\.(mov|mp4)$/i.test(file.name)) {
      const video = document.createElement("video");
      video.src = url; video.muted = true; video.playsInline = true;
      const t = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error("Video thumbnail timeout")); }, 15000);
      video.onloadeddata = () => { video.currentTime = 0.5; };
      video.onseeked = () => {
        clearTimeout(t);
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth || 400, 400);
        canvas.height = Math.round(canvas.width * (video.videoHeight||300) / (video.videoWidth||400));
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), width: video.videoWidth, height: video.videoHeight });
        URL.revokeObjectURL(url);
      };
      video.onerror = () => { clearTimeout(t); URL.revokeObjectURL(url); reject(new Error("Could not read video")); };
    } else {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(img.naturalWidth, 400);
        canvas.height = Math.round(canvas.width * img.naturalHeight / img.naturalWidth);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
      img.src = url;
    }
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then(r => r.blob());
}

export function fmtSize(bytes: number) {
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

export type UploadItem = { id: string; file: File; status: "waiting"|"uploading"|"done"|"failed"; progress: number; error?: string; };
