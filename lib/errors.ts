/* eslint-disable max-classes-per-file -- AuthException extends ApiException; they belong together */
export class ApiException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiException';
  }
}

export class AuthException extends ApiException {
  constructor(message: string) {
    super(message);
    this.name = 'AuthException';
  }
}
