import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as firebase from 'firebase-admin';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly userService: UserService) {}

  private extractToken(req: any): string | null {
    // 1) Authorization: Bearer <token>
    const bearer = req.headers?.authorization;
    if (bearer?.startsWith('Bearer ')) return bearer.replace('Bearer ', '');

    // 2) HttpOnly Cookie
    return req.cookies?.access_token ?? null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const token = this.extractToken(request);
    if (!token) throw new ForbiddenException('Access Denied');

    try {
      const decodedToken = await firebase.auth().verifyIdToken(token);

      request.user = await this.userService.oauthSync(
        decodedToken.uid,
        decodedToken.email,
      );

      return true;
    } catch (error) {
      return false;
    }
  }
}
