import { Module } from '@nestjs/common';
import { InformationController } from './information.controller';
import { InformationService } from './information.service';
import { HttpModule } from '@nestjs/axios';
import { UserModule } from 'src/user/user.module';
import { ApnsService } from 'src/apns/apns.service';

@Module({
  imports: [HttpModule, UserModule],
  controllers: [InformationController],
  providers: [InformationService, ApnsService],
  exports: [InformationService],
})
export class InformationModule {}
