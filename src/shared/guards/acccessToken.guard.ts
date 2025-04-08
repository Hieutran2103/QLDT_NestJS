/* eslint-disable @typescript-eslint/no-unsafe-argument */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { TokenService } from '../token/token.service';
import { REQUEST_USER_KEY } from '../constants/auth-constant';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const accessToken = request.headers?.authorization?.split(' ')[1];

    if (!accessToken) {
      throw new UnauthorizedException('Token is missing');
    }

    try {
      request[REQUEST_USER_KEY] =
        await this.tokenService.verifyAccessToken(accessToken);
      return true;
    } catch (e) {
      throw new UnauthorizedException(e);
    }
  }
}
