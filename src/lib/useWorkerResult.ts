import { useEffect, useRef, useState } from "react";
import type { WorkerReply } from "./workerReply";

export interface WorkerState<Result> {
  /** The latest result worked out. While a newer calculation runs this is the previous one. */
  result: Result | undefined;
  /** True while the result on screen is for an earlier version of the input. */
  pending: boolean;
  /** Set when the calculation failed for this input. */
  error?: string;
}

/** Wait this long after the last change before starting, so a burst of edits is one calculation. */
const SETTLE_MS = 120;

/**
 * Builds a hook that runs one calculation in a Web Worker so the page stays responsive. `spawn`
 * starts a worker that answers one request with a `WorkerReply`; `compute` is the same
 * calculation on the page's own thread, used when a worker cannot start. The hook's `key` must
 * change whenever the request changes in a way that changes the result; with a null request
 * nothing is calculated. A result already worked out for a key is returned at once, and while a
 * new one is on its way the previous result stays and `pending` is true.
 */
export function createWorkerHook<Request, Result>(
  spawn: () => Worker,
  compute: (request: Request) => Result,
  keep = 24,
): (key: string, request: Request | null) => WorkerState<Result> {
  const finished = new Map<string, Result>();
  const remember = (key: string, result: Result): void => {
    finished.delete(key);
    finished.set(key, result);
    while (finished.size > keep) finished.delete(finished.keys().next().value as string);
  };

  return function useWorkerResult(key, request) {
    const requestRef = useRef(request);
    requestRef.current = request;
    const [arrived, setArrived] = useState<{ key: string; result?: Result; error?: string } | null>(null);
    const lastGood = useRef<Result | undefined>(undefined);

    const cached = request ? finished.get(key) : undefined;

    useEffect(() => {
      const current = requestRef.current;
      if (!current || finished.has(key)) return;
      let worker: Worker | null = null;
      const done = (reply: WorkerReply<Result>) => {
        if ("error" in reply) {
          setArrived({ key, error: reply.error });
          return;
        }
        remember(key, reply.result);
        setArrived({ key, result: reply.result });
      };
      const inline = () => {
        try {
          done({ result: compute(current) });
        } catch (caught) {
          done({ error: caught instanceof Error ? caught.message : "The calculation failed." });
        }
      };
      const timer = setTimeout(() => {
        if (typeof Worker === "undefined") {
          inline();
          return;
        }
        try {
          worker = spawn();
          worker.onmessage = (event: MessageEvent<WorkerReply<Result>>) => {
            worker?.terminate();
            done(event.data);
          };
          worker.onerror = () => {
            worker?.terminate();
            inline();
          };
          worker.postMessage(current);
        } catch {
          inline();
        }
      }, SETTLE_MS);
      return () => {
        clearTimeout(timer);
        worker?.terminate();
      };
    }, [key]);

    if (!request) {
      lastGood.current = undefined;
      return { result: undefined, pending: false };
    }
    if (cached !== undefined) {
      lastGood.current = cached;
      return { result: cached, pending: false };
    }
    if (arrived && arrived.key === key) {
      if (arrived.error) return { result: undefined, pending: false, error: arrived.error };
      if (arrived.result !== undefined) {
        lastGood.current = arrived.result;
        return { result: arrived.result, pending: false };
      }
    }
    return { result: lastGood.current, pending: true };
  };
}
