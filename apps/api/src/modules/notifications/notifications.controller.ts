import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthPrincipal } from '../../common/auth/principal';
import { CurrentPrincipal } from '../../common/auth/public.decorator';
import { DbService, one, rows } from '../../common/db/db.service';
import { ZodPipe } from '../../common/http/zod.pipe';

const prefsBody = z.object({
  email_enabled: z.boolean(),
  telegram_enabled: z.boolean(),
  telegram_chat_id: z.string().regex(/^-?\d{3,20}$/).nullable(),
  min_severity: z.enum(['info', 'warning', 'critical']),
});

/** Har bir foydalanuvchi faqat o'z bildirishnomalarini ko'radi. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly db: DbService) {}

  @Get()
  list(@CurrentPrincipal() p: AuthPrincipal, @Query('unread') unread?: string) {
    return this.db.system(async (tx) => ({
      items: await rows(
        tx,
        `SELECT id, kind, severity, title, body, link, read_at, created_at FROM core.notifications
         WHERE user_id = $1 AND ($2 = false OR read_at IS NULL) ORDER BY created_at DESC LIMIT 200`,
        [p.actorId, unread === 'true'],
      ),
      unread: (await one<{ n: number }>(tx, 'SELECT count(*)::int AS n FROM core.notifications WHERE user_id = $1 AND read_at IS NULL', [p.actorId]))!.n,
    }));
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.system((tx) => tx.query('UPDATE core.notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL', [id, p.actorId]));
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentPrincipal() p: AuthPrincipal) {
    await this.db.system((tx) => tx.query('UPDATE core.notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [p.actorId]));
  }

  @Get('preferences')
  prefs(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.system(
      async (tx) =>
        (await one(tx, 'SELECT email_enabled, telegram_enabled, telegram_chat_id, min_severity FROM core.notification_preferences WHERE user_id = $1', [p.actorId])) ?? {
          email_enabled: true, telegram_enabled: false, telegram_chat_id: null, min_severity: 'info',
        },
    );
  }

  @Put('preferences')
  savePrefs(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(prefsBody)) body: z.infer<typeof prefsBody>) {
    return this.db.system((tx) =>
      one(
        tx,
        `INSERT INTO core.notification_preferences (user_id, email_enabled, telegram_enabled, telegram_chat_id, min_severity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET email_enabled = EXCLUDED.email_enabled, telegram_enabled = EXCLUDED.telegram_enabled,
           telegram_chat_id = EXCLUDED.telegram_chat_id, min_severity = EXCLUDED.min_severity, updated_at = now()
         RETURNING email_enabled, telegram_enabled, telegram_chat_id, min_severity`,
        [p.actorId, body.email_enabled, body.telegram_enabled, body.telegram_chat_id, body.min_severity],
      ),
    );
  }
}
