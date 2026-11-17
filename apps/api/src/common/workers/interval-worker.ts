import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

/**
 * Oddiy davriy ishchi. Bir nechta API nusxasi ishlasa, har bir vazifa ichida
 * pg_try_advisory_xact_lock va dedupe kalitlari takroriy bajarilishdan himoya qiladi.
 */
export abstract class IntervalWorker implements OnModuleInit, OnModuleDestroy {
  protected readonly logger = new Logger(this.constructor.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  protected abstract readonly intervalMs: number;
  protected abstract readonly enabled: boolean;
  abstract tick(): Promise<void>;

  onModuleInit() {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.safeTick(), this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async safeTick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(err instanceof Error ? err.stack : String(err));
    } finally {
      this.running = false;
    }
  }
}

export function backoffSeconds(attempt: number, cap = 3600): number {
  return Math.min(cap, 2 ** Math.min(attempt, 12) * 5);
}
