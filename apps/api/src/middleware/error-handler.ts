import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError, type ErrorField } from '../errors.js';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: ErrorField[];
  };
  requestId: string;
}

function envelope(
  requestId: string,
  code: string,
  message: string,
  fields?: ErrorField[]
): ErrorEnvelope {
  return fields?.length
    ? { error: { code, message, fields }, requestId }
    : { error: { code, message }, requestId };
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const requestId = (response.locals.requestId as string | undefined) ?? randomUUID();
  if (error instanceof HttpError) {
    response
      .status(error.statusCode)
      .json(envelope(requestId, error.code, error.message, error.fields));
    return;
  }

  if (error instanceof ZodError) {
    const fields = error.issues.map((issue) => ({
      field: issue.path.length ? issue.path.join('.') : 'request',
      message: issue.message
    }));
    response
      .status(422)
      .json(
        envelope(requestId, 'VALIDATION_ERROR', 'The request contains invalid fields.', fields)
      );
    return;
  }

  const errorRecord =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  if (errorRecord.type === 'entity.parse.failed') {
    response
      .status(400)
      .json(envelope(requestId, 'MALFORMED_JSON', 'The request body is not valid JSON.'));
    return;
  }
  if (errorRecord.type === 'entity.too.large') {
    response
      .status(413)
      .json(envelope(requestId, 'PAYLOAD_TOO_LARGE', 'The request body is too large.'));
    return;
  }

  console.error(
    `[${requestId}] Unhandled API error: ${error instanceof Error ? error.name : 'UnknownError'}`
  );
  response.status(500).json(envelope(requestId, 'INTERNAL_ERROR', 'An unexpected error occurred.'));
};

export function createErrorEnvelope(
  response: { locals: Record<string, unknown> },
  code: string,
  message: string
): ErrorEnvelope {
  const requestId = (response.locals.requestId as string | undefined) ?? randomUUID();
  return envelope(requestId, code, message);
}
