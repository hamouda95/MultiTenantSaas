import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { HrAccessDenied, HrValidationError } from "./hr.domain";
@Catch(HrAccessDenied, HrValidationError)
export class HrErrorFilter implements ExceptionFilter {
  catch(error: HrAccessDenied | HrValidationError, host: ArgumentsHost) {
    const status = error instanceof HrAccessDenied ? 403 : 400;
    host
      .switchToHttp()
      .getResponse()
      .status(status)
      .json({ statusCode: status, message: error.message });
  }
}
