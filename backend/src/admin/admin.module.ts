import { Module } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController],
  providers: [AdminRepository, AdminService, AdminGuard],
})
export class AdminModule {}
