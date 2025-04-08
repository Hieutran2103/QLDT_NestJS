import { Global, Module } from '@nestjs/common';
import { PrismaService } from './services/prisma.service';

// import { JwtModule } from '@nestjs/jwt';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],

  // imports: [JwtModule],
})
export class SharedModule {}
