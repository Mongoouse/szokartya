import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Az adatbázis-réteg ismert hibáit HTTP válasszá alakítja, hogy a belső
 * részletek (táblanevek, SQL) ne szivárogjanak ki a kliens felé.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const [status, message] = this.map(exception);
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
    }
    response.status(status).json({ statusCode: status, message, error: HttpStatus[status] });
  }

  private map(e: Prisma.PrismaClientKnownRequestError): [HttpStatus, string] {
    switch (e.code) {
      case 'P2002': // unique constraint
        return [HttpStatus.CONFLICT, 'Az erőforrás már létezik'];
      case 'P2003': // foreign key
        return [HttpStatus.UNPROCESSABLE_ENTITY, 'Hivatkozott erőforrás nem létezik'];
      case 'P2025': // record not found
        return [HttpStatus.NOT_FOUND, 'Az erőforrás nem található'];
      case 'P2034': // write conflict / deadlock – a kliens újrapróbálhatja
        return [HttpStatus.CONFLICT, 'Párhuzamos módosítás, próbáld újra'];
      default:
        return [HttpStatus.INTERNAL_SERVER_ERROR, 'Belső hiba'];
    }
  }
}
