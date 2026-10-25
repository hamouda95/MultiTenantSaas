import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Input validation failed',
          details: errorMessages,
        });
      }
      throw new BadRequestException('Validation failed');
    }
  }
}
