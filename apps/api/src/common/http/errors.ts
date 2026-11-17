import { ConflictException } from '@nestjs/common';

export class VersionConflict extends ConflictException {
  constructor() {
    super('Record was changed by someone else (version mismatch) or not found');
  }
}
