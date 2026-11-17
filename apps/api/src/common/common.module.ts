import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config';
import { AiEngineClient } from './ai/ai-engine.client';
import { AuditService } from './audit/audit.service';
import { PrincipalLoader } from './auth/principal-loader';
import { TokenVerifier } from './auth/token-verifier';
import { CryptoService } from './crypto/crypto.service';
import { DbService } from './db/db.service';
import { EventsService } from './events/events.service';
import { SystemAlerts } from './http/system-alerts';
import { StorageService } from './storage/storage.service';

const providers = [
  DbService,
  AuditService,
  CryptoService,
  StorageService,
  TokenVerifier,
  PrincipalLoader,
  EventsService,
  AiEngineClient,
  SystemAlerts,
];

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }, ...providers],
  exports: [APP_CONFIG, ...providers],
})
export class CommonModule {}
