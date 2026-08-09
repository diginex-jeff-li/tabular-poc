import { Controller } from '@nestjs/common';
import { implement, Implement } from '@orpc/nest';
import { complianceLibraryRoutes } from 'bp-contracts/compliance-library/routes';
import { ComplianceLibraryService } from '../services/compliance-library.service.js';

@Controller()
export class ComplianceLibraryController {
  constructor(
    private readonly complianceLibraryService: ComplianceLibraryService,
  ) {}

  @Implement(complianceLibraryRoutes.listComplianceLibrary)
  listComplianceLibrary() {
    return implement(
      complianceLibraryRoutes.listComplianceLibrary,
    ).handler(({ input }) => {
      return this.complianceLibraryService.listComplianceLibrary(input);
    });
  }

  @Implement(complianceLibraryRoutes.bulkSaveComplianceLibrary)
  bulkSaveComplianceLibrary() {
    return implement(
      complianceLibraryRoutes.bulkSaveComplianceLibrary,
    ).handler(({ input }) => {
      return this.complianceLibraryService.bulkSaveComplianceLibrary(input);
    });
  }
}
