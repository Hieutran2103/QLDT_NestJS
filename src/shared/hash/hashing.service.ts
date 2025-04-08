import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcrypt';

const saltOrRounds = 10;

@Injectable()
export class HashingService {
  hash(value: string) {
    return hash(value, saltOrRounds);
  }

  compareHash(value: string, hash: string) {
    return compare(value, hash);
  }
}
