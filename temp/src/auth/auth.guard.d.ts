import { CanActivate, ExecutionContext } from '@nestjs/common';
import { UserService } from '../user/user.service';
export declare class AuthGuard implements CanActivate {
    private readonly userService;
    constructor(userService: UserService);
    private extractToken;
    canActivate(context: ExecutionContext): Promise<boolean>;
}
