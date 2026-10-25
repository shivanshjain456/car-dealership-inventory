export interface ErrorField {
  field: string;
  message: string;
}

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fields: ErrorField[] | undefined;

  constructor(statusCode: number, code: string, message: string, fields?: ErrorField[]) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
  }
}
