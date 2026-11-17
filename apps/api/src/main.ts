import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { metricsMiddleware } from './modules/health/metrics';

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  // Nginx ortida: haqiqiy mijoz IP'si audit uchun.
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal');
  app.use(helmet());
  app.use(metricsMiddleware);
  app.useBodyParser('json', { limit: '5mb' });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const app = await createApp();
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('GovMind AI API')
      .setDescription('Davlat boshqaruvi uchun tahlil va qarorlarni qo\'llab-quvvatlash platformasi')
      .setVersion('v1')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'api-key')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  await app.listen(Number(process.env.API_PORT ?? 3001));
}

if (require.main === module) {
  void bootstrap();
}
