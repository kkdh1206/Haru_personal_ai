import {
  Body,
  Controller,
  Delete,
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
import { LocationDto } from './dto/location.dto';
import { CalendarCodeDto } from './dto/calendar-code.dto';

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
      dto.deviceType ?? 'ios',
      dto.notificationToken,
      dto.apnsEnvironment,
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

  @Patch('calendar-code')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '구글 캘린더 auth code 교환',
    description:
      'Android Google Sign-In serverAuthCode를 서버에서 access/refresh token으로 교환해 저장합니다.',
  })
  async updateCalendarTokenFromCode(@Req() req, @Body() dto: CalendarCodeDto) {
    return this.userService.updateCalendarTokenFromAuthCode(
      req.user._id,
      dto.serverAuthCode,
    );
  }

  @Get('calendar-status')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '구글 캘린더 연동 상태 확인',
    description: '사용자의 구글 캘린더 토큰 저장 여부를 확인합니다.',
  })
  async getCalendarStatus(@Req() req) {
    return this.userService.getCalendarStatus(req.user._id);
  }

  @Delete('calendar-token')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '구글 캘린더 연동 해제',
    description: '저장된 구글 캘린더 토큰을 삭제합니다.',
  })
  async disconnectCalendar(@Req() req) {
    const updated = await this.userService.disconnectCalendar(req.user._id);
    if (!updated) throw new NotFoundException('User not found');
    return { connected: false };
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

  @Patch('location')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '유저 위치 업데이트',
    description: '날씨 제공을 위한 현재 위치와 타임존을 업데이트합니다.',
  })
  async updateLocation(@Req() req, @Body() dto: LocationDto) {
    const updated = await this.userService.updateLocation(
      req.user._id,
      dto.location,
      dto.timeZone,
    );
    if (!updated) throw new NotFoundException('User not found');
    return updated;
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

  @Delete()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '계정 탈퇴',
    description: '사용자 정보와 연결된 알람, 메모리, 캘린더 토큰을 삭제합니다.',
  })
  async deleteAccount(@Req() req) {
    const deleted = await this.userService.deleteAccount(req.user._id);
    if (!deleted) throw new NotFoundException('User not found');
    return deleted;
  }
}
