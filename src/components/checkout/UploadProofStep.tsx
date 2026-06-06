import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, X, ArrowLeft, AlertTriangle, FileText, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
type AllowedMime = (typeof ALLOWED_MIMES)[number];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_LONG_EDGE = 2000;

export type ProofErrorKind =
  | "wrong-type"
  | "oversize"
  | "network-failed"
  | "server-rejected"
  | "status-mismatch"
  | "mime-mismatch"
  | null;

const ERROR_COPY: Record<Exclude<ProofErrorKind, null>, { title: string; body: string }> = {
  "wrong-type": {
    title: "Unsupported file type",
    body: "Upload a JPG, PNG, WebP, or PDF.",
  },
  oversize: {
    title: "File is too large",
    body: "The maximum size is 10 MB. Try a smaller screenshot or a compressed PDF.",
  },
  "network-failed": {
    title: "Upload failed — network issue",
    body: "Check your connection and tap Retry. Your file is still selected.",
  },
  "server-rejected": {
    title: "We couldn't accept this proof",
    body: "Something went wrong on our side. Try again, or contact support on 01226399207 if it persists.",
  },
  "status-mismatch": {
    title: "This checkout already has a verified proof",
    body: "Refresh the page to see the latest status.",
  },
  "mime-mismatch": {
    title: "File contents don't match its extension",
    body: "The file looks corrupted or has been renamed. Try a fresh export.",
  },
};

export type RequestUploadUrlInput = {
  contentType: AllowedMime;
  byteSize: number;
};
export type RequestUploadUrlResult = {
  uploadUrl: string;
  storagePath: string;
};

export type FinalizeInput = {
  storagePath: string;
  declaredContentType: AllowedMime;
  paymentMethodId: string;
  referenceNumber: string;
  notes?: string;
};

export type UploadProofStepProps = {
  referenceCode: string;
  selectedMethodLabel?: string | null;
  selectedMethodId: string | null;
  amountLabel: string;
  usdLabel: string;
  initialReference?: string;
  initialNotes?: string;
  showRejectedNotice?: boolean;
  onBack: () => void;
  onRequestUploadUrl: (input: RequestUploadUrlInput) => Promise<RequestUploadUrlResult>;
  onFinalize: (input: FinalizeInput) => Promise<unknown>;
  onSuccess: () => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function parseServerError(err: unknown): {
  code: string;
  message: string;
  status?: string;
} {
  if (!(err instanceof Error)) {
    return { code: "TRANSIENT", message: "Something went wrong." };
  }
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed === "object" && typeof parsed.code === "string") {
      return {
        code: parsed.code,
        message: typeof parsed.message === "string" ? parsed.message : err.message,
        status: typeof parsed.status === "string" ? parsed.status : undefined,
      };
    }
  } catch {
    // not structured
  }
  return { code: "TRANSIENT", message: err.message };
}

async function preprocessImage(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;
  if (typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;
    const { width, height } = bitmap;
    const longest = Math.max(width, height);
    const scale = longest > MAX_LONG_EDGE ? MAX_LONG_EDGE / longest : 1;
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const quality = outType === "image/jpeg" ? 0.9 : undefined;
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), outType, quality),
    );
    if (!blob || blob.size > file.size * 1.1) return file;
    const renamed = file.name.replace(/\.[^.]+$/, outType === "image/png" ? ".png" : ".jpg");
    return new File([blob], renamed, { type: outType });
  } catch {
    return file;
  }
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload rejected (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.send(file);
  });
}

