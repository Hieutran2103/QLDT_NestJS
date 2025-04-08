/* eslint-disable prettier/prettier */
export interface TokenPayload {
  id: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}
