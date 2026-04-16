import { Controller, Get, Param } from '@nestjs/common';
import { InformationService } from './information.service';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@Controller('information')
export class InformationController {
  constructor(private readonly informationService: InformationService) {}

  // TODO: 테스트 완료되면 해당 라우터 삭제
  @Get('refill-news')
  async refillNews() {
    // 뉴스기사 크롤링은 하루 한번(Cron으로 처리) 요청 후 Redis에 저장
    await this.informationService.checkInformation();
  }

  @Get('news/:topic')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '뉴스 조회',
    description: '뉴스를 조회합니다.',
  })
  async getRssNews(@Param('topic') topic: string) {
    return await this.informationService.getCurrentNews(topic);
  }

  @Get('weather/:loc')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '날씨 조회',
    description: '날씨를 조회합니다.',
  })
  async getWeather(@Param('loc') location: string) {
    return await this.informationService.getCurrentWeather(location);
  }
}
