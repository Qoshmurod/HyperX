import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../db/db.service';

/** Kritik tizim xatolari haqida super adminlarga tizim ichida xabar (soatiga bir marta, turi bo'yicha). */
@Injectable()
export class SystemAlerts {
  private readonly logger = new Logger('SystemAlerts');

  constructor(private readonly db: DbService) {}

  report(error: unknown) {
    const name = error instanceof Error ? error.name : 'Error';
    const hour = new Date().toISOString().slice(0, 13);
    void this.db
      .system((tx) =>
        tx.query(
          `INSERT INTO core.notifications (user_id, kind, severity, title, body, dedupe_key)
           SELECT DISTINCT ur.user_id, 'system_error', 'critical', 'Kritik tizim xatosi', $1, 'syserr:' || $2 || ':' || ur.user_id
           FROM iam.user_roles ur JOIN iam.roles r ON r.id = ur.role_id
           WHERE r.code = 'super_admin'
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [`${name} — tafsilotlar server jurnalida`, `${name}:${hour}`],
        ),
      )
      .catch((e) => this.logger.warn(`alert not stored: ${e}`));
  }
}