export function UploadProofStep({
  referenceCode,
  selectedMethodLabel,
  selectedMethodId,
  amountLabel,
  usdLabel,
  initialReference = "",
  initialNotes = "",
  showRejectedNotice = false,
  onBack,
  onRequestUploadUrl,
  onFinalize,
  onSuccess,
}: UploadProofStepProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [phase, setPhase] = useState<"idle" | "preprocess" | "signing" | "uploading" | "finalising">("idle");
  const [error, setError] = useState<ProofErrorKind>(null);
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [reference, setReference] = useState(initialReference);
  const [notes, setNotes] = useState(initialNotes);
  const inputRef = useRef<HTMLInputElement>(null);

  const isImage = useMemo(() => !!file && file.type.startsWith("image/"), [file]);

  useEffect(() => {
    if (!file || file.type === "application/pdf") {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const setFromPicker = (f: File | null) => {
    setError(null);
    setErrorDetail("");
    setProgress(0);
    if (!f) {
      setFile(null);
      return;
    }
    if (!ALLOWED_MIMES.includes(f.type as AllowedMime)) {
      setFile(null);
      setError("wrong-type");
      return;
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      setError("oversize");
      return;
    }
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    setFromPicker(f);
  };

  const busy = phase !== "idle";
  const canSubmit = !!file && !!selectedMethodId && reference.trim().length >= 3 && !busy;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selectedMethodId) return;
    setError(null);
    setErrorDetail("");
    setProgress(0);
    try {
      setPhase("preprocess");
      const processed = await preprocessImage(file);
      const contentType = processed.type as AllowedMime;

      setPhase("signing");
      const { uploadUrl, storagePath } = await onRequestUploadUrl({
        contentType,
        byteSize: processed.size,
      });

      setPhase("uploading");
      try {
        await uploadWithProgress(uploadUrl, processed, setProgress);
      } catch {
        setError("network-failed");
        setPhase("idle");
        return;
      }

      setPhase("finalising");
      try {
        await onFinalize({
          storagePath,
          declaredContentType: contentType,
          paymentMethodId: selectedMethodId,
          referenceNumber: reference.trim(),
          notes: notes.trim() ? notes.trim() : undefined,
        });
      } catch (err) {
        const parsed = parseServerError(err);
        setErrorDetail(parsed.message);
        if (parsed.code === "WRONG_STATUS") setError("status-mismatch");
        else if (parsed.code === "MIME_MISMATCH") setError("mime-mismatch");
        else if (parsed.code === "OVERSIZE") setError("oversize");
        else if (parsed.code === "WRONG_TYPE") setError("wrong-type");
        else setError("server-rejected");
        setPhase("idle");
        return;
      }

      setPhase("idle");
      onSuccess();
    } catch (err) {
      setErrorDetail(err instanceof Error ? err.message : "");
      setError("server-rejected");
      setPhase("idle");
    }
  };

  const onRetry = () => {
    setError(null);
    setErrorDetail("");
    setProgress(0);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Submit your proof</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a screenshot of your transfer and the bank's reference number.
        </p>
      </div>

      {showRejectedNotice && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium text-destructive">Your previous proof was rejected</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Please double-check the reference and resubmit.
          </p>
        </div>
      )}

      <div className="rounded-md border border-border bg-accent/30 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            <span className="text-muted-foreground">Method:</span>{" "}
            <span className="font-medium text-foreground">{selectedMethodLabel ?? "—"}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Amount:</span>{" "}
            <span className="font-medium text-foreground">{amountLabel}</span>{" "}
            <span className="text-muted-foreground">({usdLabel})</span>
          </span>
          <span>
            <span className="text-muted-foreground">Ref:</span>{" "}
            <span className="font-mono text-foreground">{referenceCode || "—"}</span>
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ref">Transaction reference / SMS code</Label>
        <Input
          id="ref"
          required
          minLength={3}
          maxLength={80}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. 982341"
        />
      </div>

      <div className="space-y-2">
        <Label>Receipt screenshot or PDF</Label>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="sr-only"
          onChange={(e) => setFromPicker(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3 min-h-[88px]">
            {isImage && previewUrl ? (
              <img
                src={previewUrl}
                alt="Selected receipt preview"
                className="size-16 rounded object-cover border border-border"
              />
            ) : (
              <div className="size-16 rounded border border-border bg-background flex items-center justify-center text-muted-foreground">
                {file.type === "application/pdf" ? (
                  <FileText className="size-6" />
                ) : (
                  <ImageIcon className="size-6" />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {file.type.replace("application/", "").replace("image/", "").toUpperCase()} ·{" "}
                {formatBytes(file.size)}
              </div>
              {busy && (
                <div className="mt-2">
                  <div
                    className="h-1.5 w-full overflow-hidden rounded bg-border"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${phase === "uploading" ? progress : phase === "finalising" ? 100 : 5}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {phase === "preprocess" && "Preparing file…"}
                    {phase === "signing" && "Requesting secure upload…"}
                    {phase === "uploading" && `Uploading… ${progress}%`}
                    {phase === "finalising" && "Verifying upload…"}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label="Remove file"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={
              "flex w-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-sm transition-colors " +
              (dragOver
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-accent/40")
            }
            aria-label="Upload payment proof"
          >
            <Upload className="size-5" />
            <span className="font-medium text-foreground">
              Drag a file here, or click to choose
            </span>
            <span className="text-xs">JPG · PNG · WebP · PDF — max 10 MB</span>
          </button>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="size-4 mt-0.5 flex-none" />
            <div className="space-y-0.5">
              <p className="font-medium">{ERROR_COPY[error].title}</p>
              <p className="text-xs text-muted-foreground">
                {ERROR_COPY[error].body}
                {errorDetail && error === "server-rejected" ? ` (${errorDetail})` : ""}
              </p>
              {error === "network-failed" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={onRetry}
                >
                  Dismiss
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="proof-notes">Notes (optional)</Label>
        <Textarea
          id="proof-notes"
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Sender name, time of transfer, etc."
        />
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft className="size-3 mr-1.5" /> Back to instructions
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {busy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
          {phase === "uploading"
            ? `Uploading ${progress}%`
            : phase === "finalising"
              ? "Verifying…"
              : phase === "signing"
                ? "Preparing…"
                : phase === "preprocess"
                  ? "Preparing…"
                  : "Send for review"}
        </Button>
      </div>
    </form>
  );
}