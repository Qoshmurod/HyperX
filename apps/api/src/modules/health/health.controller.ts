import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'govmind-api',
      nodeRole: process.env.GOVMIND_NODE_ROLE ?? 'local',
      time: new Date().toISOString(),
    };
  }
}
