import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt'; // Import JwtService từ @nestjs/jwt
import { TokenPayload } from './jwt.type';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccessToken(payload: {
    id: string;
    email: string;
    name: string;
    roleId: string;
  }) {
    const accessTokenExpiresIn = this.configService.get<string>(
      'ACCESS_JWT_TOKEN_EXPIRES_IN',
    );
    const accessTokenSecret =
      this.configService.get<string>('ACCESS_JWT_SECRET');

    console.log(accessTokenSecret);
    return this.jwtService.sign(payload, {
      expiresIn: accessTokenExpiresIn,
      secret: accessTokenSecret,
      algorithm: 'HS256',
    });
  }

  signRefreshToken(payload: {
    id: string;
    email: string;
    name: string;
    roleId: string;
  }) {
    const refreshTokenExpiresIn = this.configService.get<string>(
      'REFRESH_JWT_TOKEN_EXPIRES_IN',
    );
    const refreshTokenSecret =
      this.configService.get<string>('REFRESH_JWT_SECRET');

    return this.jwtService.sign(payload, {
      expiresIn: refreshTokenExpiresIn,
      secret: refreshTokenSecret,
      algorithm: 'HS256',
    });
  }

  verifyAccessToken(token: string): Promise<TokenPayload> {
    const accessTokenSecret =
      this.configService.get<string>('ACCESS_JWT_SECRET');
    return this.jwtService.verifyAsync(token, {
      secret: accessTokenSecret,
      algorithms: ['HS256'],
    });
  }

  verifyRefreshToken(token: string): Promise<TokenPayload> {
    const refreshTokenSecret =
      this.configService.get<string>('REFRESH_JWT_SECRET');
    return this.jwtService.verifyAsync(token, {
      secret: refreshTokenSecret,
      algorithms: ['HS256'],
    });
  }
}
