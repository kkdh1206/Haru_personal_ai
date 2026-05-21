import { Controller, Get, Render } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('terms')
  @Render('terms')
  getTerms() {
    return {
      updatedAt: '2026년 5월 21일',
    };
  }

  @Get('privacy')
  @Render('privacy')
  getPrivacy() {
    return {
      updatedAt: '2026년 5월 21일',
    };
  }
}
