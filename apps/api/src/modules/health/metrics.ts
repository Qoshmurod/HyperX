import { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'govmind_api_' });

export const httpDuration = new Histogram({
  name: 'govmind_api_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 60],
  registers: [registry],
});

export const syncQueue = new Gauge({
  name: 'govmind_sync_queue',
  help: 'Outbox events waiting and open conflicts',
  labelNames: ['state'],
  registers: [registry],
});

export const deliveriesQueue = new Gauge({
  name: 'govmind_delivery_queue',
  help: 'Notification and webhook delivery queues',
  labelNames: ['kind', 'state'],
  registers: [registry],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    // Marshrut shabloni (ID'larsiz) — yuqori kardinallikdan saqlanish uchun.
    const route = (req.route?.path as string | undefined) ?? 'unmatched';
    end({ method: req.method, route: `${req.baseUrl ?? ''}${route}`, status: String(res.statusCode) });
  });
  next();
}
