/** A refusal the person can act on: a code the app translates, an HTTP status and a plain message. */
export class LessonError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message = code) {
    super(message);
    this.name = "LessonError";
    this.code = code;
    this.status = status;
  }
}
