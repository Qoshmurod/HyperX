import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { WebhookWorker } from './webhook.worker';

@Module({ controllers: [IntegrationsController], providers: [WebhookWorker], exports: [WebhookWorker] })
export class IntegrationsModule {}
