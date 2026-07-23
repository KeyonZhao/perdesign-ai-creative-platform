const STORAGE_KEY = "perdesign-pending-image-jobs-v1";
const MAX_PENDING_JOB_AGE_MS = 48 * 60 * 60 * 1000;

export type PendingImageJob = {
  jobId: string;
  batchId: string;
  prompt: string;
  sequence: number;
  createdAt: number;
};

export function loadPendingImageJobs(): PendingImageJob[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const jobs = parsed.filter(
      (value): value is PendingImageJob =>
        isPendingImageJob(value) && now - value.createdAt <= MAX_PENDING_JOB_AGE_MS
    );
    if (jobs.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    }
    return jobs;
  } catch {
    return [];
  }
}

export function addPendingImageJob(job: PendingImageJob) {
  const jobs = loadPendingImageJobs().filter((item) => item.jobId !== job.jobId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...jobs, job]));
}

export function removePendingImageJob(jobId: string) {
  const jobs = loadPendingImageJobs().filter((item) => item.jobId !== jobId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function isPendingImageJob(value: unknown): value is PendingImageJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.jobId === "string" &&
    typeof record.batchId === "string" &&
    typeof record.prompt === "string" &&
    typeof record.sequence === "number" &&
    typeof record.createdAt === "number"
  );
}
