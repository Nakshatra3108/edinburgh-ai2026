/** One in flight + latest pending; invalidation suppresses late results, not just pending jobs. */
export class LatestQueue<T, R> {
  private pending: T | undefined;
  private running = false;
  private generation = 0;
  constructor(
    private work: (item: T) => Promise<R>,
    private result: (result: R, item: T) => void,
    private error: (error: unknown) => void,
    private backlog: (busy: boolean) => void = () => {},
  ) {}
  push(item: T) {
    this.pending = item;
    if (this.running) {
      this.backlog(true);
      return;
    }
    void this.drain();
  }
  clear() {
    this.generation++;
    this.pending = undefined;
    this.backlog(false);
  }
  private async drain() {
    this.running = true;
    try {
      while (this.pending !== undefined) {
        const item = this.pending,
          generation = this.generation;
        this.pending = undefined;
        try {
          const result = await this.work(item);
          if (generation === this.generation) this.result(result, item);
        } catch (error) {
          if (generation === this.generation) this.error(error);
        }
      }
    } finally {
      this.running = false;
      this.backlog(false);
    }
  }
}
