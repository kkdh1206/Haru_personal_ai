import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeviceTokenDto } from './dto/device-token.dto';
import { CalendarTokenDto } from './dto/calendar-token.dto';
import { CustomMessageDto } from './dto/custom-message.dto';

@ApiTags('User')
@UseGuards(AuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '유저 확인 및 등록',
    description:
      '엑세스 토큰을 바탕으로 유저를 확인하고 없다면 새로 생성합니다.\n\n' +
      '앱에서 로그인 후에 꼭 호출해주세요.',
  })
  checkAndRegister(@Req() req) {
    return req.user;
  }

  @Patch('device-token')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '디바이스 토큰 업데이트',
    description: '푸시알림을 위한 디바이스 토큰을 업데이트합니다.',
  })
  async updateDeviceToken(@Req() req, @Body() dto: DeviceTokenDto) {
    const updated = await this.userService.updateDeviceToken(
      req.user._id,
      dto.deviceToken,
    );
    if (!updated) return 'failed';
    return 'updated';
  }

  @Patch('calendar-token')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '캘린더 토큰 업데이트',
    description: '구글 캘린더 토큰을 업데이트합니다.',
  })
  async updateCalendarToken(@Req() req, @Body() dto: CalendarTokenDto) {
    const updated = await this.userService.updateCalendarToken(
      req.user._id,
      dto.calendarAccessToken,
      dto.calendarRefreshToken,
    );
    if (!updated) return 'failed';
    return 'updated';
  }

  @Patch('custom-message')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '유저 커스텀 메세지 업데이트',
    description: '유저가 듣고 싶은 custom message를 업데이트합니다.',
  })
  async updateCustomMessage(@Req() req, @Body() dto: CustomMessageDto) {
    const updated = await this.userService.updateCustomMessage(
      req.user._id,
      dto.customMessage,
    );
    if (!updated) return 'failed';
    return 'updated';
  }

  @Put()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '유저 정보 업데이트',
    description: '유저 정보를 업데이트합니다.',
  })
  async update(@Req() req, @Body() updateUserDto: UpdateUserDto) {
    const updated = await this.userService.update(req.user._id, updateUserDto);
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }
}
