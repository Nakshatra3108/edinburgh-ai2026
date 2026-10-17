import type { Request, Response } from "./protocol";
type Payload = Request extends infer R
  ? R extends Request
    ? Omit<R, "id">
    : never
  : never;
export class WorkerClient {
  private seq = 0;
  private pending = new Map<
    number,
    {
      resolve: (result: Response) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private worker: Worker,
    private progress: (message: string) => void,
  ) {
    worker.onmessage = ({ data }: MessageEvent<Response>) => {
      if (data.type === "progress") {
        this.progress(data.message);
        return;
      }
      const entry = this.pending.get(data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(data.id);
      if (data.type === "error") entry.reject(new Error(data.message));
      else entry.resolve(data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.fail(new Error(event.message || "Inference worker failed"));
    };
    worker.onmessageerror = () =>
      this.fail(new Error("Could not decode worker response"));
  }
  request(
    payload: Payload,
    transfer: Transferable[] = [],
    timeout = 300_000,
  ): Promise<Response> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Model operation timed out. Reset models to retry."));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage({ ...payload, id }, transfer);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  private fail(error: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
  }
  dispose() {
    this.worker.terminate();
    this.fail(new Error("Worker reset"));
  }
}
