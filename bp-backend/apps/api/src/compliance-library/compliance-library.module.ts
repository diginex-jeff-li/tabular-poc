import { Module } from '@nestjs/common';
import { ComplianceLibraryController } from './controllers/compliance-library.controller.js';
import { ComplianceLibraryService } from './services/compliance-library.service.js';

@Module({
  controllers: [ComplianceLibraryController],
  providers: [ComplianceLibraryService],
  exports: [ComplianceLibraryService],
})
export class ComplianceLibraryModule {}
