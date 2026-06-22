import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OffSiteController } from './off-site.controller';
import { OffSiteService } from './off-site.service';

@Module({
  imports: [PrismaModule, AuditLogModule, AuthModule],
  controllers: [OffSiteController],
  providers: [OffSiteService],
  exports: [OffSiteService],
})
export class OffSiteModule {}
