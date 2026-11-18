/** What a calculation worker answers with. */
export type WorkerReply<Result> = { result: Result } | { error: string };

/** The reply to send from inside a worker for a calculation that may throw. */
export function reply<Request, Result>(compute: (request: Request) => Result, request: Request): WorkerReply<Result> {
  try {
    return { result: compute(request) };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "The calculation failed." };
  }
}
