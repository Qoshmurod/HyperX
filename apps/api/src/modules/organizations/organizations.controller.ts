import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/auth/public.decorator';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  @RequirePermission('organizations.read')
  @Get()
  list() {
    // Phase 2: ma'lumotlar bazasidan RLS doirasida (app.scope_path) o'qish.
    return { items: [] };
  }
}
