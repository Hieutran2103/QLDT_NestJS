import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { HashingModule } from 'src/shared/hash/hashing.module';

import { TokenModule } from 'src/shared/token/token.module';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  imports: [HashingModule, TokenModule],
})
export class AuthModule {}
