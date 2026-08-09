import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  BulkSaveRequestType,
  ListComplianceLibraryRequestType,
} from 'bp-contracts/compliance-library/requests';
import type {
  BulkSaveResponseType,
  ListComplianceLibraryResponseType,
} from 'bp-contracts/compliance-library/responses';
import type { ComplianceLibraryType } from 'bp-contracts/compliance-library/schemas';
import {
  ComplianceLibrarySchema,
} from 'bp-contracts/compliance-library/schemas';
import { ZodError } from 'zod';

type StoreItem = ComplianceLibraryType;

@Injectable()
export class ComplianceLibraryService implements OnModuleInit {
  private readonly store: Map<string, StoreItem> = new Map();

  onModuleInit(): void {
    this.seed();
  }

  private seed(): void {
    const now = new Date().toISOString();
    const samples: Omit<StoreItem, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        categoryCode: 'A',
        complianceCategory: 'Governance',
        topic: 'Key Compliance Requirements',
        riskLevel: 'High',
        issue: 'Ensure all suppliers are aware of key compliance requirements before onboarding.',
        closureTiming: '7',
        evidenceExpectation: 'Signed compliance acknowledgment form from each supplier.',
        bestPractice: 'Conduct annual refresher training on key compliance requirements.',
      },
      {
        categoryCode: 'B',
        complianceCategory: 'Social',
        topic: 'Freedom of Association',
        riskLevel: 'High',
        issue: 'Workers must have the right to form and join trade unions without interference.',
        closureTiming: '30',
        evidenceExpectation: 'Union registration documents or worker committee meeting minutes.',
        bestPractice: 'Establish a worker-management committee that meets quarterly.',
      },
      {
        categoryCode: 'C',
        complianceCategory: 'Social',
        topic: 'Wages & Benefits',
        riskLevel: 'Medium',
        issue: 'All workers must receive at least the legal minimum wage for regular and overtime hours.',
        closureTiming: '30',
        evidenceExpectation: 'Payroll records and bank transfer receipts for the last 3 months.',
        bestPractice: 'Implement digital payroll system with automated minimum wage compliance checks.',
      },
      {
        categoryCode: 'D',
        complianceCategory: 'Social',
        topic: 'Working Hours',
        riskLevel: 'Medium',
        issue: 'Weekly working hours must not exceed legal limits, including overtime.',
        closureTiming: '60',
        evidenceExpectation: 'Time and attendance records for all workers over the past 6 months.',
        bestPractice: 'Use biometric time tracking to ensure accurate working hour records.',
      },
      {
        categoryCode: 'E',
        complianceCategory: 'Environment',
        topic: 'Environmental Responsibility',
        riskLevel: 'Low',
        issue: 'Suppliers must have an environmental management plan in place.',
        closureTiming: '90',
        evidenceExpectation: 'Copy of environmental management plan or ISO 14001 certification.',
        bestPractice: 'Set annual environmental improvement targets and track progress.',
      },
    ];

    for (const sample of samples) {
      const id = randomUUID();
      this.store.set(id, {
        id,
        ...sample,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async listComplianceLibrary(
    input: ListComplianceLibraryRequestType,
  ): Promise<ListComplianceLibraryResponseType> {
    const { page, perPage } = input;
    const allItems = Array.from(this.store.values());

    allItems.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = allItems.length;
    const lastPage = Math.ceil(total / perPage) || 1;
    const start = (page - 1) * perPage;
    const data = allItems.slice(start, start + perPage);

    return {
      data,
      meta: {
        total,
        lastPage,
        perPage,
        currentPage: page,
      },
    };
  }

  async bulkSaveComplianceLibrary(
    input: BulkSaveRequestType,
  ): Promise<BulkSaveResponseType> {
    const { upserts, deletes } = input;

    const errors: { row: number; field: string; message: string }[] = [];

    for (let i = 0; i < upserts.length; i++) {
      const rawItem = upserts[i] as Record<string, unknown>;
      const result = ComplianceLibrarySchema.safeParse({
        ...rawItem,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (!result.success) {
        const zodError = result.error as ZodError;
        for (const issue of zodError.issues) {
          errors.push({
            row: i,
            field: issue.path.join('.'),
            message: issue.message,
          });
        }
      }
    }

    if (errors.length > 0) {
      return { errors, saved: 0 };
    }

    const now = new Date().toISOString();

    for (const rawItem of upserts) {
      const item = rawItem as unknown as ComplianceLibraryType;
      const existing = this.store.get(item.id);
      if (existing) {
        this.store.set(item.id, {
          ...item,
          createdAt: existing.createdAt,
          updatedAt: now,
        });
      } else {
        this.store.set(item.id, {
          ...item,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const id of deletes) {
      this.store.delete(id);
    }

    return { errors: [], saved: upserts.length };
  }
}
