import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncDispatcher } from './sync.dispatcher';
import { SyncService } from './sync.service';

@Module({ controllers: [SyncController], providers: [SyncService, SyncDispatcher], exports: [SyncService, SyncDispatcher] })
export class SyncModule {}
