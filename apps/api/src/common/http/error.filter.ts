import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { DatabaseError } from 'pg';
import { SystemAlerts } from './system-alerts';

const PG_STATUS: Record<string, [number, string]> = {
  '23505': [HttpStatus.CONFLICT, 'Already exists'],
  '23503': [HttpStatus.BAD_REQUEST, 'Referenced record not found'],
  '23514': [HttpStatus.BAD_REQUEST, 'Constraint violated'],
  '23502': [HttpStatus.BAD_REQUEST, 'Required value missing'],
  '22P02': [HttpStatus.BAD_REQUEST, 'Invalid value'],
  '42501': [HttpStatus.FORBIDDEN, 'Forbidden'],
};

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  constructor(private readonly alerts?: SystemAlerts) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    if (exception instanceof DatabaseError && exception.code && PG_STATUS[exception.code]) {
      const [status, message] = PG_STATUS[exception.code];
      res.status(status).json({ statusCode: status, message, constraint: exception.constraint });
      return;
    }

    // Ichki xato tafsilotlari mijozga chiqarilmaydi.
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    this.alerts?.report(exception);
    res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
