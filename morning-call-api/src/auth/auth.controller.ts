import {
  Controller,
  Post,
  Body,
  Res,
  UnauthorizedException,
  Get,
} from '@nestjs/common';
import { Response } from 'express';
import * as admin from 'firebase-admin';
import { UserService } from '../user/user.service';
import { join } from 'path';

@Controller()
export class AuthController {
  constructor(private readonly userService: UserService) {}

  /**
   * 프론트에서 Firebase ID Token을 보내주면
   * 1) 검증 → DB 동기화
   * 2) JSON 응답 + HttpOnly 쿠키 병행 세팅
   */
  @Post('auth/cookie')
  async loginWithGoogle(
    @Body('idToken') idToken: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idToken) throw new UnauthorizedException();

    const decoded = await admin.auth().verifyIdToken(idToken);
    const user = await this.userService.oauthSync(decoded.uid, decoded.email);

    res.cookie('access_token', idToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 1 * 24 * 60 * 60 * 1000, // 1 days
    });

    return { accessToken: idToken, user };
  }

  @Get('admin/auth')
  getLogin(@Res() res: Response) {
    return res.sendFile(join(__dirname, '../../../', 'public', 'login.html'));
  }

  @Post('auth/logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    return { ok: true };
  }
}
